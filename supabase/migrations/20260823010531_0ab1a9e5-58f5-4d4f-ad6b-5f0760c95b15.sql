-- Photo Wall reads are event-scoped only.
-- Public/guest reads go through the security-definer RPC get_public_event_photos
-- and (after this migration) a service-role, event-filtered server function for
-- music. The broad anon/authenticated SELECT policies allowed enumerating every
-- event's photo and music storage paths, so they are removed.

DROP POLICY IF EXISTS "Anyone can view visible event photos" ON public.event_photos;
DROP POLICY IF EXISTS "Anyone with the link can play event wall music" ON public.event_wall_music;

REVOKE ALL ON public.event_photos FROM anon;
REVOKE ALL ON public.event_wall_music FROM anon;

-- Hosts / co-hosts must still read their own event's music (upload limits, panel).
DROP POLICY IF EXISTS "Hosts can view their event wall music" ON public.event_wall_music;
CREATE POLICY "Hosts can view their event wall music"
  ON public.event_wall_music
  FOR SELECT
  TO authenticated
  USING (public.can_edit_event(event_id, auth.uid()));

GRANT SELECT ON public.event_photos TO authenticated;
GRANT SELECT, DELETE ON public.event_wall_music TO authenticated;
GRANT ALL ON public.event_photos TO service_role;
GRANT ALL ON public.event_wall_music TO service_role;