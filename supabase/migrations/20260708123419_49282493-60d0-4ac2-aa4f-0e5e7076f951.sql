
-- Tighten event-photos INSERT policy to require the first path segment to match an existing event id
DROP POLICY IF EXISTS event_photos_public_insert ON storage.objects;

CREATE POLICY event_photos_valid_event_insert
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'event-photos'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = (storage.foldername(name))[1]
      AND e.archived_at IS NULL
  )
);
