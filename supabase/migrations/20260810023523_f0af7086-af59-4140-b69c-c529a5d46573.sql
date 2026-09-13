-- Route public/anon reads through the safe views only.
DROP POLICY IF EXISTS "Public can view verified vendors" ON public.vendors;
DROP POLICY IF EXISTS "Signed-in can view verified or own vendors" ON public.vendors;

CREATE POLICY "Owners and admins can view full vendor record"
ON public.vendors FOR SELECT TO authenticated
USING (
  auth.uid() = owner_user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
);

DROP POLICY IF EXISTS "Public can view reviews of verified vendors" ON public.vendor_reviews;
DROP POLICY IF EXISTS "Signed-in can view reviews of verified vendors" ON public.vendor_reviews;

-- Safe views must bypass RLS (they project non-sensitive columns only).
DROP VIEW IF EXISTS public.vendors_public;
CREATE VIEW public.vendors_public AS
  SELECT id, slug, name, category, city, region, country, bio, website,
         hero_image, gallery, price_range, status, verified_at, created_at
  FROM public.vendors
  WHERE status = 'verified';

DROP VIEW IF EXISTS public.vendor_reviews_public;
CREATE VIEW public.vendor_reviews_public AS
  SELECT r.id, r.vendor_id, r.rating, r.body, r.created_at
  FROM public.vendor_reviews r
  JOIN public.vendors v ON v.id = r.vendor_id AND v.status = 'verified';

GRANT SELECT ON public.vendors_public TO anon, authenticated;
GRANT SELECT ON public.vendor_reviews_public TO anon, authenticated;
GRANT ALL ON public.vendors_public TO service_role;
GRANT ALL ON public.vendor_reviews_public TO service_role;