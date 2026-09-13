-- Public ad browsing goes through the curated public.active_ad_placements
-- view, which is security_invoker, so visitors also need a narrow read
-- rule on the underlying table. Only ACTIVE placements are readable, and
-- signed-out visitors only get the marketing columns the view exposes.
CREATE POLICY "Anyone can view active ads"
ON public.ad_placements
FOR SELECT
TO anon, authenticated
USING (status = 'active');

GRANT SELECT (
  id, vendor_id, headline, blurb, cta_url, hero_image, tier, region, status, created_at
) ON public.ad_placements TO anon;