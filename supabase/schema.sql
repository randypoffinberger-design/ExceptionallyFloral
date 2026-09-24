-- Run once in a NEW Supabase project's SQL editor, then run seed.sql.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.editors (user_id uuid primary key references auth.users(id) on delete cascade);
create function public.is_editor() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.editors where user_id = (select auth.uid()));
$$;
revoke all on function public.is_editor() from public;
grant execute on function public.is_editor() to anon, authenticated;
create function public.editor_check() returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_editor() then raise exception 'This account is not an approved editor.' using errcode='42501'; end if;
  return true;
end $$;
revoke all on function public.editor_check() from public;
grant execute on function public.editor_check() to authenticated;

create table public.site_draft(id integer primary key check(id=1),content jsonb not null, revision bigint not null default 0,updated_at timestamptz not null default now());
create table public.site_public(id integer primary key check(id=1),content jsonb not null,revision bigint not null,published_at timestamptz not null default now());
create table private.publish_history(id bigint generated always as identity primary key,content jsonb not null,revision bigint not null,actor uuid, published_at timestamptz not null default now());
alter table public.site_draft enable row level security;
alter table public.site_public enable row level security;
revoke all on public.site_draft, public.site_public from anon, authenticated;
grant select on public.site_draft to authenticated;
grant select on public.site_public to anon, authenticated;
create policy editor_read_draft on public.site_draft for select to authenticated using(public.is_editor());
create policy published_read on public.site_public for select to anon,authenticated using(true);

create function private.validate_content(document jsonb) returns void language plpgsql set search_path='' as $$
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
      if jsonb_typeof(p->'name') is distinct from 'string' or length(trim(p->>'name')) not between 1 and 120 or jsonb_typeof(p->'alt') is distinct from 'string' or length(p->>'alt')>500 or coalesce(p->>'status','') not in ('Available','Sold','Made to Order','Hidden') or coalesce(p->>'inventoryType','') not in ('one-off','made-to-order') or jsonb_typeof(p->'image') is distinct from 'string' or length(p->>'image')>300 or (p->>'image')!~*'^(assets/[A-Za-z0-9% ._-]+\.(png|jpg|jpeg|webp)|uploads/[a-f0-9-]+\.jpg)$' then raise exception 'Invalid piece'; end if;
    end loop;
  end loop;
end $$;

create function public.save_draft(document jsonb, expected_revision bigint) returns bigint language plpgsql security definer set search_path='' as $$
declare current_revision bigint;
begin
  perform public.editor_check();
  perform private.validate_content(document);
  select revision into current_revision from public.site_draft where id=1 for update;
  if current_revision is null then raise exception 'Run seed.sql before editing.'; end if;
  if current_revision is distinct from expected_revision then raise exception 'Another editor saved a newer draft. Copy your changes before reloading this page.' using errcode='40001'; end if;
  update public.site_draft set content=document,revision=current_revision+1,updated_at=now() where id=1;
  return current_revision+1;
end $$;
revoke all on function public.save_draft(jsonb,bigint) from public;
grant execute on function public.save_draft(jsonb,bigint) to authenticated;

create function public.publish_draft(expected_revision bigint) returns bigint language plpgsql security definer set search_path='' as $$
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
      pieces:=pieces||jsonb_build_array(jsonb_build_object('id',p->>'id','name',p->>'name','alt',p->>'alt','image',p->>'image','status',p->>'status','inventoryType',p->>'inventoryType'));
    end loop;
    collections:=collections||jsonb_build_array(jsonb_build_object('id',c->>'id','name',c->>'name','description',c->>'description','hidden',false,'layout',c->>'layout','pieces',pieces));
  end loop;
  published:=jsonb_build_object('schemaVersion',1,'text',document->'text','collections',collections);
  insert into private.publish_history(content,revision,actor) values(document,current_revision,auth.uid());
  insert into public.site_public(id,content,revision) values(1,published,current_revision) on conflict(id) do update set content=excluded.content,revision=excluded.revision,published_at=now();
  return current_revision;
end $$;
revoke all on function public.publish_draft(bigint) from public;
grant execute on function public.publish_draft(bigint) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('site-photos','site-photos',false,5242880,array['image/jpeg']);
create function public.is_published_photo(path text) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.site_public s, lateral jsonb_array_elements(s.content->'collections') c, lateral jsonb_array_elements(c->'pieces') p where p->>'image'=path);
$$;
revoke all on function public.is_published_photo(text) from public;
grant execute on function public.is_published_photo(text) to anon,authenticated;
create policy photo_read on storage.objects for select to anon,authenticated using(bucket_id='site-photos' and (public.is_editor() or public.is_published_photo(name)));
create policy photo_upload on storage.objects for insert to authenticated with check(bucket_id='site-photos' and public.is_editor() and name ~ '^uploads/[a-f0-9-]+\.jpg$');
-- No update/delete policies: immutable image paths preserve published snapshots.
revoke all on all tables in schema private from public,anon,authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
commit;
