CREATE OR REPLACE FUNCTION public.ecard_make_token()
RETURNS text
LANGUAGE sql
SET search_path = public, extensions, pg_temp
AS $function$
  SELECT encode(gen_random_bytes(18), 'hex')
$function$;