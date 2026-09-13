REVOKE EXECUTE ON FUNCTION public.prune_app_error_logs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_app_error_logs() TO service_role;