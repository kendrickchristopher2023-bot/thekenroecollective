-- 1) app_error_logs: replace WITH CHECK (true) with a bounded, non-spoofable insert rule.
DROP POLICY IF EXISTS "Anyone can record an error" ON public.app_error_logs;
CREATE POLICY "Anyone can record an error"
ON public.app_error_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (
  (user_id IS NULL OR user_id = auth.uid())
  AND resolved_at IS NULL
  AND resolved_by IS NULL
  AND length(fingerprint) BETWEEN 1 AND 120
  AND length(error_name) BETWEEN 1 AND 200
  AND length(message) BETWEEN 1 AND 2000
  AND (stack IS NULL OR length(stack) <= 8000)
  AND (route IS NULL OR length(route) <= 500)
  AND length(source) <= 60
  AND length(environment) <= 40
  AND (release IS NULL OR length(release) <= 120)
  AND (user_agent IS NULL OR length(user_agent) <= 500)
);

-- 2) Drop redundant blanket service_role policies. The service role bypasses
-- RLS entirely, so these add no access and only widen the policy surface.
DROP POLICY IF EXISTS "service role manages auth rate limit" ON public.auth_rate_limit;
DROP POLICY IF EXISTS "Service role manages passes" ON public.one_time_passes;
DROP POLICY IF EXISTS "Service role manages refunds" ON public.refund_log;
DROP POLICY IF EXISTS "Service role manages consent" ON public.purchase_consent_log;