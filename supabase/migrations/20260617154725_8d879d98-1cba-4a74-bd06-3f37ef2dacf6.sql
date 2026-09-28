INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'owner'::public.app_role
FROM auth.users u
WHERE lower(u.email) = lower('kendrickchristopher@hotmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.grant_seed_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF lower(NEW.email) = lower('kendrickchristopher@hotmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;