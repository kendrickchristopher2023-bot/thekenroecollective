CREATE TABLE IF NOT EXISTS public.owner_alert_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.owner_alert_log TO service_role;

ALTER TABLE public.owner_alert_log ENABLE ROW LEVEL SECURITY;