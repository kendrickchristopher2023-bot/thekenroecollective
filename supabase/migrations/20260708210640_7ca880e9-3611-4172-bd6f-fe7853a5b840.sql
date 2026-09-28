-- Fix 1: Prevent takeover of unclaimed events. Restrict Owners update policy to strictly own rows.
DROP POLICY IF EXISTS "Owners update their events" ON public.events;
CREATE POLICY "Owners update their events"
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Fix 2: Restrict public announcement reads to the 'all_users' audience only.
-- Targeted audiences (specific tiers/segments) are no longer readable by everyone.
DROP POLICY IF EXISTS "Anyone reads sent announcements" ON public.announcements;
CREATE POLICY "Anyone reads sent all-user announcements"
  ON public.announcements
  FOR SELECT
  USING (
    status = 'sent'::announcement_status
    AND audience = 'all_users'::announcement_audience
  );