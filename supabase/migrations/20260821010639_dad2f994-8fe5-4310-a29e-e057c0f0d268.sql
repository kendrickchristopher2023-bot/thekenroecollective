revoke all on function public.owns_event(text, uuid) from public, anon, authenticated;
revoke all on function public.event_collaborator_role(text, uuid) from public, anon, authenticated;
revoke all on function public.is_event_collaborator(text, uuid) from public, anon, authenticated;
revoke all on function public.can_edit_event(text, uuid) from public, anon, authenticated;
grant execute on function public.owns_event(text, uuid) to service_role;
grant execute on function public.event_collaborator_role(text, uuid) to service_role;
grant execute on function public.is_event_collaborator(text, uuid) to service_role;
grant execute on function public.can_edit_event(text, uuid) to service_role;