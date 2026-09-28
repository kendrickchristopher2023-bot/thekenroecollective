ALTER TABLE public.schedule_reminder_sends ALTER COLUMN step_id DROP NOT NULL;
ALTER TABLE public.schedule_reminder_sends
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS manual_send_id uuid,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE public.schedule_reminder_sends DROP CONSTRAINT IF EXISTS schedule_reminder_sends_kind_check;
ALTER TABLE public.schedule_reminder_sends ADD CONSTRAINT schedule_reminder_sends_kind_check CHECK (kind IN ('auto','manual'));
ALTER TABLE public.schedule_reminder_sends DROP CONSTRAINT IF EXISTS schedule_reminder_sends_manual_shape;
ALTER TABLE public.schedule_reminder_sends ADD CONSTRAINT schedule_reminder_sends_manual_shape CHECK (
  (kind = 'auto' AND step_id IS NOT NULL AND manual_send_id IS NULL)
  OR (kind = 'manual' AND step_id IS NULL AND manual_send_id IS NOT NULL AND body IS NOT NULL));
ALTER TABLE public.schedule_reminder_sends DROP CONSTRAINT IF EXISTS schedule_reminder_sends_status_check;
ALTER TABLE public.schedule_reminder_sends ADD CONSTRAINT schedule_reminder_sends_status_check
  CHECK (status IN ('pending','scheduled','queued','sent','delivered','failed','blocked','held','paused','dry_run'));
CREATE UNIQUE INDEX IF NOT EXISTS schedule_sends_manual_req_uidx
  ON public.schedule_reminder_sends(manual_send_id, person_id, channel) WHERE kind = 'manual';
CREATE INDEX IF NOT EXISTS schedule_sends_manual_recent_idx
  ON public.schedule_reminder_sends(occurrence_id, person_id, channel, created_at) WHERE kind = 'manual';
CREATE INDEX IF NOT EXISTS schedule_sends_scheduled_idx
  ON public.schedule_reminder_sends(due_at) WHERE status = 'scheduled';

-- Atomic claim for one manual send. Serialized per (date, person, channel) so a
-- double click, a retry or two tabs can never both pass the 10 minute check.
CREATE OR REPLACE FUNCTION public.claim_manual_schedule_send(
  _manual_send_id uuid, _occurrence_id uuid, _person_id uuid, _channel text,
  _owner uuid, _due_at timestamptz, _status text, _subject text, _body text
) RETURNS TABLE(send_id uuid, is_new boolean, prior_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('manual:' || _occurrence_id::text || ':' || _person_id::text || ':' || _channel));
  SELECT id, created_at INTO r FROM public.schedule_reminder_sends
    WHERE kind = 'manual' AND manual_send_id = _manual_send_id AND person_id = _person_id AND channel = _channel;
  IF FOUND THEN RETURN QUERY SELECT r.id, false, r.created_at; RETURN; END IF;
  SELECT id, created_at INTO r FROM public.schedule_reminder_sends
    WHERE kind = 'manual' AND occurrence_id = _occurrence_id AND person_id = _person_id AND channel = _channel
      AND created_at > now() - interval '10 minutes'
      AND status NOT IN ('blocked','failed')
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN QUERY SELECT r.id, false, r.created_at; RETURN; END IF;
  RETURN QUERY INSERT INTO public.schedule_reminder_sends
    (occurrence_id, person_id, step_id, channel, owner_user_id, due_at, status, kind, manual_send_id, subject, body)
    VALUES (_occurrence_id, _person_id, NULL, _channel, _owner, _due_at, _status, 'manual', _manual_send_id, _subject, _body)
    RETURNING id, true, created_at;
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_manual_schedule_send(uuid,uuid,uuid,text,uuid,timestamptz,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_manual_schedule_send(uuid,uuid,uuid,text,uuid,timestamptz,text,text,text) TO service_role;