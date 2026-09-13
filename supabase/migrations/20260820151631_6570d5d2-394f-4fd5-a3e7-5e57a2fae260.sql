CREATE OR REPLACE FUNCTION public.branded_slug_available(_slug text, _except_event_id text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE lower(e.branded_slug) = lower(btrim(_slug))
      AND (_except_event_id IS NULL OR e.id <> _except_event_id)
  );
$$;

REVOKE ALL ON FUNCTION public.branded_slug_available(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.branded_slug_available(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.branded_slug_available(text, text) TO service_role;

COMMENT ON FUNCTION public.branded_slug_available(text, text) IS
  'Returns true when no other event owns this vanity slug. Security definer so a host can check global uniqueness without reading other hostsّ event rows.';