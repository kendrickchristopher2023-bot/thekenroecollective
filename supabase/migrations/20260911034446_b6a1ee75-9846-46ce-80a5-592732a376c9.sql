REVOKE ALL ON FUNCTION public.restore_demo_event_snapshot(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_demo_event_snapshot(text) TO service_role;