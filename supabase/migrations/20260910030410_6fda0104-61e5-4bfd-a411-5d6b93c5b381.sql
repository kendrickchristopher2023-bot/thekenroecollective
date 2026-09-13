REVOKE ALL ON FUNCTION public.block_showcase_public_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_showcase_event_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_showcase_public_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.block_showcase_event_update() TO service_role;