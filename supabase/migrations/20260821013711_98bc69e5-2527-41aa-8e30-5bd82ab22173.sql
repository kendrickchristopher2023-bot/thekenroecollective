GRANT EXECUTE ON FUNCTION public.owns_event(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_event_collaborator(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_event(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_collaborator_role(text, uuid) TO authenticated;