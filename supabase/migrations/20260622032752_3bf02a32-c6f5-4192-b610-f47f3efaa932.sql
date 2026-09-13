CREATE TABLE public.sms_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_phone text NOT NULL,
  guest_id text,
  guest_name text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider text,
  provider_sid text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sms_outbox_user_idx ON public.sms_outbox(user_id, created_at DESC);
CREATE INDEX sms_outbox_event_idx ON public.sms_outbox(event_id, created_at DESC);
CREATE INDEX sms_outbox_status_idx ON public.sms_outbox(status) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_outbox TO authenticated;
GRANT ALL ON public.sms_outbox TO service_role;

ALTER TABLE public.sms_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own sms_outbox"
  ON public.sms_outbox FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owners insert own sms_outbox"
  ON public.sms_outbox FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners update own sms_outbox"
  ON public.sms_outbox FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners delete own sms_outbox"
  ON public.sms_outbox FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER sms_outbox_touch_updated_at
  BEFORE UPDATE ON public.sms_outbox
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();