
ALTER TABLE public.event_addons ALTER COLUMN event_id TYPE text USING event_id::text;

DROP FUNCTION IF EXISTS public.has_event_addon(uuid, text, text);

CREATE OR REPLACE FUNCTION public.has_event_addon(_event_id text, _addon_key text, _environment text DEFAULT 'live')
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_addons
    WHERE event_id = _event_id
      AND addon_key = _addon_key
      AND environment = _environment
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_event_addon(text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_event_addon(text, text, text) TO authenticated;
