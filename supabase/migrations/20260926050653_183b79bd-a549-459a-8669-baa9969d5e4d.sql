ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS host_name text,
  ADD COLUMN IF NOT EXISTS host_phone text,
  ADD COLUMN IF NOT EXISTS host_email text,
  ADD COLUMN IF NOT EXISTS host_note text;
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_host_lengths;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_host_lengths CHECK (
  coalesce(length(host_name),0) <= 100 AND coalesce(length(host_phone),0) <= 20
  AND coalesce(length(host_email),0) <= 254 AND coalesce(length(host_note),0) <= 200);

CREATE TABLE IF NOT EXISTS public.schedule_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  occurrence_id uuid NOT NULL REFERENCES public.schedule_occurrences(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.schedule_people(id) ON DELETE CASCADE,
  answer text NOT NULL CHECK (answer IN ('yes','maybe','no')),
  note text CHECK (note IS NULL OR length(note) <= 200),
  source text NOT NULL DEFAULT 'link' CHECK (source IN ('link','sms','host')),
  answered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (occurrence_id, person_id)
);
CREATE INDEX IF NOT EXISTS schedule_rsvps_schedule_idx ON public.schedule_rsvps(schedule_id, occurrence_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_rsvps TO authenticated;
GRANT ALL ON public.schedule_rsvps TO service_role;
REVOKE ALL ON public.schedule_rsvps FROM anon;
ALTER TABLE public.schedule_rsvps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages rsvps" ON public.schedule_rsvps;
CREATE POLICY "Owner manages rsvps" ON public.schedule_rsvps FOR ALL TO authenticated
  USING (public.owns_schedule(schedule_id)) WITH CHECK (public.owns_schedule(schedule_id));
DROP TRIGGER IF EXISTS schedule_rsvps_updated_at ON public.schedule_rsvps;
CREATE TRIGGER schedule_rsvps_updated_at BEFORE UPDATE ON public.schedule_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-token answer throttle, touched only by the server.
CREATE TABLE IF NOT EXISTS public.schedule_rsvp_rate_limit (
  token_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (token_hash, window_start)
);
GRANT ALL ON public.schedule_rsvp_rate_limit TO service_role;
REVOKE ALL ON public.schedule_rsvp_rate_limit FROM anon, authenticated;
ALTER TABLE public.schedule_rsvp_rate_limit ENABLE ROW LEVEL SECURITY;