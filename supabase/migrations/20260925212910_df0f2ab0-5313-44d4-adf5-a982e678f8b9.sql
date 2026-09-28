CREATE OR REPLACE FUNCTION public.can_use_schedules(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH subs AS (
    SELECT CASE
      WHEN lower(s.price_id) IN ('studio_collective_monthly','studio_collective_yearly') THEN 3
      WHEN lower(s.price_id) LIKE '%atelier%' THEN 3
      WHEN lower(s.price_id) LIKE '%host%' THEN 2
      WHEN lower(s.price_id) LIKE '%whisper%' THEN 1
      ELSE 0 END AS rank
    FROM public.subscriptions s
    WHERE s.user_id = _uid
      AND (
        (s.status IN ('active','trialing','past_due') AND (s.current_period_end IS NULL OR s.current_period_end > now()))
        OR (s.status = 'canceled' AND s.current_period_end IS NOT NULL AND s.current_period_end > now())
      )
  ), best AS (SELECT coalesce(max(rank),0) AS r FROM subs)
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid, 'owner') OR public.has_role(_uid, 'super_admin')
    OR (SELECT r FROM best) >= 2
    OR ((SELECT r FROM best) = 0 AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = _uid AND lower(coalesce(p.tier,'')) IN ('host','atelier')))
  )
$function$;
REVOKE EXECUTE ON FUNCTION public.can_use_schedules(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_schedules(uuid) TO service_role;