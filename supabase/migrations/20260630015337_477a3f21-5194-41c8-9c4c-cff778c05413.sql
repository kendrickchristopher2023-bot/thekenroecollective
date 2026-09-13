drop policy if exists "atelier_media_owner_read" on storage.objects;
drop policy if exists "atelier_media_owner_update" on storage.objects;

create policy "atelier_media_owner_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'atelier-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "atelier_media_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'atelier-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'atelier-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);