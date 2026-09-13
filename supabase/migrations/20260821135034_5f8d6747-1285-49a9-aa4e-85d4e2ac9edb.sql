CREATE OR REPLACE FUNCTION public.profiles_force_default_entitlements_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  NEW.tier := 'postcard';
  NEW.guest_import_enabled := false;
  NEW.thank_you_cards_enabled := false;
  NEW.sms_pack_enabled := false;
  NEW.converter_enabled := false;
  NEW.atelier_trial_used := false;
  NEW.atelier_trial_started_at := NULL;
  NEW.atelier_trial_expires_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_force_default_entitlements_on_insert ON public.profiles;
CREATE TRIGGER profiles_force_default_entitlements_on_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_force_default_entitlements_on_insert();