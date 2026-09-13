DROP POLICY IF EXISTS "Vendors manage own ads" ON public.ad_placements;

CREATE POLICY "Vendors manage own ads"
ON public.ad_placements
FOR ALL
TO authenticated
USING (
  owner_user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = ad_placements.vendor_id AND v.owner_user_id = auth.uid())
)
WITH CHECK (
  owner_user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = ad_placements.vendor_id AND v.owner_user_id = auth.uid())
);