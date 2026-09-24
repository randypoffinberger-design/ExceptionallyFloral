// npm install --no-save @electric-sql/pglite, or expose it via NODE_PATH.
// Emulates Supabase's role/storage scaffolding; hosted HTTP checks remain required.
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated;
 create schema auth; create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public to anon,authenticated;
 create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated;
 grant select,insert,update,delete on storage.objects to anon,authenticated;
 grant usage on all sequences in schema storage to anon,authenticated;`);
 for(const file of ['schema.sql','seed.sql','security-tests.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8'));
 await db.exec(`begin;
 insert into auth.users values('10000000-0000-0000-0000-000000000001','test@example.invalid');
 insert into private.editors values('10000000-0000-0000-0000-000000000001');
 select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
 set local role authenticated;
 insert into storage.objects(bucket_id,name) values('site-photos','uploads/10000000-0000-0000-0000-000000000001.jpg');
 do $$ declare d jsonb; r bigint; begin
 select content,revision into d,r from public.site_draft where id=1;
 d:=jsonb_set(d,'{collections,0,pieces,0,image}','"uploads/10000000-0000-0000-0000-000000000001.jpg"');
 perform public.save_draft(d,r);
 end $$;
 reset role;
 select set_config('request.jwt.claim.sub','',true);set local role anon;
 do $$ begin
 if (select count(*) from storage.objects)<>0 then raise exception 'Private draft image leaked';end if;
 begin insert into storage.objects(bucket_id,name) values('site-photos','uploads/10000000-0000-0000-0000-000000000002.jpg');raise exception 'Anonymous upload allowed';exception when insufficient_privilege then null;end;
 end $$;
 reset role;select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);set local role authenticated;
 select public.publish_draft((select revision from public.site_draft where id=1));
 reset role;select set_config('request.jwt.claim.sub','',true);set local role anon;
 do $$ begin if (select count(*) from storage.objects)<>1 then raise exception 'Published image inaccessible';end if;end $$;
 reset role;rollback;`);
 await db.close();console.log('Database checks passed: schema, seed, roles, private drafts, denied direct writes, conflicts, publication filtering, private uploads and published photo access.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
