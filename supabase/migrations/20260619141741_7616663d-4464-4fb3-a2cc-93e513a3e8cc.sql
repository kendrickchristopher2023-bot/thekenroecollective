ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_status_check;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'reviewing'::text, 'verified'::text, 'rejected'::text, 'paused'::text]));

ALTER TABLE public.ad_placements DROP CONSTRAINT IF EXISTS ad_placements_status_check;
ALTER TABLE public.ad_placements ADD CONSTRAINT ad_placements_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'reviewing'::text, 'approved'::text, 'active'::text, 'paused'::text, 'rejected'::text, 'ended'::text]));