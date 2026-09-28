-- Guest-facing shared assets (invitation art, announcement images, menu icons,
-- shared AI package images). These are intentionally readable by link because
-- guests receive them in emails and on public share pages. Writes stay scoped to
-- the uploader's own uid-prefixed folder.
CREATE POLICY "atelier_shared_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'atelier-shared');

CREATE POLICY "atelier_shared_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'atelier-shared' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "atelier_shared_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'atelier-shared' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'atelier-shared' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "atelier_shared_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'atelier-shared' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Preserve the one pre-existing object by re-homing it into the shared bucket so
-- its link keeps working after atelier-media is flipped to private.
UPDATE storage.objects
SET bucket_id = 'atelier-shared'
WHERE bucket_id = 'atelier-media';