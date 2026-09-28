-- Restore the view to run under the caller's own permissions (no definer bypass).
ALTER VIEW public.active_ad_placements SET (security_invoker = true);

-- Public/browsing read of active ads, limited by column privileges below.
DROP POLICY IF EXISTS "Public view can read active ads" ON public.ad_placements;
CREATE POLICY "Public view can read active ads"
ON public.ad_placements
FOR SELECT
TO anon, authenticated
USING (status = 'active');

-- Only marketing columns are readable by browsing roles.
GRANT SELECT (id, vendor_id, headline, blurb, cta_url, hero_image, tier, region, status, created_at)
  ON public.ad_placements TO anon;

REVOKE SELECT (stripe_subscription_id, review_notes, reviewed_by, reviewed_at, owner_user_id)
  ON public.ad_placements FROM anon;
REVOKE SELECT (stripe_subscription_id, review_notes, reviewed_by, reviewed_at)
  ON public.ad_placements FROM authenticated;