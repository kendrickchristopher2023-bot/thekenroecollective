CREATE TABLE IF NOT EXISTS public.auth_rate_limit (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

GRANT ALL ON public.auth_rate_limit TO service_role;

ALTER TABLE public.auth_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages auth rate limit"
  ON public.auth_rate_limit FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.check_auth_rate_limit(_key text, _max integer DEFAULT 5, _window_minutes integer DEFAULT 10)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bucket timestamptz := date_trunc('minute', now()) - (extract(minute from now())::int % _window_minutes) * interval '1 minute';
  _count int;
BEGIN
  IF _key IS NULL OR length(_key) < 4 THEN RETURN true; END IF;
  INSERT INTO public.auth_rate_limit(key, window_start, count)
    VALUES (_key, _bucket, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = public.auth_rate_limit.count + 1
    RETURNING count INTO _count;
  DELETE FROM public.auth_rate_limit WHERE window_start < now() - interval '1 hour';
  RETURN _count <= _max;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_auth_rate_limit(text, integer, integer) TO anon, authenticated;