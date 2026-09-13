-- Back to invoker views (no SECURITY DEFINER views).
DROP VIEW IF EXISTS public.vendors_public;
CREATE VIEW public.vendors_public
WITH (security_invoker = on) AS
  SELECT id, slug, name, category, city, region, country, bio, website,
         hero_image, gallery, price_range, status, verified_at, created_at
  FROM public.vendors
  WHERE status = 'verified';

DROP VIEW IF EXISTS public.vendor_reviews_public;
CREATE VIEW public.vendor_reviews_public
WITH (security_invoker = on) AS
  SELECT r.id, r.vendor_id, r.rating, r.body, r.created_at
  FROM public.vendor_reviews r
  JOIN public.vendors v ON v.id = r.vendor_id AND v.status = 'verified';

GRANT SELECT ON public.vendors_public TO anon, authenticated;
GRANT SELECT ON public.vendor_reviews_public TO anon, authenticated;
GRANT ALL ON public.vendors_public TO service_role;
GRANT ALL ON public.vendor_reviews_public TO service_role;

-- Row visibility for verified listings, needed by the invoker views.
CREATE POLICY "Public can view verified vendors"
ON public.vendors FOR SELECT TO anon
USING (status = 'verified');

CREATE POLICY "Signed-in can view verified vendors"
ON public.vendors FOR SELECT TO authenticated
USING (status = 'verified');

CREATE POLICY "Public can view reviews of verified vendors"
ON public.vendor_reviews FOR SELECT TO anon
USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.status = 'verified'));

CREATE POLICY "Signed-in can view reviews of verified vendors"
ON public.vendor_reviews FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.status = 'verified'));

-- Column-level lockdown: sensitive columns are not selectable by anon/authenticated.
REVOKE SELECT ON public.vendors FROM anon, authenticated;
GRANT SELECT (id, owner_user_id, slug, name, category, city, region, country, bio,
              website, hero_image, gallery, price_range, status, verified_at,
              created_at, updated_at)
  ON public.vendors TO authenticated;
GRANT SELECT (id, slug, name, category, city, region, country, bio, website,
              hero_image, gallery, price_range, status, verified_at, created_at)
  ON public.vendors TO anon;

REVOKE SELECT ON public.vendor_reviews FROM anon, authenticated;
GRANT SELECT (id, vendor_id, rating, body, created_at)
  ON public.vendor_reviews TO anon, authenticated;

GRANT ALL ON public.vendors TO service_role;
GRANT ALL ON public.vendor_reviews TO service_role;