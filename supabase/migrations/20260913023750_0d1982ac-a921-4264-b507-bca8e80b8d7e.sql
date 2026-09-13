CREATE POLICY "Public read for site-films"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'site-films');