-- Repurpose studio_collective bundle from Host+PM to Atelier+PM (Atelier Studio).
UPDATE public.pricing_tiers
SET
  name = 'Atelier Studio',
  blurb = 'Atelier + Project Management. Our most complete experience.',
  price_monthly = 3200,
  price_yearly = 30700,
  features = '["Everything in Atelier","Full Project Management suite","Premium support","Save $2/mo vs purchasing separately"]'::jsonb,
  popular = false,
  sort_order = 99,
  category = 'bundles',
  active = true,
  trial_days = 14,
  updated_at = now()
WHERE id = 'studio_collective';

-- Make sure the standalone PM addon does NOT auto-bundle with Host; Host users buy it separately.
-- (Nothing to change schema-wise; pm_solo stays at $5/mo as set previously.)

-- Create the public atelier-media bucket via SQL would fail per platform rules;
-- bucket is created via the storage tool below. Add RLS on storage.objects scoped to atelier-media.
DO $$
BEGIN
  -- Drop existing policies if re-running
  EXECUTE 'DROP POLICY IF EXISTS "atelier_media_public_read" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "atelier_media_owner_write" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "atelier_media_owner_delete" ON storage.objects';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "atelier_media_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'atelier-media');

CREATE POLICY "atelier_media_owner_write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'atelier-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "atelier_media_owner_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'atelier-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);