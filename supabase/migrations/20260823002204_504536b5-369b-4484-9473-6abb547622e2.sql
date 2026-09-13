GRANT SELECT ON public.event_photos TO anon;
GRANT SELECT, UPDATE, DELETE ON public.event_photos TO authenticated;
GRANT ALL ON public.event_photos TO service_role;

GRANT ALL ON public.event_photo_rate_limit TO service_role;

GRANT SELECT ON public.event_wall_music TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_wall_music TO authenticated;
GRANT ALL ON public.event_wall_music TO service_role;