CREATE OR REPLACE FUNCTION public.pm_can_link_events(_user_id UUID)
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
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.status IN ('active','trialing','past_due')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
        AND (
          s.price_id ILIKE 'atelier%'
          OR s.price_id ILIKE 'studio_collective%'
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.pm_can_link_events(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_can_link_events(UUID) TO service_role;

DROP POLICY IF EXISTS "users create own projects" ON public.pm_projects;
CREATE POLICY "users create own projects" ON public.pm_projects FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() AND (event_id IS NULL OR public.pm_can_link_events(auth.uid())));

DROP POLICY IF EXISTS "owner or admin update project" ON public.pm_projects;
CREATE POLICY "owner or admin update project" ON public.pm_projects FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR public.pm_is_project_admin(id, auth.uid()))
  WITH CHECK ((owner_user_id = auth.uid() OR public.pm_is_project_admin(id, auth.uid())) AND (event_id IS NULL OR public.pm_can_link_events(auth.uid())));