
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.ad_placements
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.ad_placements DROP CONSTRAINT IF EXISTS ad_placements_status_check;
ALTER TABLE public.ad_placements ADD CONSTRAINT ad_placements_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'active'::text, 'paused'::text, 'rejected'::text, 'ended'::text]));
