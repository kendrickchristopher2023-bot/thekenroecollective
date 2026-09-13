REVOKE ALL ON TABLE public.ad_placements FROM anon;
REVOKE SELECT ON TABLE public.ad_placements FROM authenticated;
GRANT SELECT (id, vendor_id, tier, headline, blurb, cta_url, hero_image, region, status, created_at, updated_at) ON TABLE public.ad_placements TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.ad_placements TO authenticated;
GRANT ALL ON TABLE public.ad_placements TO service_role;