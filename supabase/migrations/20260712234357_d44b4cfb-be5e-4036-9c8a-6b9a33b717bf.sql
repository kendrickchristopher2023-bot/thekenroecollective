DROP POLICY IF EXISTS event_photos_valid_event_insert ON storage.objects;

CREATE POLICY event_photos_owner_or_linked_contact_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'event-photos'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = (storage.foldername(objects.name))[1]
      AND e.archived_at IS NULL
      AND (
        e.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.contact_event_links l
          JOIN public.contacts c ON c.id = l.contact_id
          WHERE l.event_id = e.id
            AND c.email_norm = NULLIF(lower(trim(auth.jwt() ->> 'email')), '')
        )
      )
  )
);