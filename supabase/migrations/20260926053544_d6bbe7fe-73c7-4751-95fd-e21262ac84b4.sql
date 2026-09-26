-- 1. Record the grant fix Christopher applied by hand on schedule_rsvps (idempotent).
REVOKE ALL ON public.schedule_rsvps FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_rsvps TO authenticated;
GRANT ALL ON public.schedule_rsvps TO service_role;

-- 2. Schedule texts have no event. The published engine inserts without event_id,
--    which the NOT NULL column refused. An empty default lets those texts queue.
ALTER TABLE public.sms_outbox ALTER COLUMN event_id SET DEFAULT '';

-- 3. Host summary and instant notice settings (off by default).
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS summary_channel text NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS instant_channel text NOT NULL DEFAULT 'off';
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_summary_channel_check;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_summary_channel_check CHECK (summary_channel IN ('off','email','sms','both'));
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_instant_channel_check;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_instant_channel_check CHECK (instant_channel IN ('off','email','sms','both'));

-- 4. "Only to people who have not answered" reminder steps.
ALTER TABLE public.schedule_reminder_steps ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all';
ALTER TABLE public.schedule_reminder_steps DROP CONSTRAINT IF EXISTS schedule_reminder_steps_audience_check;
ALTER TABLE public.schedule_reminder_steps ADD CONSTRAINT schedule_reminder_steps_audience_check CHECK (audience IN ('all','no_answer'));

-- 5. Text-reply confirmations are a new send kind, so they count toward the owner's daily cap.
ALTER TABLE public.schedule_reminder_sends DROP CONSTRAINT IF EXISTS schedule_reminder_sends_kind_check;
ALTER TABLE public.schedule_reminder_sends ADD CONSTRAINT schedule_reminder_sends_kind_check CHECK (kind IN ('auto','manual','welcome','reply'));
ALTER TABLE public.schedule_reminder_sends DROP CONSTRAINT IF EXISTS schedule_reminder_sends_manual_shape;
ALTER TABLE public.schedule_reminder_sends ADD CONSTRAINT schedule_reminder_sends_manual_shape CHECK (
  (kind = 'auto' AND step_id IS NOT NULL AND manual_send_id IS NULL)
  OR (kind = 'manual' AND step_id IS NULL AND manual_send_id IS NOT NULL AND body IS NOT NULL)
  OR (kind = 'welcome' AND step_id IS NULL AND manual_send_id IS NULL AND body IS NOT NULL)
  OR (kind = 'reply' AND step_id IS NULL AND manual_send_id IS NULL AND body IS NOT NULL)
);

-- 6. Host notices: morning-of summary and batched instant notices.
CREATE TABLE IF NOT EXISTS public.schedule_host_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  occurrence_id uuid REFERENCES public.schedule_occurrences(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('summary','instant')),
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  bucket text NOT NULL,
  to_address text,
  body text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','queued','sent','dry_run','blocked','paused','failed')),
  error text,
  sms_outbox_id uuid,
  answers_through timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, kind, channel, bucket)
);
CREATE INDEX IF NOT EXISTS schedule_host_notices_recent_idx ON public.schedule_host_notices (schedule_id, kind, channel, created_at DESC);
REVOKE ALL ON public.schedule_host_notices FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_host_notices TO authenticated;
GRANT ALL ON public.schedule_host_notices TO service_role;
ALTER TABLE public.schedule_host_notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owners read host notices" ON public.schedule_host_notices;
CREATE POLICY "owners read host notices" ON public.schedule_host_notices FOR SELECT TO authenticated USING (public.owns_schedule(schedule_id));
DROP TRIGGER IF EXISTS schedule_host_notices_touch ON public.schedule_host_notices;
CREATE TRIGGER schedule_host_notices_touch BEFORE UPDATE ON public.schedule_host_notices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. Co-hosts.
CREATE TABLE IF NOT EXISTS public.schedule_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  invited_email text NOT NULL CHECK (length(invited_email) BETWEEN 3 AND 254),
  role text NOT NULL CHECK (role IN ('view','edit')),
  token_hash text NOT NULL UNIQUE,
  user_id uuid,
  accepted_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS schedule_members_open_email_uidx ON public.schedule_members (schedule_id, lower(invited_email)) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS schedule_members_user_idx ON public.schedule_members (user_id) WHERE revoked_at IS NULL;
