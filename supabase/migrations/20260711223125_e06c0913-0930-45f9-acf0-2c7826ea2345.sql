
CREATE TABLE IF NOT EXISTS public.guest_privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX IF NOT EXISTS guest_privacy_requests_email_idx
  ON public.guest_privacy_requests (lower(email));
GRANT ALL ON public.guest_privacy_requests TO service_role;
ALTER TABLE public.guest_privacy_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.guest_privacy_rate_limit (
  email text NOT NULL,
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 1,
  PRIMARY KEY (email, window_start)
);
GRANT ALL ON public.guest_privacy_rate_limit TO service_role;
ALTER TABLE public.guest_privacy_rate_limit ENABLE ROW LEVEL SECURITY;
