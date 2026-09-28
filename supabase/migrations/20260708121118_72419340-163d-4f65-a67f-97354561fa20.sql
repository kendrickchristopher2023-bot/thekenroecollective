
CREATE OR REPLACE FUNCTION public.get_event_owner_id(_id text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.events WHERE id = _id LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_event_owner_id(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_event_owner_id(text) TO anon, authenticated;
