ALTER TABLE public.ai_package_entitlements
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.ai_package_entitlements
  DROP CONSTRAINT IF EXISTS ai_package_entitlements_scope_check;

ALTER TABLE public.ai_package_entitlements
  ADD CONSTRAINT ai_package_entitlements_scope_check
  CHECK (scope IN ('account_monthly','event_onetime','project_onetime','trial_24h'));

CREATE UNIQUE INDEX IF NOT EXISTS ai_ent_one_trial_per_user
  ON public.ai_package_entitlements(user_id)
  WHERE scope = 'trial_24h';

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
      SELECT 1 FROM public.profiles
      WHERE id = _user_id AND tier = 'atelier'
    )
    OR EXISTS (
      SELECT 1 FROM public.ai_package_entitlements
      WHERE user_id = _user_id AND active = true
        AND (expires_at IS NULL OR expires_at > now())
        AND (
          scope = 'account_monthly'
          OR scope = 'trial_24h'
          OR (scope = 'event_onetime' AND _event_id IS NOT NULL AND event_id = _event_id)
          OR (scope = 'project_onetime' AND _project_id IS NOT NULL AND project_id = _project_id)
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.claim_ai_packages_trial(_user_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _existing timestamptz;
  _new_expiry timestamptz := now() + interval '24 hours';
BEGIN
  SELECT expires_at INTO _existing
    FROM public.ai_package_entitlements
    WHERE user_id = _user_id AND scope = 'trial_24h'
    LIMIT 1;

  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  INSERT INTO public.ai_package_entitlements(user_id, scope, expires_at, active, environment)
    VALUES (_user_id, 'trial_24h', _new_expiry, true, 'live');

  RETURN _new_expiry;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_ai_packages_trial(uuid) TO authenticated;