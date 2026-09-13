REVOKE ALL ON FUNCTION public.claim_atelier_trial(uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_atelier_trial(uuid, text, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.claim_atelier_trial(uuid, text, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_atelier_trial(uuid, text, text, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.enforce_atelier_trial_guest_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_atelier_trial_guest_limit() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_atelier_trial_guest_limit() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_atelier_trial_guest_limit() TO service_role;