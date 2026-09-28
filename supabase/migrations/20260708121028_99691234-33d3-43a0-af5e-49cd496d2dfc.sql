
-- Replace the wide "publicly readable" policy with owner+admin-only reads.
DROP POLICY IF EXISTS "Events are publicly readable" ON public.events;

CREATE POLICY "Owners read their events"
  ON public.events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins and owners read all events"
  ON public.events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Safe public-read helpers. SECURITY DEFINER, but return ONLY the public
-- event JSON + share_token (never user_id or internal columns), and skip
-- archived rows. Callable by anon so invite/gift/checkin links keep working.

CREATE OR REPLACE FUNCTION public.get_public_event_by_id(_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN e.archived_at IS NOT NULL THEN NULL
    WHEN e.data IS NULL THEN NULL
    ELSE (e.data::jsonb || jsonb_build_object('shareToken', e.share_token))
  END
  FROM public.events e
  WHERE e.id = _id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_event_by_slug(_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN e.archived_at IS NOT NULL THEN NULL
    WHEN e.data IS NULL THEN NULL
    ELSE (e.data::jsonb || jsonb_build_object('shareToken', e.share_token))
  END
  FROM public.events e
  WHERE lower(e.branded_slug) = lower(_slug)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_event_by_id(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_event_by_id(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_public_event_by_slug(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_event_by_slug(text) TO anon, authenticated;
