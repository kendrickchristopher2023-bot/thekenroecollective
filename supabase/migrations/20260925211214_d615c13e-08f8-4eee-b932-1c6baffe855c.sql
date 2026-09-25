
CREATE OR REPLACE FUNCTION public.can_use_schedules(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid, 'owner') OR public.has_role(_uid, 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = _uid
        AND (lower(coalesce(s.price_id,'')) LIKE '%host%' OR lower(coalesce(s.price_id,'')) LIKE '%atelier%')
        AND (
          (s.status IN ('active','trialing','past_due') AND (s.current_period_end IS NULL OR s.current_period_end > now()))
          OR (s.status = 'canceled' AND s.current_period_end IS NOT NULL AND s.current_period_end > now())
        )
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND lower(coalesce(p.tier,'')) IN ('host','atelier'))
  )
$$;
REVOKE ALL ON FUNCTION public.can_use_schedules(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_schedules(uuid) TO authenticated, service_role;

CREATE TABLE public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  kind text NOT NULL DEFAULT 'call' CHECK (kind IN ('call','meeting','event')),
  description text,
  join_url text,
  dial_in text,
  dial_pin text,
  location text,
  start_local timestamp without time zone NOT NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 5 AND 1440),
  rrule text,
  ends_kind text NOT NULL DEFAULT 'never' CHECK (ends_kind IN ('never','on_date','count')),
  until_local timestamp without time zone,
  occurrence_count integer CHECK (occurrence_count IS NULL OR occurrence_count BETWEEN 1 AND 1000),
  parent_schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  source_type text CHECK (source_type IS NULL OR source_type IN ('event','project','booking')),
  source_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  is_demo boolean NOT NULL DEFAULT false,
  horizon_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
GRANT ALL ON public.schedules TO service_role;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read schedules" ON public.schedules FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY "entitled create schedules" ON public.schedules FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() AND public.can_use_schedules(auth.uid()));
CREATE POLICY "owners update schedules" ON public.schedules FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "owners delete schedules" ON public.schedules FOR DELETE TO authenticated USING (owner_user_id = auth.uid());
CREATE INDEX schedules_owner_idx ON public.schedules(owner_user_id, created_at DESC);
CREATE INDEX schedules_source_idx ON public.schedules(source_type, source_id);

CREATE OR REPLACE FUNCTION public.owns_schedule(_sid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.schedules WHERE id = _sid AND owner_user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.owns_schedule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_schedule(uuid) TO authenticated, service_role;

CREATE TABLE public.schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  original_local timestamp without time zone NOT NULL,
  action text NOT NULL CHECK (action IN ('skip','move')),
  new_start_local timestamp without time zone,
  new_duration_minutes integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, original_local)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_exceptions TO authenticated;
GRANT ALL ON public.schedule_exceptions TO service_role;
ALTER TABLE public.schedule_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage exceptions" ON public.schedule_exceptions FOR ALL TO authenticated
  USING (public.owns_schedule(schedule_id)) WITH CHECK (public.owns_schedule(schedule_id));

CREATE TABLE public.schedule_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms','both')),
  paused boolean NOT NULL DEFAULT false,
  removed_at timestamptz,
  first_sms_sent_at timestamptz,
  rsvp_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  sms_consent_by uuid,
  sms_consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, contact_id),
  UNIQUE (rsvp_token),
  CHECK (channel = 'email' OR (sms_consent_by IS NOT NULL AND sms_consent_at IS NOT NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_people TO authenticated;
GRANT ALL ON public.schedule_people TO service_role;
ALTER TABLE public.schedule_people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage people" ON public.schedule_people FOR ALL TO authenticated
  USING (public.owns_schedule(schedule_id))
  WITH CHECK (public.owns_schedule(schedule_id)
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND c.owner_user_id = auth.uid()));

CREATE TABLE public.schedule_reminder_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  offset_minutes integer NOT NULL CHECK (offset_minutes BETWEEN -43200 AND 0),
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  is_starting_now boolean NOT NULL DEFAULT false,
  subject text,
  body text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_reminder_steps TO authenticated;
GRANT ALL ON public.schedule_reminder_steps TO service_role;
ALTER TABLE public.schedule_reminder_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage steps" ON public.schedule_reminder_steps FOR ALL TO authenticated
  USING (public.owns_schedule(schedule_id)) WITH CHECK (public.owns_schedule(schedule_id));

CREATE TABLE public.schedule_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  occurrence_local timestamp without time zone NOT NULL,
  start_local timestamp without time zone NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','skipped','moved','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, occurrence_local)
);
GRANT SELECT ON public.schedule_occurrences TO authenticated;
GRANT ALL ON public.schedule_occurrences TO service_role;
ALTER TABLE public.schedule_occurrences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read occurrences" ON public.schedule_occurrences FOR SELECT TO authenticated USING (public.owns_schedule(schedule_id));
CREATE INDEX schedule_occurrences_start_idx ON public.schedule_occurrences(starts_at) WHERE status IN ('scheduled','moved');

CREATE TABLE public.schedule_reminder_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid NOT NULL REFERENCES public.schedule_occurrences(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.schedule_people(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.schedule_reminder_steps(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  owner_user_id uuid NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','queued','sent','delivered','failed','blocked','held','paused','dry_run')),
  sms_outbox_id uuid,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (occurrence_id, person_id, step_id, channel)
);
GRANT SELECT ON public.schedule_reminder_sends TO authenticated;
GRANT ALL ON public.schedule_reminder_sends TO service_role;
ALTER TABLE public.schedule_reminder_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read sends" ON public.schedule_reminder_sends FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE INDEX schedule_sends_owner_day_idx ON public.schedule_reminder_sends(owner_user_id, channel, sent_at);
CREATE INDEX schedule_sends_held_idx ON public.schedule_reminder_sends(status, due_at) WHERE status IN ('held','pending');

CREATE TABLE public.contact_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  storage_path text,
  kind text NOT NULL CHECK (kind IN ('csv','xlsx','image','pdf','text')),
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','parsed','confirmed','discarded')),
  row_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contact_imports TO authenticated;
GRANT ALL ON public.contact_imports TO service_role;
ALTER TABLE public.contact_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read imports" ON public.contact_imports FOR SELECT TO authenticated USING (owner_user_id = auth.uid());

CREATE TRIGGER schedules_updated_at BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER schedule_people_updated_at BEFORE UPDATE ON public.schedule_people FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER schedule_sends_updated_at BEFORE UPDATE ON public.schedule_reminder_sends FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER contact_imports_updated_at BEFORE UPDATE ON public.contact_imports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.contacts_canonical_phone()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE d text;
BEGIN
  IF NEW.phone IS NOT NULL THEN
    d := regexp_replace(NEW.phone, '\D', '', 'g');
    IF length(d) = 10 AND NEW.phone !~ '^\s*\+' THEN NEW.phone := '+1' || d;
    ELSIF length(d) = 11 AND left(d,1) = '1' THEN NEW.phone := '+' || d;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contacts_canonical_phone BEFORE INSERT OR UPDATE OF phone ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.contacts_canonical_phone();
