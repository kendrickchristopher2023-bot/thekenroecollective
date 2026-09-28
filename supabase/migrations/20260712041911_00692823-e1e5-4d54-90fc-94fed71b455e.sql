-- Fix: the public-facing 'Anyone can view active placements' policy on ad_placements
-- exposed Stripe billing columns (stripe_subscription_id, monthly_price_id) to anon.
-- Replace the broad policy with a security-definer view that exposes only the
-- marketing-safe columns needed by the public marketplace.

-- Public marketplace reads only active ads with safe columns.
CREATE OR REPLACE VIEW public.active_ad_placements
WITH (security_invoker = false) AS
SELECT id,
       vendor_id,
       headline,
       blurb,
       cta_url,
       hero_image,
       tier,
       region,
       status,
       created_at
FROM public.ad_placements
WHERE status = 'active';

-- Ensure the public read path can use the view.
GRANT SELECT ON public.active_ad_placements TO anon, authenticated;

-- Remove the overly permissive public policy on the underlying billing table.
DROP POLICY IF EXISTS "Anyone can view active placements" ON public.ad_placements;

-- Make sure anon no longer has any direct access to the underlying table.
REVOKE ALL ON public.ad_placements FROM anon;

-- The impression logger must still verify the placement is active, but it can now
-- use the safe view instead of the underlying table.
DROP POLICY IF EXISTS "Anyone can log valid impression" ON public.ad_impressions;

CREATE POLICY "Anyone can log valid impression"
ON public.ad_impressions
FOR INSERT
TO anon, authenticated
WITH CHECK (
  kind = ANY (ARRAY['impression'::text, 'click'::text])
  AND EXISTS (
    SELECT 1 FROM public.active_ad_placements p
    WHERE p.id = ad_impressions.placement_id
  )
  AND (user_id IS NULL OR user_id = auth.uid())
);
