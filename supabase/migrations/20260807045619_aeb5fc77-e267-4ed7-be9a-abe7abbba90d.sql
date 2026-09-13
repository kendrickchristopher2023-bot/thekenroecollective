-- Public read so contributor photos render on the reveal/keepsake page.
CREATE POLICY "ecard media public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ecard-media');

-- Contributors are not signed in: allow anon/authenticated inserts only, scoped
-- to this bucket. No UPDATE or DELETE policy, so uploads are write-once.
CREATE POLICY "ecard media contributor upload"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'ecard-media'
    AND (storage.foldername(name))[1] IS NOT NULL
  );