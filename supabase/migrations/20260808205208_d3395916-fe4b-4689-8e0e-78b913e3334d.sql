-- Public reads move to the curated views (definer semantics), so the base
-- tables no longer need broad anon/authenticated read policies.
ALTER VIEW public.vendors_public SET (security_invoker = off);
ALTER VIEW public.vendor_reviews_public SET (security_invoker = off);

GRANT SELECT ON public.vendors_public TO anon, authenticated;
GRANT SELECT ON public.vendor_reviews_public TO anon, authenticated;

-- vendors: drop anonymous base-table read access entirely.
DROP POLICY IF EXISTS "Anon can view verified vendors" ON public.vendors;
REVOKE SELECT ON public.vendors FROM anon;

-- vendor_reviews: replace the open read policy with a scoped one.
DROP POLICY IF EXISTS "Anyone can view vendor reviews" ON public.vendor_reviews;
REVOKE SELECT ON public.vendor_reviews FROM anon;

CREATE POLICY "Authors, vendor owners and admins can view reviews"
ON public.vendor_reviews
FOR SELECT
TO authenticated
USING (
  reviewer_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = vendor_reviews.vendor_id
      AND v.owner_user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
);
