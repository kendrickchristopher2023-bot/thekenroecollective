-- Remove blanket public read of the ads base table; public browsing goes through the safe view only.
DROP POLICY IF EXISTS "Public view can read active ads" ON public.ad_placements;

REVOKE ALL ON public.ad_placements FROM anon;

-- Make the safe projection view bypass RLS so it can serve public ad browsing
-- without exposing base-table rows (it only selects marketing columns).
ALTER VIEW public.active_ad_placements SET (security_invoker = false);
GRANT SELECT ON public.active_ad_placements TO anon, authenticated;