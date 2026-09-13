ALTER TABLE public.showcase_interactions DROP CONSTRAINT IF EXISTS showcase_interactions_kind_check;
ALTER TABLE public.showcase_interactions
  ADD CONSTRAINT showcase_interactions_kind_check
  CHECK (kind IN ('open', 'play', 'cta', 'example_invite', 'example_host_link', 'example_host_view', 'example_create'));