REVOKE ALL ON public.schedule_members FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_members TO authenticated;
GRANT ALL ON public.schedule_members TO service_role;
ALTER TABLE public.schedule_members ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS schedule_members_touch ON public.schedule_members;
CREATE TRIGGER schedule_members_touch BEFORE UPDATE ON public.schedule_members FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.schedule_member_role(_sid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.schedule_members
  WHERE schedule_id = _sid AND user_id = auth.uid() AND accepted_at IS NOT NULL AND revoked_at IS NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_view_schedule(_sid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.owns_schedule(_sid) OR public.schedule_member_role(_sid) IS NOT NULL
$$;

-- A co-host sees a contact only while that contact is on a schedule they were invited to.
CREATE OR REPLACE FUNCTION public.cohost_can_see_contact(_cid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.schedule_people sp
    JOIN public.schedule_members m ON m.schedule_id = sp.schedule_id
    WHERE sp.contact_id = _cid AND sp.removed_at IS NULL
      AND m.user_id = auth.uid() AND m.accepted_at IS NOT NULL AND m.revoked_at IS NULL
  )
$$;

REVOKE EXECUTE ON FUNCTION public.schedule_member_role(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_schedule(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cohost_can_see_contact(uuid) FROM anon;

DROP POLICY IF EXISTS "owners manage members" ON public.schedule_members;
CREATE POLICY "owners manage members" ON public.schedule_members FOR ALL TO authenticated
  USING (public.owns_schedule(schedule_id)) WITH CHECK (public.owns_schedule(schedule_id) AND owner_user_id = auth.uid());
DROP POLICY IF EXISTS "members read own membership" ON public.schedule_members;
CREATE POLICY "members read own membership" ON public.schedule_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND revoked_at IS NULL);

-- Read-only access for accepted co-hosts. Every write stays owner-only in RLS;
-- edit co-hosts change people and messages through server functions that check the role first.
DROP POLICY IF EXISTS "cohosts read schedules" ON public.schedules;
CREATE POLICY "cohosts read schedules" ON public.schedules FOR SELECT TO authenticated USING (public.schedule_member_role(id) IS NOT NULL);
DROP POLICY IF EXISTS "cohosts read occurrences" ON public.schedule_occurrences;
CREATE POLICY "cohosts read occurrences" ON public.schedule_occurrences FOR SELECT TO authenticated USING (public.schedule_member_role(schedule_id) IS NOT NULL);
DROP POLICY IF EXISTS "cohosts read people" ON public.schedule_people;
CREATE POLICY "cohosts read people" ON public.schedule_people FOR SELECT TO authenticated USING (removed_at IS NULL AND public.schedule_member_role(schedule_id) IS NOT NULL);
DROP POLICY IF EXISTS "cohosts read steps" ON public.schedule_reminder_steps;
CREATE POLICY "cohosts read steps" ON public.schedule_reminder_steps FOR SELECT TO authenticated USING (public.schedule_member_role(schedule_id) IS NOT NULL);
DROP POLICY IF EXISTS "cohosts read rsvps" ON public.schedule_rsvps;
CREATE POLICY "cohosts read rsvps" ON public.schedule_rsvps FOR SELECT TO authenticated USING (public.schedule_member_role(schedule_id) IS NOT NULL);
DROP POLICY IF EXISTS "cohosts read schedule contacts" ON public.contacts;
CREATE POLICY "cohosts read schedule contacts" ON public.contacts FOR SELECT TO authenticated USING (public.cohost_can_see_contact(id));
