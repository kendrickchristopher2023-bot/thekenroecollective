
-- =========================================
-- CONTACTS CRM (Atelier-only, RLS by owner)
-- =========================================

CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  email_norm TEXT GENERATED ALWAYS AS (NULLIF(lower(trim(email)), '')) STORED,
  phone_norm TEXT GENERATED ALWAYS AS (NULLIF(regexp_replace(coalesce(phone,''), '[^0-9+]', '', 'g'), '')) STORED,
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'manual',
  first_seen_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts owner all" ON public.contacts
  FOR ALL TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE INDEX contacts_owner_created_idx ON public.contacts(owner_user_id, created_at DESC);
CREATE UNIQUE INDEX contacts_owner_email_uidx ON public.contacts(owner_user_id, email_norm) WHERE email_norm IS NOT NULL;
CREATE UNIQUE INDEX contacts_owner_phone_uidx ON public.contacts(owner_user_id, phone_norm) WHERE phone_norm IS NOT NULL;
CREATE INDEX contacts_tags_gin ON public.contacts USING GIN (tags);

CREATE TRIGGER contacts_touch_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---- groups ----
CREATE TABLE public.contact_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_groups TO authenticated;
GRANT ALL ON public.contact_groups TO service_role;
ALTER TABLE public.contact_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_groups owner all" ON public.contact_groups
  FOR ALL TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);
CREATE UNIQUE INDEX contact_groups_owner_name_uidx ON public.contact_groups(owner_user_id, lower(name));

CREATE TRIGGER contact_groups_touch_updated_at
  BEFORE UPDATE ON public.contact_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---- group members ----
CREATE TABLE public.contact_group_members (
  group_id UUID NOT NULL REFERENCES public.contact_groups(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, contact_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_group_members TO authenticated;
GRANT ALL ON public.contact_group_members TO service_role;
ALTER TABLE public.contact_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_group_members owner all" ON public.contact_group_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contact_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.contact_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND c.owner_user_id = auth.uid())
  );

-- ---- event links ----
CREATE TABLE public.contact_event_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  rsvp_status TEXT,
  gift_amount_cents INTEGER,
  thankyou_sent_at TIMESTAMPTZ,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contact_id, event_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_event_links TO authenticated;
GRANT ALL ON public.contact_event_links TO service_role;
ALTER TABLE public.contact_event_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_event_links owner all" ON public.contact_event_links
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND c.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND c.owner_user_id = auth.uid()));
CREATE INDEX contact_event_links_event_idx ON public.contact_event_links(event_id);

-- =========================================
-- OWNER ANALYTICS SNAPSHOT (SECURITY DEFINER)
-- =========================================

CREATE OR REPLACE FUNCTION public.owner_analytics_snapshot(_since TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _result JSONB;
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'owner'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'range_since', _since,
    'signups_by_day', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', u.created_at)::date AS day, count(*)::int AS count
        FROM auth.users u
        WHERE u.created_at >= _since
        GROUP BY 1
        ORDER BY 1
      ) t
    ),
    'signups_total', (SELECT count(*)::int FROM auth.users WHERE created_at >= _since),
    'active_subs_by_tier', (
      SELECT COALESCE(jsonb_object_agg(tier, cnt), '{}'::jsonb) FROM (
        SELECT
          CASE
            WHEN price_id ILIKE 'atelier%' THEN 'atelier'
            WHEN price_id ILIKE 'host%' THEN 'host'
            WHEN price_id ILIKE 'whisper%' THEN 'whisper'
            WHEN price_id ILIKE 'studio_collective%' THEN 'studio'
            ELSE 'other'
          END AS tier,
          count(*)::int AS cnt
        FROM public.subscriptions
        WHERE status IN ('active','trialing')
          AND (current_period_end IS NULL OR current_period_end > now())
          AND price_id NOT LIKE 'atelier_trial%'
        GROUP BY 1
      ) s
    ),
    'trial_active', (
      SELECT count(*)::int FROM public.subscriptions
      WHERE price_id = 'atelier_trial_30d' AND status = 'trialing' AND current_period_end > now()
    ),
    'events_by_day', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS count
        FROM public.events
        WHERE created_at >= _since
        GROUP BY 1
      ) t
    ),
    'events_total', (SELECT count(*)::int FROM public.events),
    'events_archived', (SELECT count(*)::int FROM public.events WHERE archived_at IS NOT NULL),
    'trial_attempts', (
      SELECT jsonb_build_object(
        'allowed', COALESCE(sum(CASE WHEN outcome='allowed' THEN 1 ELSE 0 END)::int, 0),
        'blocked', COALESCE(sum(CASE WHEN outcome='blocked' THEN 1 ELSE 0 END)::int, 0)
      )
      FROM public.trial_attempts WHERE created_at >= _since
    ),
    'referrals', (
      SELECT jsonb_build_object(
        'codes', (SELECT count(*)::int FROM public.discount_codes WHERE kind='referral'),
        'redemptions', (SELECT count(*)::int FROM public.referrals WHERE created_at >= _since)
      )
    ),
    'top_discounts', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.used_count DESC), '[]'::jsonb) FROM (
        SELECT code, used_count, percent_off, tier_id
        FROM public.discount_codes
        WHERE active = true
        ORDER BY used_count DESC NULLS LAST
        LIMIT 5
      ) t
    ),
    'recent_signups', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) FROM (
        SELECT u.id, u.email, u.created_at
        FROM auth.users u
        ORDER BY u.created_at DESC
        LIMIT 20
      ) t
    ),
    'top_referrers', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.redemptions DESC), '[]'::jsonb) FROM (
        SELECT r.referrer_user_id, count(*)::int AS redemptions
        FROM public.referrals r
        GROUP BY r.referrer_user_id
        ORDER BY count(*) DESC
        LIMIT 10
      ) t
    )
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_analytics_snapshot(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_analytics_snapshot(TIMESTAMPTZ) TO authenticated;
