-- Staging only. Run AFTER schema.sql and seed.sql. All fixtures roll back.
begin;
insert into auth.users(id,email) values('10000000-0000-0000-0000-000000000001','editor-security-test@example.invalid');
insert into private.editors(user_id) values('10000000-0000-0000-0000-000000000001');
set local role anon;
do $$ begin
  if public.is_editor() then raise exception 'FAIL: anonymous editor'; end if;
  if (select count(*) from public.site_public)<>1 then raise exception 'FAIL: public read'; end if;
  begin perform content from public.site_draft; raise exception 'FAIL: anonymous draft read'; exception when insufficient_privilege then null; end;
  begin perform public.publish_draft(0); raise exception 'FAIL: anonymous publish'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.site_draft)<>0 then raise exception 'FAIL: unauthorized draft read'; end if;
  begin perform public.editor_check(); raise exception 'FAIL: unauthorized editor'; exception when insufficient_privilege then null; end;
  begin perform public.save_draft('{}',0); raise exception 'FAIL: unauthorized save'; exception when insufficient_privilege then null; end;
  begin perform public.publish_draft(0); raise exception 'FAIL: unauthorized publish'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ declare document jsonb; rev bigint; next_rev bigint; begin
  perform public.editor_check();
  select content,revision into document,rev from public.site_draft where id=1;
  begin update public.site_public set content='{}' where id=1; raise exception 'FAIL: direct write'; exception when insufficient_privilege then null; end;
  document:=jsonb_set(document,'{collections,0,pieces,0,status}','"Sold"');
  document:=jsonb_set(document,'{collections,0,pieces,1,status}','"Hidden"');
  document:=jsonb_set(document,'{collections,1,hidden}','true');
  next_rev:=public.save_draft(document,rev);
  begin perform public.save_draft(document,rev); raise exception 'FAIL: stale save'; exception when serialization_failure then null; end;
  begin perform public.publish_draft(rev); raise exception 'FAIL: stale publish'; exception when serialization_failure then null; end;
  perform public.publish_draft(next_rev);
  if (select jsonb_array_length(content->'collections') from public.site_public where id=1)<>1 then raise exception 'FAIL: hidden collection leaked'; end if;
  if (select jsonb_array_length(content->'collections'->0->'pieces') from public.site_public where id=1)<>9 then raise exception 'FAIL: hidden piece leaked'; end if;
  if (select content->'collections'->0->'pieces'->0->>'status' from public.site_public where id=1)<>'Sold' then raise exception 'FAIL: sold status'; end if;
end $$;
reset role;
rollback;
-- Success: no FAIL exceptions. Real storage HTTP checks are listed in ADMIN-SETUP.md.
