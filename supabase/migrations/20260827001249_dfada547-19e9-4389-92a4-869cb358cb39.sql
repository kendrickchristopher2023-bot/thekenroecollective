ALTER VIEW public.active_ad_placements SET (security_invoker = true);

REVOKE ALL ON TABLE public.ad_placements FROM anon;
REVOKE SELECT ON TABLE public.ad_placements FROM authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.ad_placements TO authenticated;
GRANT ALL ON TABLE public.ad_placements TO service_role;

GRANT SELECT ON TABLE public.active_ad_placements TO anon, authenticated;
GRANT ALL ON TABLE public.active_ad_placements TO service_role;

DROP POLICY IF EXISTS "Anyone can view active ads" ON public.ad_placements;
DROP POLICY IF EXISTS "Public view can read active ads" ON public.ad_placements;
CREATE POLICY "Public view can read active ads"
ON public.ad_placements
FOR SELECT
TO anon, authenticated
USING (status = 'active');

DROP POLICY IF EXISTS "Ad owners read their own placements" ON public.ad_placements;
CREATE POLICY "Ad owners read their own placements"
ON public.ad_placements
FOR SELECT
TO authenticated
USING (
  owner_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'owner'::public.app_role)
);