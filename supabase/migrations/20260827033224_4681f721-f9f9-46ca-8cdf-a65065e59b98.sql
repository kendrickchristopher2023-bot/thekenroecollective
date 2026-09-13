-- 1. Remove the public row policy on the base table: it filtered rows but not
-- columns, so billing/review columns were reachable for active ads.
DROP POLICY IF EXISTS "Public view can read active ads" ON public.ad_placements;

-- 2. Restore read access for signed-in vendors/admins (existing row policies
-- already scope this to their own records). anon stays without any table read.
GRANT SELECT ON public.ad_placements TO authenticated;
GRANT ALL ON public.ad_placements TO service_role;
REVOKE ALL ON public.ad_placements FROM anon;

-- 3. The public listing view exposes display columns only and runs with the
-- view owner's rights so anonymous visitors can still see active ads.
ALTER VIEW public.active_ad_placements SET (security_invoker = false);
REVOKE ALL ON public.active_ad_placements FROM anon, authenticated;
GRANT SELECT ON public.active_ad_placements TO anon, authenticated;