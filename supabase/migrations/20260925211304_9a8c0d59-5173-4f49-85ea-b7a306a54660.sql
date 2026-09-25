
CREATE OR REPLACE FUNCTION public.i_can_use_schedules()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_use_schedules(auth.uid())
$$;
REVOKE ALL ON FUNCTION public.i_can_use_schedules() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.i_can_use_schedules() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.can_use_schedules(uuid) FROM authenticated;
DROP POLICY "entitled create schedules" ON public.schedules;
CREATE POLICY "entitled create schedules" ON public.schedules FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() AND public.i_can_use_schedules());
