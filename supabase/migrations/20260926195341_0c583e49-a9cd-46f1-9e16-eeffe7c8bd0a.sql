-- Short codes for Schedules texts. Additive only: the published engine selects
-- schedule_people with "*" and inserts without this column, so the default fills it.
CREATE OR REPLACE FUNCTION public.gen_schedule_short_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions
AS $$
DECLARE
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  bytes bytea := extensions.gen_random_bytes(10);
  out text := '';
  i int;
BEGIN
  FOR i IN 0..9 LOOP
    out := out || substr(alphabet, (get_byte(bytes, i) % 57) + 1, 1);
  END LOOP;
  RETURN out;
END;
$$;

REVOKE ALL ON FUNCTION public.gen_schedule_short_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gen_schedule_short_code() TO service_role;

ALTER TABLE public.schedule_people
  ADD COLUMN IF NOT EXISTS short_code text DEFAULT public.gen_schedule_short_code();

UPDATE public.schedule_people SET short_code = public.gen_schedule_short_code() WHERE short_code IS NULL;

ALTER TABLE public.schedule_people ALTER COLUMN short_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS schedule_people_short_code_key ON public.schedule_people (short_code);