-- 1) AI package entitlements: remove client-side self-insert path.
DROP POLICY IF EXISTS "Users insert own ai entitlements" ON public.ai_package_entitlements;
REVOKE INSERT, UPDATE, DELETE ON public.ai_package_entitlements FROM authenticated;
GRANT SELECT ON public.ai_package_entitlements TO authenticated;
GRANT ALL ON public.ai_package_entitlements TO service_role;

-- 2) Event add-ons: remove client-side self-insert path (webhook/server writes only).
DROP POLICY IF EXISTS "Users can insert their own event addons" ON public.event_addons;
REVOKE INSERT, UPDATE, DELETE ON public.event_addons FROM authenticated;
GRANT SELECT ON public.event_addons TO authenticated;
GRANT ALL ON public.event_addons TO service_role;

-- 3) One-time passes: keep attach-only updates for owners; billing/lifecycle
-- columns stay immutable via the existing trigger, which we re-assert here.
DROP POLICY IF EXISTS "Users attach own passes" ON public.one_time_passes;
CREATE POLICY "Users attach own passes"
ON public.one_time_passes
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND revoked_at IS NULL AND refunded_at IS NULL)
WITH CHECK (auth.uid() = user_id AND revoked_at IS NULL AND refunded_at IS NULL);

DROP TRIGGER IF EXISTS one_time_passes_restrict_user_updates ON public.one_time_passes;
CREATE TRIGGER one_time_passes_restrict_user_updates
BEFORE UPDATE ON public.one_time_passes
FOR EACH ROW EXECUTE FUNCTION public.one_time_passes_restrict_user_updates();

REVOKE INSERT, DELETE ON public.one_time_passes FROM authenticated;
GRANT SELECT, UPDATE ON public.one_time_passes TO authenticated;
GRANT ALL ON public.one_time_passes TO service_role;