-- Owner analytics and contacts snapshots, v3.
--
-- v2 took a single uuid to leave out of every count, which was enough while the
-- demo host was the only system account. The showcase system account (the owner
-- of the sample wedding invitation) is a second one, so the owner's numbers were
-- counting a fake account as a customer. v3 takes an array instead and leaves
-- out every system account. v2 stays in place so nothing breaks mid-deploy.

CREATE OR REPLACE FUNCTION public.owner_analytics_snapshot_v3(_since timestamp with time zone, _until timestamp with time zone, _exclude_user_ids uuid[], _only_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          AND (_exclude_user_ids IS NULL OR NOT (u.id = ANY(_exclude_user_ids)))
          AND (_only_user_id IS NULL OR u.id = _only_user_id)
        GROUP BY 1 ORDER BY 1
      ) t
    ),
    'signups_total', (
      SELECT count(*)::int FROM auth.users u
      WHERE u.created_at >= _since AND u.created_at < _until
        AND (_exclude_user_ids IS NULL OR NOT (u.id = ANY(_exclude_user_ids)))
        AND (_only_user_id IS NULL OR u.id = _only_user_id)
    ),
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
          AND (_exclude_user_ids IS NULL OR NOT (user_id = ANY(_exclude_user_ids)))
          AND (_only_user_id IS NULL OR user_id = _only_user_id)
        GROUP BY 1
      ) s
    ),
    'trial_active', (
      SELECT count(*)::int FROM public.subscriptions
      WHERE price_id = 'atelier_trial_30d' AND status = 'trialing' AND current_period_end > now()
        AND (_exclude_user_ids IS NULL OR NOT (user_id = ANY(_exclude_user_ids)))
        AND (_only_user_id IS NULL OR user_id = _only_user_id)
    ),
    'events_by_day', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS count
        FROM public.events
        WHERE created_at >= _since AND created_at < _until
          AND (_exclude_user_ids IS NULL OR NOT (user_id = ANY(_exclude_user_ids)))
          AND (CASE WHEN _only_user_id IS NULL THEN COALESCE(is_demo,false) = false ELSE (user_id = _only_user_id OR COALESCE(is_demo,false)) END)
        GROUP BY 1
      ) t
    ),
    'events_total', (
      SELECT count(*)::int FROM public.events
      WHERE (_exclude_user_ids IS NULL OR NOT (user_id = ANY(_exclude_user_ids)))
        AND (CASE WHEN _only_user_id IS NULL THEN COALESCE(is_demo,false) = false ELSE (user_id = _only_user_id OR COALESCE(is_demo,false)) END)
    ),
    'events_archived', (
      SELECT count(*)::int FROM public.events WHERE archived_at IS NOT NULL
        AND (_exclude_user_ids IS NULL OR NOT (user_id = ANY(_exclude_user_ids)))
        AND (CASE WHEN _only_user_id IS NULL THEN COALESCE(is_demo,false) = false ELSE (user_id = _only_user_id OR COALESCE(is_demo,false)) END)
    ),
    'events_in_range', (
      SELECT count(*)::int FROM public.events
      WHERE created_at >= _since AND created_at < _until
        AND (_exclude_user_ids IS NULL OR NOT (user_id = ANY(_exclude_user_ids)))
        AND (CASE WHEN _only_user_id IS NULL THEN COALESCE(is_demo,false) = false ELSE (user_id = _only_user_id OR COALESCE(is_demo,false)) END)
    ),
    'trial_attempts', (
      SELECT jsonb_build_object(
        'allowed', COALESCE(sum(CASE WHEN outcome='allowed' THEN 1 ELSE 0 END)::int, 0),
        'blocked', COALESCE(sum(CASE WHEN outcome='blocked' THEN 1 ELSE 0 END)::int, 0)
      )
      FROM public.trial_attempts
      WHERE created_at >= _since AND created_at < _until
        AND (_exclude_user_ids IS NULL OR NOT (user_id = ANY(_exclude_user_ids)))
        AND (_only_user_id IS NULL OR user_id = _only_user_id)
    ),
    'referrals', (
      SELECT jsonb_build_object(
        'codes', (
          SELECT count(*)::int FROM public.discount_codes
          WHERE kind='referral'
            AND (_exclude_user_ids IS NULL OR NOT (referrer_user_id = ANY(_exclude_user_ids)))
            AND (_only_user_id IS NULL OR referrer_user_id = _only_user_id)
        ),
        'redemptions', (
          SELECT count(*)::int FROM public.referrals
          WHERE created_at >= _since AND created_at < _until
            AND (_exclude_user_ids IS NULL OR NOT (referrer_user_id = ANY(_exclude_user_ids)))
            AND (_only_user_id IS NULL OR referrer_user_id = _only_user_id)
        )
      )
    ),
    'top_discounts', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.used_count DESC), '[]'::jsonb) FROM (
        SELECT code, used_count, percent_off, tier_id
        FROM public.discount_codes WHERE active = true
          AND (_exclude_user_ids IS NULL OR NOT (referrer_user_id = ANY(_exclude_user_ids)))
          AND (_only_user_id IS NULL OR referrer_user_id = _only_user_id OR referrer_user_id IS NULL)
        ORDER BY used_count DESC NULLS LAST LIMIT 5
      ) t
    ),
    'recent_signups', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) FROM (
        SELECT u.id, u.email, u.created_at
        FROM auth.users u
        WHERE u.created_at >= _since AND u.created_at < _until
          AND (_exclude_user_ids IS NULL OR NOT (u.id = ANY(_exclude_user_ids)))
          AND (_only_user_id IS NULL OR u.id = _only_user_id)
        ORDER BY u.created_at DESC LIMIT 20
      ) t
    ),
    'top_referrers', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.redemptions DESC), '[]'::jsonb) FROM (
        SELECT r.referrer_user_id, count(*)::int AS redemptions
        FROM public.referrals r
        WHERE r.created_at >= _since AND r.created_at < _until
          AND (_exclude_user_ids IS NULL OR NOT (r.referrer_user_id = ANY(_exclude_user_ids)))
          AND (_only_user_id IS NULL OR r.referrer_user_id = _only_user_id)
        GROUP BY r.referrer_user_id
        ORDER BY count(*) DESC LIMIT 10
      ) t
    ),
    'errors_in_range', (
      SELECT count(*)::int FROM public.app_error_logs
      WHERE created_at >= _since AND created_at < _until
        AND (_exclude_user_ids IS NULL OR NOT (user_id = ANY(_exclude_user_ids)))
    ),
    'errors_unresolved', (
      SELECT count(*)::int FROM public.app_error_logs
      WHERE resolved_at IS NULL
        AND (_exclude_user_ids IS NULL OR NOT (user_id = ANY(_exclude_user_ids)))
    )
  ) INTO _result;

  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.owner_contacts_snapshot_v3(
  _since timestamp with time zone,
  _until timestamp with time zone,
  _exclude_user_ids uuid[],
  _only_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'owner'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN jsonb_build_object(
    'contacts_total', (
      SELECT count(*)::int FROM public.contacts
      WHERE (_exclude_user_ids IS NULL OR NOT (owner_user_id = ANY(_exclude_user_ids)))
        AND (_only_user_id IS NULL OR owner_user_id = _only_user_id)
    ),
    'contacts_new', (
      SELECT count(*)::int FROM public.contacts
      WHERE created_at >= _since AND created_at < _until
        AND (_exclude_user_ids IS NULL OR NOT (owner_user_id = ANY(_exclude_user_ids)))
        AND (_only_user_id IS NULL OR owner_user_id = _only_user_id)
    ),
    'contacts_opted_out', (
      SELECT count(*)::int FROM public.contacts
      WHERE email_opt_out = true
        AND (_exclude_user_ids IS NULL OR NOT (owner_user_id = ANY(_exclude_user_ids)))
        AND (_only_user_id IS NULL OR owner_user_id = _only_user_id)
    ),
    'contacts_by_source', (
      SELECT COALESCE(jsonb_object_agg(source, cnt), '{}'::jsonb) FROM (
        SELECT source, count(*)::int AS cnt FROM public.contacts
        WHERE (_exclude_user_ids IS NULL OR NOT (owner_user_id = ANY(_exclude_user_ids)))
          AND (_only_user_id IS NULL OR owner_user_id = _only_user_id)
        GROUP BY source
      ) s
    ),
    'contacts_by_day', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb) FROM (
        SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS count
        FROM public.contacts
        WHERE created_at >= _since AND created_at < _until
          AND (_exclude_user_ids IS NULL OR NOT (owner_user_id = ANY(_exclude_user_ids)))
          AND (_only_user_id IS NULL OR owner_user_id = _only_user_id)
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
          AND (_exclude_user_ids IS NULL OR NOT (c.owner_user_id = ANY(_exclude_user_ids)))
          AND (_only_user_id IS NULL OR c.owner_user_id = _only_user_id)
        GROUP BY c.source
      ) t
    ),
    'top_tags', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.cnt DESC), '[]'::jsonb) FROM (
        SELECT tag, count(*)::int AS cnt
        FROM public.contacts c, unnest(c.tags) AS tag
        WHERE (_exclude_user_ids IS NULL OR NOT (c.owner_user_id = ANY(_exclude_user_ids)))
          AND (_only_user_id IS NULL OR c.owner_user_id = _only_user_id)
        GROUP BY tag ORDER BY count(*) DESC LIMIT 10
      ) t
    ),
    'top_owners', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.contacts DESC), '[]'::jsonb) FROM (
        SELECT owner_user_id, count(*)::int AS contacts
        FROM public.contacts
        WHERE (_exclude_user_ids IS NULL OR NOT (owner_user_id = ANY(_exclude_user_ids)))
          AND (_only_user_id IS NULL OR owner_user_id = _only_user_id)
        GROUP BY owner_user_id
        ORDER BY count(*) DESC LIMIT 10
      ) t
    ),
    'broadcasts_sent', (
      SELECT count(*)::int FROM public.contact_broadcasts
      WHERE sent_at >= _since AND sent_at < _until
        AND (_exclude_user_ids IS NULL OR NOT (owner_user_id = ANY(_exclude_user_ids)))
        AND (_only_user_id IS NULL OR owner_user_id = _only_user_id)
    ),
    'broadcast_recipients', (
      SELECT COALESCE(sum(recipient_count),0)::int FROM public.contact_broadcasts
      WHERE sent_at >= _since AND sent_at < _until
        AND (_exclude_user_ids IS NULL OR NOT (owner_user_id = ANY(_exclude_user_ids)))
        AND (_only_user_id IS NULL OR owner_user_id = _only_user_id)
    ),
    'event_links', (
      SELECT count(*)::int FROM public.contact_event_links l
      JOIN public.contacts c ON c.id = l.contact_id
      WHERE (_exclude_user_ids IS NULL OR NOT (c.owner_user_id = ANY(_exclude_user_ids)))
        AND (_only_user_id IS NULL OR c.owner_user_id = _only_user_id)
    )
  );
END;
$function$;