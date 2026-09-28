CREATE OR REPLACE FUNCTION public.get_event_public_entitlements(_event_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH owner AS (
    SELECT user_id FROM public.events WHERE id = _event_id LIMIT 1
  ),
  tokens AS (
    -- Stripe-billed plans (includes trials, which are real entitlements)
    SELECT lower(coalesce(s.price_id, '')) AS pid
    FROM public.subscriptions s
    JOIN owner o ON o.user_id = s.user_id
    WHERE s.status IN ('active', 'trialing', 'past_due')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
    UNION ALL
    -- Manual / comped grants written to the profile tier
    SELECT lower(coalesce(p.tier, ''))
    FROM public.profiles p
    JOIN owner o ON o.user_id = p.id
    UNION ALL
    -- Staff accounts resolve to the top tier, same as server-side guards
    SELECT 'atelier'
    FROM public.user_roles r
    JOIN owner o ON o.user_id = r.user_id
    WHERE r.role IN ('owner', 'admin', 'super_admin')
  ),
  eff AS (
    SELECT
      bool_or(pid LIKE 'whisper%' OR pid LIKE 'host%' OR pid LIKE 'atelier%' OR pid LIKE 'studio_collective%') AS paid,
      bool_or(pid LIKE 'atelier%' OR pid LIKE 'studio_collective%') AS atelier
    FROM tokens
  )
  SELECT jsonb_build_object(
    'watermark', NOT (
      EXISTS (SELECT 1 FROM public.event_addons WHERE event_id = _event_id AND addon_key = 'branding_removal')
      OR coalesce((SELECT paid FROM eff), false)
    ),
    'photoWall', (
      EXISTS (SELECT 1 FROM public.event_addons WHERE event_id = _event_id AND addon_key = 'photo_wall')
      OR coalesce((SELECT atelier FROM eff), false)
    )
  );
$function$;