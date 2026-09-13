-- 1) Error monitoring log
CREATE TABLE public.app_error_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  fingerprint text NOT NULL,
  error_name text NOT NULL DEFAULT 'Error',
  message text NOT NULL,
  stack text,
  route text,
  source text NOT NULL DEFAULT 'client',
  environment text NOT NULL DEFAULT 'production',
  release text,
  user_id uuid,
  user_agent text,
  resolved_at timestamptz,
  resolved_by uuid
);

GRANT INSERT ON public.app_error_logs TO anon;
GRANT INSERT, SELECT, UPDATE ON public.app_error_logs TO authenticated;
GRANT ALL ON public.app_error_logs TO service_role;

ALTER TABLE public.app_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record an error"
  ON public.app_error_logs FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Owners read error logs"
  ON public.app_error_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "Owners resolve error logs"
  ON public.app_error_logs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE INDEX app_error_logs_created_idx ON public.app_error_logs (created_at DESC);
CREATE INDEX app_error_logs_fingerprint_idx ON public.app_error_logs (fingerprint, created_at DESC);

CREATE OR REPLACE FUNCTION public.prune_app_error_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  DELETE FROM public.app_error_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

-- 2) Date-range analytics snapshots (owner only)
CREATE OR REPLACE FUNCTION public.owner_analytics_snapshot(_since timestamptz, _until timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _result jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'owner'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'range_since', _since,
    'range_until', _until,
    'signups_by_day', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', u.created_at)::date AS day, count(*)::int AS count
        FROM auth.users u
        WHERE u.created_at >= _since AND u.created_at < _until
        GROUP BY 1 ORDER BY 1
      ) t
    ),
    'signups_total', (SELECT count(*)::int FROM auth.users WHERE created_at >= _since AND created_at < _until),
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
        WHERE created_at >= _since AND created_at < _until
        GROUP BY 1
      ) t
    ),
    'events_total', (SELECT count(*)::int FROM public.events),
    'events_archived', (SELECT count(*)::int FROM public.events WHERE archived_at IS NOT NULL),
    'events_in_range', (SELECT count(*)::int FROM public.events WHERE created_at >= _since AND created_at < _until),
    'trial_attempts', (
      SELECT jsonb_build_object(
        'allowed', COALESCE(sum(CASE WHEN outcome='allowed' THEN 1 ELSE 0 END)::int, 0),
        'blocked', COALESCE(sum(CASE WHEN outcome='blocked' THEN 1 ELSE 0 END)::int, 0)
      )
      FROM public.trial_attempts WHERE created_at >= _since AND created_at < _until
    ),
    'referrals', (
      SELECT jsonb_build_object(
        'codes', (SELECT count(*)::int FROM public.discount_codes WHERE kind='referral'),
        'redemptions', (SELECT count(*)::int FROM public.referrals WHERE created_at >= _since AND created_at < _until)
      )
    ),
    'top_discounts', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.used_count DESC), '[]'::jsonb) FROM (
        SELECT code, used_count, percent_off, tier_id
        FROM public.discount_codes WHERE active = true
        ORDER BY used_count DESC NULLS LAST LIMIT 5
      ) t
    ),
    'recent_signups', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) FROM (
        SELECT u.id, u.email, u.created_at
        FROM auth.users u
        WHERE u.created_at >= _since AND u.created_at < _until
        ORDER BY u.created_at DESC LIMIT 20
      ) t
    ),
    'top_referrers', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.redemptions DESC), '[]'::jsonb) FROM (
        SELECT r.referrer_user_id, count(*)::int AS redemptions
        FROM public.referrals r
        WHERE r.created_at >= _since AND r.created_at < _until
        GROUP BY r.referrer_user_id
        ORDER BY count(*) DESC LIMIT 10
      ) t
    ),
    'errors_in_range', (SELECT count(*)::int FROM public.app_error_logs WHERE created_at >= _since AND created_at < _until),
    'errors_unresolved', (SELECT count(*)::int FROM public.app_error_logs WHERE resolved_at IS NULL)
  ) INTO _result;

  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_contacts_snapshot(_since timestamptz, _until timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'owner'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN jsonb_build_object(
    'contacts_total', (SELECT count(*)::int FROM public.contacts),
    'contacts_new', (SELECT count(*)::int FROM public.contacts WHERE created_at >= _since AND created_at < _until),
    'contacts_opted_out', (SELECT count(*)::int FROM public.contacts WHERE email_opt_out = true),
    'contacts_by_source', (
      SELECT COALESCE(jsonb_object_agg(source, cnt), '{}'::jsonb) FROM (
        SELECT source, count(*)::int AS cnt FROM public.contacts GROUP BY source
      ) s
    ),
    'contacts_by_day', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb) FROM (
        SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS count
        FROM public.contacts
        WHERE created_at >= _since AND created_at < _until
        GROUP BY 1
      ) t
    ),
    'rsvp_conversion_by_source', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.source), '[]'::jsonb) FROM (
        SELECT c.source,
               count(*)::int AS total,
               count(DISTINCT l.contact_id)::int AS with_rsvp
        FROM public.contacts c
        LEFT JOIN public.contact_event_links l
          ON l.contact_id = c.id AND l.rsvp_status IS NOT NULL
        WHERE c.created_at >= _since AND c.created_at < _until
        GROUP BY c.source
      ) t
    ),
    'top_tags', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.cnt DESC), '[]'::jsonb) FROM (
        SELECT tag, count(*)::int AS cnt
        FROM public.contacts, unnest(tags) AS tag
        GROUP BY tag ORDER BY count(*) DESC LIMIT 10
      ) t
    ),
    'top_owners', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.contacts DESC), '[]'::jsonb) FROM (
        SELECT owner_user_id, count(*)::int AS contacts
        FROM public.contacts GROUP BY owner_user_id
        ORDER BY count(*) DESC LIMIT 10
      ) t
    ),
    'broadcasts_sent', (SELECT count(*)::int FROM public.contact_broadcasts WHERE sent_at >= _since AND sent_at < _until),
    'broadcast_recipients', (SELECT COALESCE(sum(recipient_count),0)::int FROM public.contact_broadcasts WHERE sent_at >= _since AND sent_at < _until),
    'event_links', (SELECT count(*)::int FROM public.contact_event_links)
  );
END;
$$;

-- 3) Announcements: app-wide broadcasts are owner-only, even by direct API
DROP POLICY IF EXISTS "Admins insert announcements" ON public.announcements;
CREATE POLICY "Admins insert announcements"
  ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      audience <> 'all_users'::public.announcement_audience
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Admins update announcements" ON public.announcements;
CREATE POLICY "Admins update announcements"
  ON public.announcements FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      audience <> 'all_users'::public.announcement_audience
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND (
      audience <> 'all_users'::public.announcement_audience
      OR public.has_role(auth.uid(), 'owner'::public.app_role)
    )
  );