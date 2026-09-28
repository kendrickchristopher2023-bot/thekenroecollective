-- Contributors are not signed in, so the storage policy cannot read public.ecards
-- directly (anon has no privilege on that table, by design). This tiny helper
-- answers one question only: does this card link exist? It reveals nothing else.
CREATE OR REPLACE FUNCTION public.ecard_slug_upload_allowed(_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ecards WHERE public_slug = _slug
  );
$$;

REVOKE ALL ON FUNCTION public.ecard_slug_upload_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ecard_slug_upload_allowed(text) TO anon, authenticated;

COMMENT ON FUNCTION public.ecard_slug_upload_allowed(text) IS
  'Existence check for an eCard public_slug, used by the ecard-media storage upload policy. Returns a boolean only, never card data.';

-- Replace the loose upload policy. Old rule: any non-empty folder name.
-- New rule: exactly one folder segment, and it must be a real eCard slug.
DROP POLICY IF EXISTS "ecard media contributor upload" ON storage.objects;

CREATE POLICY "ecard media contributor upload"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'ecard-media'
    AND array_length(storage.foldername(name), 1) = 1
    AND public.ecard_slug_upload_allowed((storage.foldername(name))[1])
  );

-- Documentation only: this cache is written and read by trusted server code
-- through the service role. RLS is on with no policies on purpose, so signed-in
-- and anonymous roles are fully denied. Do not add anon/authenticated grants.
COMMENT ON TABLE public.vendor_search_cache IS
  'Server-only vendor search cache. Service role access only: RLS is enabled with no policies and no grants to anon or authenticated, deliberately fail-closed. Do not grant Data API access.';
