-- Project Management is an Atelier-tier feature, but that was only enforced
-- client-side (canUseProjects in projects.index.tsx). Any authenticated user
-- could create a pm_projects row directly via the Supabase client, bypassing
-- the paywall entirely. Mirror the client's hasProjectManagement rule
-- (owner/admin, or profile tier = 'atelier') at the RLS level.
CREATE OR REPLACE FUNCTION public.pm_can_create_projects(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'owner'::public.app_role)
    OR public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user_id AND p.tier = 'atelier'
    )
$$;

GRANT EXECUTE ON FUNCTION public.pm_can_create_projects(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_can_create_projects(UUID) TO service_role;

DROP POLICY IF EXISTS "users create own projects" ON public.pm_projects;
CREATE POLICY "users create own projects" ON public.pm_projects FOR INSERT TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    AND public.pm_can_create_projects(auth.uid())
    AND (event_id IS NULL OR public.pm_can_link_events(auth.uid()))
  );
