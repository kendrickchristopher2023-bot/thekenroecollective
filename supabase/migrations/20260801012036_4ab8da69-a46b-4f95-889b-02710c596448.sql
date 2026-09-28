-- Subscription rows drive tier entitlement checks (pm_can_link_events,
-- pm_has_events_access, has_active_subscription). Writes were already blocked by
-- RLS (no write policy exists), but the underlying grants still allowed
-- INSERT/UPDATE/DELETE, so a future permissive policy would have enabled
-- self-granting a tier. Remove the privilege itself: read-own only.
REVOKE ALL ON public.subscriptions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.subscriptions FROM authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;