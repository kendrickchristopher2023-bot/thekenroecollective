DROP POLICY IF EXISTS "Authenticated can read invites" ON public.pm_invites;
DROP POLICY IF EXISTS "Invitee can read their invite by token" ON public.pm_invites;

CREATE POLICY "Project admins and invitees can read invites"
ON public.pm_invites
FOR SELECT
TO authenticated
USING (
  public.pm_is_project_admin(project_id, auth.uid())
  OR lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
);