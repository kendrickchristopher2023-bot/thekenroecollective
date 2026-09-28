ALTER TABLE public.contact_imports
  ADD COLUMN IF NOT EXISTS parsed_rows jsonb,
  ADD COLUMN IF NOT EXISTS submitted_rows jsonb,
  ADD COLUMN IF NOT EXISTS result jsonb,
  ADD COLUMN IF NOT EXISTS schedule_id uuid;
REVOKE ALL ON public.contact_imports FROM anon;
GRANT SELECT ON public.contact_imports TO authenticated;
GRANT ALL ON public.contact_imports TO service_role;