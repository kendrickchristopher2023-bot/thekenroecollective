
CREATE TABLE public.ai_package_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('account_monthly','event_onetime','project_onetime')),
  event_id text,
  project_id uuid,
  environment text NOT NULL DEFAULT 'live',
  stripe_subscription_id text,
  stripe_session_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_package_entitlements TO authenticated;
GRANT ALL ON public.ai_package_entitlements TO service_role;
ALTER TABLE public.ai_package_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own ai entitlements" ON public.ai_package_entitlements
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own ai entitlements" ON public.ai_package_entitlements
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_ai_ent_user ON public.ai_package_entitlements(user_id, active);
CREATE INDEX idx_ai_ent_event ON public.ai_package_entitlements(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_ai_ent_project ON public.ai_package_entitlements(project_id) WHERE project_id IS NOT NULL;

CREATE TABLE public.ai_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id text,
  project_id uuid,
  kind text NOT NULL CHECK (kind IN ('food_menu','service_bundle','merch_pack','other')),
  title text NOT NULL,
  prompt text NOT NULL,
  guest_count int,
  budget_cents int,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_packages TO authenticated;
GRANT ALL ON public.ai_packages TO service_role;
ALTER TABLE public.ai_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ai packages" ON public.ai_packages
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_ai_pkg_user ON public.ai_packages(user_id, created_at DESC);
CREATE INDEX idx_ai_pkg_event ON public.ai_packages(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_ai_pkg_project ON public.ai_packages(project_id) WHERE project_id IS NOT NULL;

CREATE TRIGGER trg_ai_ent_updated BEFORE UPDATE ON public.ai_package_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_ai_pkg_updated BEFORE UPDATE ON public.ai_packages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Helper: does this user have access to AI Packages for a given event/project?
-- Returns true if: account-monthly entitlement active, OR a matching one-time
-- unlock, OR they are on Atelier tier (Atelier gets it bundled), OR owner.
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
        AND (
          scope = 'account_monthly'
          OR (scope = 'event_onetime' AND _event_id IS NOT NULL AND event_id = _event_id)
          OR (scope = 'project_onetime' AND _project_id IS NOT NULL AND project_id = _project_id)
        )
    );
$$;
