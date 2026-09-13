
CREATE POLICY "Public read product-updates"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'product-updates');

CREATE POLICY "Owners upload product-updates"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-updates' AND public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners update product-updates"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-updates' AND public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners delete product-updates"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-updates' AND public.has_role(auth.uid(), 'owner'));
