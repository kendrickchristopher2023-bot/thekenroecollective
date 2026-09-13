
CREATE TABLE public.host_data_consent_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id TEXT,
  consent_given_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consent_text TEXT NOT NULL,
  ip_address TEXT,
  source TEXT,
  guest_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.host_data_consent_log TO authenticated;
GRANT ALL ON public.host_data_consent_log TO service_role;

ALTER TABLE public.host_data_consent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can read their own consent records"
  ON public.host_data_consent_log FOR SELECT
  TO authenticated
  USING (auth.uid() = host_user_id);

CREATE POLICY "Hosts can insert their own consent records"
  ON public.host_data_consent_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = host_user_id);

-- No UPDATE or DELETE policies -> append-only for authenticated users.

CREATE INDEX host_data_consent_log_host_idx ON public.host_data_consent_log(host_user_id, created_at DESC);
CREATE INDEX host_data_consent_log_event_idx ON public.host_data_consent_log(event_id);
