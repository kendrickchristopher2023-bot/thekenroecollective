-- Safe, contact-free public vendor directory.
CREATE OR REPLACE VIEW public.vendors_public
WITH (security_invoker = false) AS
SELECT
  v.id,
  v.slug,
  v.name,
  v.category,
  v.city,
  v.region,
  v.country,
  v.bio,
  v.website,
  v.hero_image,
  v.gallery,
  v.price_range,
  v.status,
  v.verified_at,
  v.created_at
FROM public.vendors v
WHERE v.status = 'verified';

REVOKE ALL ON public.vendors_public FROM anon, authenticated;
GRANT SELECT ON public.vendors_public TO anon, authenticated;
GRANT ALL ON public.vendors_public TO service_role;

-- Anonymous visitors must go through the view; no direct table reads.
DROP POLICY IF EXISTS "Anon can view verified vendors" ON public.vendors;
