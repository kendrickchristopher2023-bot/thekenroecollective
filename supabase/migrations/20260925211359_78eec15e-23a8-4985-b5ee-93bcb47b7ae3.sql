
CREATE POLICY "contact imports own upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contact-imports' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "contact imports own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contact-imports' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "contact imports own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contact-imports' AND (storage.foldername(name))[1] = auth.uid()::text);
