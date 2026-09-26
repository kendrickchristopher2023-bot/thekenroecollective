ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS welcome_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS welcome_at timestamptz,
  ADD COLUMN IF NOT EXISTS welcome_channel text NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS welcome_subject text,
  ADD COLUMN IF NOT EXISTS welcome_body text,
  ADD COLUMN IF NOT EXISTS welcome_late_joiners boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS welcome_sent_at timestamptz;
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_welcome_channel_check;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_welcome_channel_check CHECK (welcome_channel IN ('email','sms','both'));
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_welcome_shape;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_welcome_shape CHECK (NOT welcome_enabled OR (welcome_at IS NOT NULL AND welcome_body IS NOT NULL));

ALTER TABLE public.schedule_reminder_sends DROP CONSTRAINT IF EXISTS schedule_reminder_sends_kind_check;
ALTER TABLE public.schedule_reminder_sends ADD CONSTRAINT schedule_reminder_sends_kind_check CHECK (kind IN ('auto','manual','welcome'));
ALTER TABLE public.schedule_reminder_sends DROP CONSTRAINT IF EXISTS schedule_reminder_sends_manual_shape;
ALTER TABLE public.schedule_reminder_sends ADD CONSTRAINT schedule_reminder_sends_manual_shape CHECK (
  (kind = 'auto' AND step_id IS NOT NULL AND manual_send_id IS NULL)
  OR (kind = 'manual' AND step_id IS NULL AND manual_send_id IS NOT NULL AND body IS NOT NULL)
  OR (kind = 'welcome' AND step_id IS NULL AND manual_send_id IS NULL AND body IS NOT NULL));
ALTER TABLE public.schedule_reminder_sends DROP CONSTRAINT IF EXISTS schedule_reminder_sends_status_check;
ALTER TABLE public.schedule_reminder_sends ADD CONSTRAINT schedule_reminder_sends_status_check
  CHECK (status IN ('pending','scheduled','queued','sent','delivered','failed','blocked','held','paused','dry_run','skipped'));
CREATE UNIQUE INDEX IF NOT EXISTS schedule_sends_welcome_uidx
  ON public.schedule_reminder_sends(person_id, channel) WHERE kind = 'welcome';

-- Safety net for any engine that does not know about welcomes (including the
-- currently published one): an automatic reminder can never be claimed for
-- sending while a welcome is set and that reminder falls before it. The claim
-- fails, so nothing is sent. The new engine records these as skipped instead.
CREATE OR REPLACE FUNCTION public.block_reminder_before_welcome()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w_on boolean; w_at timestamptz;
BEGIN
  IF NEW.kind = 'auto' AND NEW.status = 'pending' THEN
    SELECT s.welcome_enabled, s.welcome_at INTO w_on, w_at
      FROM public.schedule_occurrences o JOIN public.schedules s ON s.id = o.schedule_id
      WHERE o.id = NEW.occurrence_id;
    IF w_on AND w_at IS NOT NULL AND NEW.due_at < w_at THEN
      RAISE EXCEPTION 'before_welcome' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.block_reminder_before_welcome() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS schedule_sends_before_welcome ON public.schedule_reminder_sends;
CREATE TRIGGER schedule_sends_before_welcome BEFORE INSERT ON public.schedule_reminder_sends
  FOR EACH ROW EXECUTE FUNCTION public.block_reminder_before_welcome();