-- Public buckets serve objects through the public endpoint without needing a
-- SELECT policy; keeping one would also let clients enumerate every file name.
DROP POLICY IF EXISTS "atelier_shared_public_read" ON storage.objects;