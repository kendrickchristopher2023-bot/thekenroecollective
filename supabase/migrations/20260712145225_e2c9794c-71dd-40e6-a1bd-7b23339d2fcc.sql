REVOKE ALL ON FUNCTION public.pass_active_for_event(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_ai_credit(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pass_active_for_event(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_ai_credit(uuid, uuid) TO authenticated, service_role;