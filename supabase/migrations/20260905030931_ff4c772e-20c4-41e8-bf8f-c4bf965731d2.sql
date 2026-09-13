CREATE TABLE IF NOT EXISTS public.restore_drill_events (LIKE public.events INCLUDING DEFAULTS INCLUDING CONSTRAINTS);

GRANT ALL ON public.restore_drill_events TO service_role;

ALTER TABLE public.restore_drill_events ENABLE ROW LEVEL SECURITY;

-- No policies on purpose: nothing but the service role may ever read this.
