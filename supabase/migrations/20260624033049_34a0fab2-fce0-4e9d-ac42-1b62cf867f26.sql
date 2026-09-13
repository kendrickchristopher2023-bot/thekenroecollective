-- 1) Make AI Packages access follow linked event/project pairs.
--    Event-scoped purchases unlock any project linked to that event,
--    and project-scoped purchases unlock the event a project is linked to.
CREATE OR REPLACE FUNCTION public.has_ai_packages_access(
  _user_id uuid,
  _event_id text DEFAULT NULL,
  _project_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'owner'::public.app_role)
    OR public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.ai_package_entitlements e
      WHERE e.user_id = _user_id AND e.active = true
        AND (e.expires_at IS NULL OR e.expires_at > now())
        AND (
          e.scope IN ('account_monthly','account_yearly','trial_24h')
          OR (e.scope = 'event_onetime' AND _event_id IS NOT NULL AND e.event_id = _event_id)
          OR (e.scope = 'project_onetime' AND _project_id IS NOT NULL AND e.project_id = _project_id)
          -- Cross-link: a project entitlement also covers its linked event
          OR (
            e.scope = 'project_onetime' AND _event_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.pm_projects p
              WHERE p.id = e.project_id AND p.event_id = _event_id
            )
          )
          -- Cross-link: an event entitlement also covers any project linked to that event
          OR (
            e.scope = 'event_onetime' AND _project_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.pm_projects p
              WHERE p.id = _project_id AND p.event_id = e.event_id
            )
          )
        )
    );
$$;

-- 2) Idempotent one-time entitlement rows so a duplicated checkout
--    confirmation does not create duplicate unlock rows.
CREATE UNIQUE INDEX IF NOT EXISTS ai_ent_event_onetime_uniq
  ON public.ai_package_entitlements(user_id, event_id, environment)
  WHERE scope = 'event_onetime' AND event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_ent_project_onetime_uniq
  ON public.ai_package_entitlements(user_id, project_id, environment)
  WHERE scope = 'project_onetime' AND project_id IS NOT NULL;

-- 3) Server-checked project↔event link gate (already exists as
--    pm_can_link_events). Add a helper that confirms a specific project
--    is actually linked to a specific event, so the import server fn
--    can verify the pair before creating tasks.
CREATE OR REPLACE FUNCTION public.pm_project_is_linked_to_event(
  _project_id uuid,
  _event_id text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pm_projects
    WHERE id = _project_id AND event_id = _event_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.pm_project_is_linked_to_event(uuid, text) TO authenticated;