CREATE OR REPLACE FUNCTION public.can_edit_event(_event_id text, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select coalesce(public.owns_event(_event_id, _user_id), false)
      or coalesce(public.event_collaborator_role(_event_id, _user_id) = 'cohost'::public.event_member_role, false)
$function$;