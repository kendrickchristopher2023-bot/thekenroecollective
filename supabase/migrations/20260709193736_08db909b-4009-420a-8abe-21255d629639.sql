
-- 1) Consolidate redundant admin/owner policies on pricing_tiers
DROP POLICY IF EXISTS "admin delete tiers" ON public.pricing_tiers;
DROP POLICY IF EXISTS "admin insert tiers" ON public.pricing_tiers;
DROP POLICY IF EXISTS "admin update tiers" ON public.pricing_tiers;
DROP POLICY IF EXISTS "owners delete pricing tiers" ON public.pricing_tiers;
DROP POLICY IF EXISTS "owners insert pricing tiers" ON public.pricing_tiers;
DROP POLICY IF EXISTS "owners update pricing tiers" ON public.pricing_tiers;
DROP POLICY IF EXISTS "owners read all pricing tiers" ON public.pricing_tiers;

CREATE POLICY "admins or owners read all pricing tiers"
  ON public.pricing_tiers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "admins or owners insert pricing tiers"
  ON public.pricing_tiers FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "admins or owners update pricing tiers"
  ON public.pricing_tiers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "admins or owners delete pricing tiers"
  ON public.pricing_tiers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'owner'::public.app_role));

-- 2) Hide reviewer_user_id linkage from anonymous public reads on vendor_reviews.
--    Public listings only need id/rating/body/created_at; authenticated users
--    (reviewers, admins) still need reviewer_user_id for edit/delete flows.
REVOKE SELECT (reviewer_user_id) ON public.vendor_reviews FROM anon;
