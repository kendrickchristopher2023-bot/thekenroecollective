DROP POLICY IF EXISTS "Anyone can view vendor reviews" ON public.vendor_reviews;

CREATE POLICY "Anyone can view vendor reviews"
ON public.vendor_reviews
FOR SELECT
TO anon, authenticated
USING (true);

-- Defense in depth: ensure reviewer identity column is never readable by public roles
REVOKE SELECT (reviewer_user_id) ON public.vendor_reviews FROM anon, authenticated;
GRANT SELECT (id, vendor_id, rating, body, created_at) ON public.vendor_reviews TO anon, authenticated;
