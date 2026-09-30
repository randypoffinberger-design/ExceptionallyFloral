-- Existing projects: run before deploying the optional piece fields.
-- Replaces functions only; preserves content, revisions, grants, history and photos.
begin;
create or replace function private.validate_content(document jsonb) returns void language plpgsql set search_path='' as $$
declare c jsonb; p jsonb; k text; ids text[] := '{}'; identifier text;
begin
  if document->>'schemaVersion' is distinct from '1' or jsonb_typeof(document->'collections') is distinct from 'array' or jsonb_typeof(document->'text') is distinct from 'object' or octet_length(document::text)>1000000 then raise exception 'Invalid content document'; end if;
  if jsonb_array_length(document->'collections')>50 then raise exception 'At most 50 collections'; end if;
  if (select count(*) from jsonb_object_keys(document->'text'))<>5 then raise exception 'Invalid text fields'; end if;
  foreach k in array array['intro','creations','note','about','contact'] loop
    if jsonb_typeof(document->'text'->k) is distinct from 'string' or length(document->'text'->>k)>3000 then raise exception 'Invalid public text'; end if;
  end loop;
  for c in select value from jsonb_array_elements(document->'collections') loop
    identifier:=c->>'id';
    if identifier is null or identifier!~'^[a-z0-9-]{1,100}$' or identifier=any(ids) then raise exception 'Invalid collection ID'; end if; ids:=array_append(ids,identifier);
    if jsonb_typeof(c->'name') is distinct from 'string' or length(trim(c->>'name')) not between 1 and 120 or jsonb_typeof(c->'description') is distinct from 'string' or length(c->>'description')>3000 or jsonb_typeof(c->'hidden') is distinct from 'boolean' or coalesce(c->>'layout','') not in ('original','even','large') or jsonb_typeof(c->'pieces') is distinct from 'array' then raise exception 'Invalid collection'; end if;
    if jsonb_array_length(c->'pieces')>200 then raise exception 'At most 200 pieces per collection'; end if;
    for p in select value from jsonb_array_elements(c->'pieces') loop
      identifier:=p->>'id';
      if identifier is null or identifier!~'^[a-z0-9-]{1,100}$' or identifier=any(ids) then raise exception 'Invalid piece ID'; end if; ids:=array_append(ids,identifier);
      if p ? 'serialNumber' and jsonb_typeof(p->'serialNumber') is distinct from 'string' then raise exception 'Serial number must be text'; end if;
      if p ? 'price' then
        if jsonb_typeof(p->'price') is distinct from 'string' then raise exception 'Invalid price'; end if;
        if btrim(p->>'price', E' \t\n\r') <> '' then
          if btrim(p->>'price', E' \t\n\r') !~ '^[0-9]+([.][0-9]{1,2})?$' then raise exception 'Invalid price'; end if;
          if (p->>'price')::numeric > 9999999999.99 then raise exception 'Invalid price'; end if;
        end if;
      end if;
      if jsonb_typeof(p->'name') is distinct from 'string' or length(trim(p->>'name')) not between 1 and 120 or jsonb_typeof(p->'alt') is distinct from 'string' or length(p->>'alt')>500 or coalesce(p->>'status','') not in ('Available','Sold','Made to Order','Hidden') or coalesce(p->>'inventoryType','') not in ('one-off','made-to-order') or jsonb_typeof(p->'image') is distinct from 'string' or length(p->>'image')>300 or (p->>'image')!~*'^(assets/[A-Za-z0-9% ._-]+\.(png|jpg|jpeg|webp)|uploads/[a-f0-9-]+\.jpg)$' then raise exception 'Invalid piece'; end if;
    end loop;
  end loop;
end $$;

create or replace function public.publish_draft(expected_revision bigint) returns bigint language plpgsql security definer set search_path='' as $$
declare document jsonb; current_revision bigint; published jsonb; c jsonb; p jsonb; collections jsonb:='[]'; pieces jsonb;
begin
  perform public.editor_check();
  select content,revision into document,current_revision from public.site_draft where id=1 for update;
  if current_revision is null or current_revision is distinct from expected_revision then raise exception 'Draft changed. Reload and preview the latest draft before publishing.' using errcode='40001'; end if;
  perform private.validate_content(document);
  for c in select value from jsonb_array_elements(document->'collections') loop
    if (c->>'hidden')::boolean then continue; end if;
    pieces:='[]';
    for p in select value from jsonb_array_elements(c->'pieces') loop
      if p->>'status'='Hidden' then continue; end if;
      if p->>'image' like 'uploads/%' and not exists(select 1 from storage.objects where bucket_id='site-photos' and name=p->>'image') then raise exception 'A photo is missing. Upload it again before publishing.'; end if;
      pieces:=pieces||jsonb_build_array(jsonb_build_object('id',p->>'id','name',p->>'name','alt',p->>'alt','image',p->>'image','status',p->>'status','inventoryType',p->>'inventoryType') || (case when p ? 'serialNumber' then jsonb_build_object('serialNumber',p->'serialNumber') else '{}'::jsonb end) || (case when p ? 'price' then jsonb_build_object('price',p->'price') else '{}'::jsonb end));
    end loop;
    collections:=collections||jsonb_build_array(jsonb_build_object('id',c->>'id','name',c->>'name','description',c->>'description','hidden',false,'layout',c->>'layout','pieces',pieces));
  end loop;
  published:=jsonb_build_object('schemaVersion',1,'text',document->'text','collections',collections);
  insert into private.publish_history(content,revision,actor) values(document,current_revision,auth.uid());
  insert into public.site_public(id,content,revision) values(1,published,current_revision) on conflict(id) do update set content=excluded.content,revision=excluded.revision,published_at=now();
  return current_revision;
end $$;
commit;
