REVOKE EXECUTE ON FUNCTION public.sound_take_audition(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sound_take_audition(UUID, INTEGER) TO service_role;