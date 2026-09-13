do $$ begin
  if not exists (select 1 from pg_type where typname = 'event_member_role') then
    create type public.event_member_role as enum ('cohost','viewer');
  end if;
end $$;

create table if not exists public.event_members (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(id) on delete cascade,
  invited_email text not null,
  user_id uuid references auth.users(id) on delete set null,
  role public.event_member_role not null default 'cohost',
  status text not null default 'invited' check (status in ('invited','active','revoked')),
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists event_members_event_email_key
  on public.event_members (event_id, lower(invited_email));
create index if not exists event_members_user_idx on public.event_members (user_id) where status = 'active';

grant select, insert, update, delete on public.event_members to authenticated;
grant all on public.event_members to service_role;

alter table public.event_members enable row level security;

create or replace function public.owns_event(_event_id text, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.events e where e.id = _event_id and e.user_id = _user_id)
$$;

create or replace function public.event_collaborator_role(_event_id text, _user_id uuid)
returns public.event_member_role language sql stable security definer set search_path = public as $$
  select m.role from public.event_members m
   where m.event_id = _event_id and m.user_id = _user_id and m.status = 'active'
   limit 1
$$;

create or replace function public.is_event_collaborator(_event_id text, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.event_collaborator_role(_event_id, _user_id) is not null
$$;

create or replace function public.can_edit_event(_event_id text, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.event_collaborator_role(_event_id, _user_id) = 'cohost'::public.event_member_role
$$;

drop policy if exists "Hosts manage collaborators" on public.event_members;
create policy "Hosts manage collaborators" on public.event_members
  for all to authenticated
  using (public.owns_event(event_id, auth.uid()) or has_role(auth.uid(), 'owner'::app_role) or has_role(auth.uid(), 'admin'::app_role))
  with check (public.owns_event(event_id, auth.uid()) or has_role(auth.uid(), 'owner'::app_role) or has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Collaborators read their membership" on public.event_members;
create policy "Collaborators read their membership" on public.event_members
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Collaborators read their events" on public.events;
create policy "Collaborators read their events" on public.events
  for select to authenticated
  using (public.is_event_collaborator(id, auth.uid()));

drop policy if exists "Co-hosts update their events" on public.events;
create policy "Co-hosts update their events" on public.events
  for update to authenticated
  using (public.can_edit_event(id, auth.uid()))
  with check (public.can_edit_event(id, auth.uid()));

create or replace function public.accept_event_member_invite(_token text)
returns text language plpgsql security definer set search_path = public as $$
declare
  m public.event_members;
  uid uuid := auth.uid();
  email text;
begin
  if uid is null then raise exception 'Sign in to accept this invitation'; end if;
  select * into m from public.event_members where token = _token;
  if m.id is null then raise exception 'This invitation link is no longer valid'; end if;
  if m.status = 'revoked' then raise exception 'This invitation was withdrawn'; end if;
  select lower(u.email) into email from auth.users u where u.id = uid;
  if lower(m.invited_email) <> coalesce(email, '') then
    raise exception 'This invitation was sent to a different email address';
  end if;
  update public.event_members
     set user_id = uid, status = 'active', accepted_at = coalesce(accepted_at, now())
   where id = m.id;
  return m.event_id;
end $$;

revoke all on function public.accept_event_member_invite(text) from public, anon;
grant execute on function public.accept_event_member_invite(text) to authenticated;