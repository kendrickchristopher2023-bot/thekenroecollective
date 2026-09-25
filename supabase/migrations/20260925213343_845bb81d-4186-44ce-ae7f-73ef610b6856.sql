CREATE OR REPLACE FUNCTION public.schedules_force_demo_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.is_demo := OLD.is_demo OR public.is_demo_user(NEW.owner_user_id);
  ELSE
    NEW.is_demo := public.is_demo_user(NEW.owner_user_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.schedules_force_demo_flag() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS schedules_force_demo_flag ON public.schedules;
CREATE TRIGGER schedules_force_demo_flag BEFORE INSERT OR UPDATE ON public.schedules
FOR EACH ROW EXECUTE FUNCTION public.schedules_force_demo_flag();