-- Public event surfaces (invite page, event page, photo wall) ran their
-- watermark / photo-wall checks with the anon key, but anon has no privileges
-- on event_addons or subscriptions, so every check failed with
-- "permission denied" and silently fell back to "watermark on / wall locked".
-- Answer the questions inside SECURITY DEFINER functions instead of granting
-- anon read access to billing rows.

CREATE OR REPLACE FUNCTION public.get_event_public_entitlements(_event_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH owner AS (
    SELECT user_id FROM public.events WHERE id = _event_id LIMIT 1
  ),
  subs AS (
    SELECT lower(coalesce(s.price_id, '')) AS pid
    FROM public.subscriptions s
    JOIN owner o ON o.user_id = s.user_id
    WHERE s.status IN ('active', 'trialing', 'past_due')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
      AND coalesce(s.price_id, '') <> 'atelier_trial_30d'
  )
  SELECT jsonb_build_object(
    'watermark', NOT (
      EXISTS (SELECT 1 FROM public.event_addons WHERE event_id = _event_id AND addon_key = 'branding_removal')
      OR EXISTS (
        SELECT 1 FROM subs
        WHERE pid LIKE 'whisper%' OR pid LIKE 'host%' OR pid LIKE 'atelier%' OR pid LIKE 'studio_collective%'
      )
    ),
    'photoWall', (
      EXISTS (SELECT 1 FROM public.event_addons WHERE event_id = _event_id AND addon_key = 'photo_wall')
      OR EXISTS (SELECT 1 FROM subs WHERE pid LIKE 'atelier%' OR pid LIKE 'studio_collective%')
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_package_public_entitlements(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH owner AS (
    SELECT user_id FROM public.ai_packages WHERE share_token = _token LIMIT 1
  )
  SELECT jsonb_build_object(
    'watermark', NOT EXISTS (
      SELECT 1
      FROM public.subscriptions s
      JOIN owner o ON o.user_id = s.user_id
      WHERE s.status IN ('active', 'trialing', 'past_due')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
        AND coalesce(s.price_id, '') <> 'atelier_trial_30d'
        AND (
          lower(coalesce(s.price_id, '')) LIKE 'whisper%'
          OR lower(coalesce(s.price_id, '')) LIKE 'host%'
          OR lower(coalesce(s.price_id, '')) LIKE 'atelier%'
          OR lower(coalesce(s.price_id, '')) LIKE 'studio_collective%'
        )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_event_public_entitlements(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_package_public_entitlements(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_public_entitlements(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_package_public_entitlements(text) TO anon, authenticated, service_role;

-- The invite page looks up the event owner id (an id only) from the browser,
-- including for signed-out guests.
GRANT EXECUTE ON FUNCTION public.get_event_owner_id(text) TO anon;
