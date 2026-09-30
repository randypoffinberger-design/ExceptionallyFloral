begin;
create table private.owners(user_id uuid primary key references auth.users(id) on delete restrict);
alter table private.owners enable row level security;
create table private.editor_activity(
 id bigint generated always as identity primary key,
 occurred_at timestamptz not null default clock_timestamp(),
 actor uuid, actor_email text not null, action text not null,
 revision bigint, before_content jsonb, after_content jsonb, details jsonb not null default '{}'
);
alter table private.editor_activity enable row level security;
create table private.invite_attempts(actor uuid primary key, attempted_at timestamptz not null);
alter table private.invite_attempts enable row level security;
revoke all on private.owners,private.editor_activity,private.invite_attempts from public,anon,authenticated;

create function public.owner_check() returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from private.owners where user_id=auth.uid()) then raise exception 'Only the owner can manage users.' using errcode='42501'; end if;
 return true;
end $$;
create function public.editor_profile() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.editor_check();
 return jsonb_build_object('owner',exists(select 1 from private.owners where user_id=auth.uid()));
end $$;
create function private.record_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare email text;
begin
 select u.email into email from auth.users u where u.id=auth.uid();
 insert into private.editor_activity(actor,actor_email,action,revision,before_content,after_content)
 values(auth.uid(),coalesce(email,'Project administrator'),case when tg_table_name='site_draft' then 'Saved draft' else 'Published website' end,new.revision,case when tg_op='UPDATE' then old.content else null end,new.content);
 return new;
end $$;
create trigger audit_draft after update on public.site_draft for each row execute function private.record_activity();
create trigger audit_public after insert or update on public.site_public for each row execute function private.record_activity();
-- Import known publication authors; historical draft authors were not recorded.
insert into private.editor_activity(occurred_at,actor,actor_email,action,revision,after_content,details)
 select h.published_at,h.actor,coalesce(u.email,'Unknown historical account'),'Published website',h.revision,h.content,'{"historical":true}'::jsonb
 from private.publish_history h left join auth.users u on u.id=h.actor order by h.id;
create function public.editor_history(before_id bigint default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.editor_check();
 return coalesce((select jsonb_agg(to_jsonb(a) order by a.id desc) from
 (select id,occurred_at,actor_email,action,revision,before_content,after_content,details from private.editor_activity where before_id is null or id<before_id order by id desc limit 10) a),'[]'::jsonb);
end $$;
create function public.owner_users() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.owner_check();
 return coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'owner',o.user_id is not null,'accepted',u.email_confirmed_at is not null) order by u.email)
 from private.editors e join auth.users u on u.id=e.user_id left join private.owners o on o.user_id=e.user_id),'[]'::jsonb);
end $$;
create function public.owner_find_user(target_email text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.owner_check();
 return (select jsonb_build_object('id',id,'confirmed',email_confirmed_at is not null) from auth.users where lower(email)=lower(trim(target_email)) limit 1);
end $$;
create function public.owner_invite_check() returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform public.owner_check();
 insert into private.invite_attempts(actor,attempted_at) values(auth.uid(),clock_timestamp())
 on conflict(actor) do update set attempted_at=excluded.attempted_at where private.invite_attempts.attempted_at < clock_timestamp()-interval '10 seconds';
 if not found then raise exception 'Please wait ten seconds before another invitation.'; end if;
 return true;
end $$;
create function public.owner_grant_editor(target_email text) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; email text;
begin
 perform public.owner_check();
 select id,u.email into target,email from auth.users u where lower(u.email)=lower(trim(target_email));
 if target is null then raise exception 'Account not found. Create an invitation first.'; end if;
 insert into private.editors(user_id) values(target) on conflict do nothing;
 if found then insert into private.editor_activity(actor,actor_email,action,details)
 values(auth.uid(),(select u.email from auth.users u where u.id=auth.uid()),'Granted editor access',jsonb_build_object('email',email)); end if;
 return target;
end $$;
create function public.owner_remove_editor(target_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare email text;
begin
 perform public.owner_check();
 if exists(select 1 from private.owners where user_id=target_user) then raise exception 'The owner account cannot be removed here.'; end if;
 select u.email into email from auth.users u where u.id=target_user;
 delete from private.editors where user_id=target_user;
 if found then insert into private.editor_activity(actor,actor_email,action,details)
 values(auth.uid(),(select u.email from auth.users u where u.id=auth.uid()),'Removed editor access',jsonb_build_object('email',email)); end if;
end $$;
revoke all on function private.record_activity() from public,anon,authenticated;
revoke all on function public.owner_check(),public.editor_profile(),public.editor_history(bigint),public.owner_users(),public.owner_find_user(text),public.owner_invite_check(),public.owner_grant_editor(text),public.owner_remove_editor(uuid) from public,anon,authenticated;
grant execute on function public.owner_check(),public.editor_profile(),public.editor_history(bigint),public.owner_users(),public.owner_find_user(text),public.owner_invite_check(),public.owner_grant_editor(text),public.owner_remove_editor(uuid) to authenticated;
commit;
