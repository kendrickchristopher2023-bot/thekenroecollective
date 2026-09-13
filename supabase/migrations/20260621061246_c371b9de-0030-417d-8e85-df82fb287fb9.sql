-- Allow a new 'account_yearly' scope alongside existing scopes.
ALTER TABLE public.ai_package_entitlements
  DROP CONSTRAINT IF EXISTS ai_package_entitlements_scope_check;

ALTER TABLE public.ai_package_entitlements
  ADD CONSTRAINT ai_package_entitlements_scope_check
  CHECK (scope IN ('account_monthly','account_yearly','event_onetime','project_onetime','trial_24h'));

-- Rewrite has_ai_packages_access:
--  * Owners and admins keep access (internal/staff).
--  * Atelier tier is NO LONGER granted access automatically — Packages & Menus
--    is now a paid add-on for every plan (Atelier members get 25% off at
--    checkout, but must still purchase the add-on or start a trial).
--  * 'account_yearly' is honored the same way as 'account_monthly'.
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
      SELECT 1 FROM public.ai_package_entitlements
      WHERE user_id = _user_id AND active = true
        AND (expires_at IS NULL OR expires_at > now())
        AND (
          scope = 'account_monthly'
          OR scope = 'account_yearly'
          OR scope = 'trial_24h'
          OR (scope = 'event_onetime' AND _event_id IS NOT NULL AND event_id = _event_id)
          OR (scope = 'project_onetime' AND _project_id IS NOT NULL AND project_id = _project_id)
        )
    );
$$;