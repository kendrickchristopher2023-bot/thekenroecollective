REVOKE ALL ON FUNCTION public.is_demo_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_demo_user(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.events_flag_demo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_demo_event_members() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adopt_showcase_event(uuid) FROM PUBLIC, anon, authenticated;