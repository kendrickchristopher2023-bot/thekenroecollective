-- The vendors SELECT policy was scoped `TO authenticated` only, so the
-- "publicly browsable" vendor directory (listVendors/getVendorBySlug are
-- unauthenticated server fns, matching the app's own stated design intent
-- in vendors.index.tsx: "sign-in only required for actions") showed zero
-- vendors to any logged-out visitor. Verified via SET ROLE anon before this
-- fix: 0 rows; after: the real verified vendor row returns correctly.
DROP POLICY IF EXISTS "Authenticated users can view verified vendors" ON public.vendors;
CREATE POLICY "Public can view verified vendors" ON public.vendors
FOR SELECT
TO public
USING (
  (status = 'verified'::text)
  OR (auth.uid() = owner_user_id)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'owner'::app_role)
);
