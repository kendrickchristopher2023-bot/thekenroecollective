REVOKE EXECUTE ON FUNCTION public.schedule_member_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_schedule(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cohost_can_see_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_member_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_schedule(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cohost_can_see_contact(uuid) TO authenticated, service_role;