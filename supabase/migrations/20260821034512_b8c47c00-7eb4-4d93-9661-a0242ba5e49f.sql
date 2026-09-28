-- 1) Invitation expiry (14 days, matching pm_invites)
ALTER TABLE public.event_members
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days');

-- Existing pending invites: expire 14 days after they were sent.
UPDATE public.event_members
   SET expires_at = created_at + interval '14 days'
 WHERE status = 'invited';

-- 2) Acceptance now rejects expired links.
CREATE OR REPLACE FUNCTION public.accept_event_member_invite(_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Expiry only blocks a first-time acceptance; an already-active collaborator
  -- must never be locked out of an event they were legitimately given.
  if m.status = 'invited' and m.expires_at is not null and m.expires_at < now() then
    raise exception 'This invitation has expired. Ask the host to send a new one';
  end if;
  update public.event_members
     set user_id = uid, status = 'active', accepted_at = coalesce(accepted_at, now())
   where id = m.id;
  return m.event_id;
end $function$;

-- 3) Pre-sign-in invite lookup. The token is the capability; the payload is
--    limited to what the landing page must show.
CREATE OR REPLACE FUNCTION public.get_event_member_invite(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m public.event_members;
  ev_title text;
begin
  if _token is null or length(_token) < 8 then
    return jsonb_build_object('found', false);
  end if;
  select * into m from public.event_members where token = _token;
  if m.id is null then
    return jsonb_build_object('found', false);
  end if;
  select e.data->>'title' into ev_title from public.events e where e.id = m.event_id;
  return jsonb_build_object(
    'found', true,
    'event_id', m.event_id,
    'event_title', coalesce(nullif(ev_title, ''), 'an event'),
    'invited_email', lower(m.invited_email),
    'role', m.role::text,
    'status', m.status,
    'expires_at', m.expires_at,
    'expired', (m.status = 'invited' and m.expires_at is not null and m.expires_at < now())
  );
end $function$;

REVOKE ALL ON FUNCTION public.get_event_member_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_member_invite(text) TO anon, authenticated, service_role;