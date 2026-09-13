CREATE OR REPLACE FUNCTION public.grant_seed_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  seed_emails text[] := ARRAY[
    'kendrickchristopher@hotmail.com',
    'kendrickchristopher@icloud.com',
    'kendrickchristopher2023@gmail.com',
    'adrianmonroe@comcast.net'
  ];
BEGIN
  IF NEW.email IS NOT NULL AND lower(NEW.email) = ANY (SELECT lower(unnest(seed_emails))) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill roles for any of these accounts that already exist
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) IN (
  'kendrickchristopher@hotmail.com',
  'kendrickchristopher@icloud.com',
  'kendrickchristopher2023@gmail.com',
  'adrianmonroe@comcast.net'
)
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'owner'::public.app_role
FROM auth.users u
WHERE lower(u.email) IN (
  'kendrickchristopher@hotmail.com',
  'kendrickchristopher@icloud.com',
  'kendrickchristopher2023@gmail.com',
  'adrianmonroe@comcast.net'
)
ON CONFLICT (user_id, role) DO NOTHING;