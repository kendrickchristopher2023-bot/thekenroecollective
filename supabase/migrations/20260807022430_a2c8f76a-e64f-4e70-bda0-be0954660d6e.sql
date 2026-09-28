CREATE OR REPLACE FUNCTION public.pm_can_link_events(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'owner'::public.app_role)
    OR public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.user_id = _user_id
        AND s.status IN ('active','trialing','past_due')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
        AND (
          s.price_id ILIKE 'host%'
          OR s.price_id ILIKE 'atelier%'
          OR s.price_id ILIKE 'studio_collective%'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = _user_id
        AND (
          p.tier ILIKE 'host%'
          OR p.tier ILIKE 'atelier%'
          OR p.tier ILIKE 'studio_collective%'
        )
    );
$function$;