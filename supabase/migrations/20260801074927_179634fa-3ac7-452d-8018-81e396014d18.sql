-- Remove the blanket public read on event-scoped announcements
DROP POLICY IF EXISTS "Anyone reads sent event announcements" ON public.announcements;

-- Hosts can read announcements for events they own
CREATE POLICY "Hosts read own event announcements"
ON public.announcements
FOR SELECT
TO authenticated
USING (
  audience = 'event'::announcement_audience
  AND event_id IS NOT NULL
  AND public.get_event_owner_id(event_id) = auth.uid()
);

-- Scoped, definer-backed public read for a single event's banner content.
CREATE OR REPLACE FUNCTION public.get_public_event_announcements(_event_id text)
RETURNS TABLE (
  id uuid,
  type announcement_type,
  title text,
  body text,
  link_url text,
  link_label text,
  audience announcement_audience,
  event_id text,
  event_title text,
  sent_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.type, a.title, a.body, a.link_url, a.link_label,
         a.audience, a.event_id, a.event_title, a.sent_at
  FROM public.announcements a
  WHERE a.status = 'sent'
    AND a.audience = 'event'
    AND _event_id IS NOT NULL
    AND a.event_id = _event_id
  ORDER BY a.sent_at DESC NULLS LAST
  LIMIT 10
$$;

REVOKE ALL ON FUNCTION public.get_public_event_announcements(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_event_announcements(text) TO anon, authenticated, service_role;