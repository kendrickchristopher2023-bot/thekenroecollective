-- 1. event_addons: writes must be server-only. Remove stray write grants.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.event_addons FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.event_addons FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.event_addons FROM PUBLIC;
GRANT SELECT ON public.event_addons TO anon, authenticated;
GRANT ALL ON public.event_addons TO service_role;

-- 2. Pin search_path on the email queue helpers (SECURITY DEFINER).
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq, extensions;