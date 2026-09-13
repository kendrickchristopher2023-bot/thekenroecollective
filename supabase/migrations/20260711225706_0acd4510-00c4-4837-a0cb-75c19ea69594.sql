DROP POLICY IF EXISTS "Authenticated can read sms consent" ON public.sms_consent_log;
DROP POLICY IF EXISTS "authenticated_read" ON public.sms_consent_log;
CREATE POLICY "service_role_select" ON public.sms_consent_log
  FOR SELECT USING (auth.role() = 'service_role');