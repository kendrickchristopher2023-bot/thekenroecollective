DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "event_photos_public_read" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "event_photos_public_insert" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "event_photos_owner_delete" ON storage.objects';
END $$;

CREATE POLICY "event_photos_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'event-photos');

CREATE POLICY "event_photos_public_insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'event-photos');

CREATE POLICY "event_photos_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'event-photos' AND owner = auth.uid());