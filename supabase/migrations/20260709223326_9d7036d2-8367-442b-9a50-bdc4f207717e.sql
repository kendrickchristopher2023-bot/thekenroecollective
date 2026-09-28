-- Roll back the security-definer view approach; use column-level GRANTs instead.
DROP VIEW IF EXISTS public.active_ad_placements;

-- Restore public SELECT policy for active placements (column privileges gate sensitive fields).
DROP POLICY IF EXISTS "Vendor owner or admin can view placement" ON public.ad_placements;
DROP POLICY IF EXISTS "Anyone can view active placements" ON public.ad_placements;

CREATE POLICY "Anyone can view active placements"
  ON public.ad_placements FOR SELECT
  USING (
    status = 'active'
    OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'owner')
  );

-- Reset anon privileges, then grant only the safe marketing columns.
REVOKE ALL ON public.ad_placements FROM anon;
GRANT SELECT (id, vendor_id, headline, blurb, cta_url, hero_image, tier, region, status, created_at)
  ON public.ad_placements TO anon;