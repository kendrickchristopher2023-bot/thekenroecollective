ALTER TABLE public.event_wall_music
  ADD COLUMN IF NOT EXISTS artist text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_wall_music TO authenticated;
GRANT ALL ON public.event_wall_music TO service_role;