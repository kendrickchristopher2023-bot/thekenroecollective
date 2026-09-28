
CREATE OR REPLACE FUNCTION public.has_event_addon(_event_id uuid, _addon_key text, _environment text DEFAULT 'live')
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

GRANT EXECUTE ON FUNCTION public.has_event_addon(uuid, text, text) TO authenticated, anon;
