-- Add share_token to events for gating public share routes
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS share_token text;
UPDATE public.events SET share_token = encode(gen_random_bytes(12), 'hex') WHERE share_token IS NULL;
ALTER TABLE public.events ALTER COLUMN share_token SET DEFAULT encode(gen_random_bytes(12), 'hex');
ALTER TABLE public.events ALTER COLUMN share_token SET NOT NULL;
CREATE INDEX IF NOT EXISTS events_share_token_idx ON public.events(share_token);

-- Rate limit table for anonymous support chat (ad-hoc; no proper primitive available)
CREATE TABLE IF NOT EXISTS public.support_rate_limit (
  ip_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 1,
  PRIMARY KEY (ip_hash, window_start)
);
GRANT ALL ON public.support_rate_limit TO service_role;
ALTER TABLE public.support_rate_limit ENABLE ROW LEVEL SECURITY;
-- No policies = only service_role (used from server fn) can access. Locked to clients.

CREATE INDEX IF NOT EXISTS support_rate_limit_window_idx ON public.support_rate_limit(window_start);

-- Function to check & increment the support chat rate limit in one shot.
-- Returns true when the caller is within budget, false when they should be rejected.
CREATE OR REPLACE FUNCTION public.support_chat_rate_check(_ip_hash text, _max_per_minute int DEFAULT 12)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _window timestamptz := date_trunc('minute', now());
  _count int;
BEGIN
  IF _ip_hash IS NULL OR length(_ip_hash) < 4 THEN
    RETURN true;
  END IF;
  INSERT INTO public.support_rate_limit(ip_hash, window_start, count)
    VALUES (_ip_hash, _window, 1)
    ON CONFLICT (ip_hash, window_start) DO UPDATE SET count = public.support_rate_limit.count + 1
    RETURNING count INTO _count;
  -- Opportunistic cleanup of old windows
  DELETE FROM public.support_rate_limit WHERE window_start < now() - interval '15 minutes';
  RETURN _count <= _max_per_minute;
END;
$$;
