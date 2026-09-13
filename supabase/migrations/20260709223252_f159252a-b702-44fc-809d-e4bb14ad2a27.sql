DROP POLICY IF EXISTS "Anyone can view active placements" ON public.ad_placements;

CREATE POLICY "Vendor owner or admin can view placement"
  ON public.ad_placements FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'owner')
  );

REVOKE SELECT ON public.ad_placements FROM anon;

CREATE OR REPLACE VIEW public.active_ad_placements
WITH (security_invoker = false) AS
SELECT id, vendor_id, headline, blurb, cta_url, hero_image, tier, region, created_at
FROM public.ad_placements
WHERE status = 'active';

GRANT SELECT ON public.active_ad_placements TO anon, authenticated;