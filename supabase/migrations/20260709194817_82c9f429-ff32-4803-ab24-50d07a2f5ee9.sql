CREATE TABLE public.user_known_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_hash)
);

GRANT SELECT ON public.user_known_devices TO authenticated;
GRANT ALL ON public.user_known_devices TO service_role;

ALTER TABLE public.user_known_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_known_devices self read"
  ON public.user_known_devices
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX user_known_devices_user_idx ON public.user_known_devices(user_id, last_seen_at DESC);