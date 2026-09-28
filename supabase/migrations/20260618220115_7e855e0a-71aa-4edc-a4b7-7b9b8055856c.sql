
-- Add language columns
ALTER TABLE public.pm_projects ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';

-- Add task content columns referenced by the UI (idempotent)
ALTER TABLE public.pm_tasks ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.pm_tasks ADD COLUMN IF NOT EXISTS color TEXT;

-- pm_invites table for admin-created member invitations
CREATE TABLE IF NOT EXISTS public.pm_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_invites TO authenticated;
GRANT ALL ON public.pm_invites TO service_role;

ALTER TABLE public.pm_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project admins manage invites" ON public.pm_invites;
CREATE POLICY "Project admins manage invites" ON public.pm_invites
  FOR ALL TO authenticated
  USING (public.pm_is_project_admin(project_id, auth.uid()))
  WITH CHECK (public.pm_is_project_admin(project_id, auth.uid()));

DROP POLICY IF EXISTS "Invitee can read their invite by token" ON public.pm_invites;
CREATE POLICY "Authenticated can read invites" ON public.pm_invites
  FOR SELECT TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS pm_invites_token_idx ON public.pm_invites(token);
CREATE INDEX IF NOT EXISTS pm_invites_project_idx ON public.pm_invites(project_id);

-- RPC: does the user have an active Events plan (host/atelier/collective) or owner/admin role
CREATE OR REPLACE FUNCTION public.pm_has_events_access(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'owner'::public.app_role)
    OR public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.status IN ('active','trialing','past_due')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
        AND (
          s.price_id ILIKE 'host%'
          OR s.price_id ILIKE 'atelier%'
          OR s.price_id ILIKE 'studio_collective%'
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.pm_has_events_access(UUID) TO authenticated, anon;

-- Add a category column to pricing_tiers so the pricing page can group Events / Projects / Bundles
ALTER TABLE public.pricing_tiers ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'events';

UPDATE public.pricing_tiers SET category = 'events' WHERE id IN ('free','whisper','host','atelier');
UPDATE public.pricing_tiers SET category = 'projects' WHERE id IN ('pm_solo','pm_studio');
UPDATE public.pricing_tiers SET category = 'bundles' WHERE id = 'studio_collective';

-- Re-seed the new tiers in case they weren't inserted last round
INSERT INTO public.pricing_tiers (id, name, blurb, price_monthly, price_yearly, price_onetime, features, popular, sort_order, active, category)
VALUES
  ('pm_solo', 'Studio Solo',
    'A focused workspace for the solo planner — projects, tasks, and clarity.',
    15, 144, 0,
    to_jsonb(ARRAY['1 seat','Up to 5 active projects','Unlimited tasks','2 GB attachments','Attach to events (requires Events plan)']),
    false, 50, true, 'projects'),
  ('pm_studio', 'Studio',
    'A small team, perfectly in sync — everything you need to run client work.',
    45, 432, 0,
    to_jsonb(ARRAY['Up to 5 seats','Unlimited projects','25 GB attachments','Email invitations','Priority support','Attach to events (requires Events plan)']),
    false, 51, true, 'projects'),
  ('studio_collective', 'The Studio Collective',
    'Our flagship pairing — Atelier events with Studio project management. One elegant suite, one bill, 15% off together.',
    93, 894, 0,
    to_jsonb(ARRAY['Everything in Atelier','Everything in Studio','Seamless event ↔ project linking','15% off vs. buying separately','Concierge onboarding']),
    true, 99, true, 'bundles')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  blurb = EXCLUDED.blurb,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  features = EXCLUDED.features,
  popular = EXCLUDED.popular,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active,
  category = EXCLUDED.category,
  updated_at = now();
