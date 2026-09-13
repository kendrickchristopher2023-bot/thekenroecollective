-- Fix: sms_consent_log open INSERT (permissive with_check=true) — restrict to service_role
DROP POLICY IF EXISTS "Authenticated can append sms consent" ON public.sms_consent_log;
-- service_role bypasses RLS; no replacement policy needed. Authenticated/anon can no longer
-- forge consent records; consent is now written only by trusted server code using the
-- service-role client during actual SMS sends.

-- Fix: ad_impressions unvalidated user_id — require user_id NULL or auth.uid()
DROP POLICY IF EXISTS "Anyone can log valid impression" ON public.ad_impressions;

CREATE POLICY "Anyone can log valid impression"
ON public.ad_impressions
FOR INSERT
TO anon, authenticated
WITH CHECK (
  kind = ANY (ARRAY['impression'::text, 'click'::text])
  AND EXISTS (
    SELECT 1 FROM public.ad_placements p
    WHERE p.id = ad_impressions.placement_id AND p.status = 'active'
  )
  AND (user_id IS NULL OR user_id = auth.uid())
);