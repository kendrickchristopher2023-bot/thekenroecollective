
CREATE TABLE IF NOT EXISTS public.sms_consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL UNIQUE,
  first_message_sent_at timestamptz NOT NULL DEFAULT now(),
  opted_out boolean NOT NULL DEFAULT false,
  opted_out_at timestamptz
);

GRANT SELECT, INSERT ON public.sms_consent_log TO authenticated;
GRANT ALL ON public.sms_consent_log TO service_role;

ALTER TABLE public.sms_consent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sms consent"
  ON public.sms_consent_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can append sms consent"
  ON public.sms_consent_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.sms_mark_opt_out(_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm text := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
BEGIN
  IF length(_norm) < 7 THEN RETURN; END IF;
  INSERT INTO public.sms_consent_log(phone_number, first_message_sent_at, opted_out, opted_out_at)
  VALUES (_norm, now(), true, now())
  ON CONFLICT (phone_number) DO UPDATE
    SET opted_out = true, opted_out_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.sms_mark_opt_in(_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm text := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
BEGIN
  IF length(_norm) < 7 THEN RETURN; END IF;
  UPDATE public.sms_consent_log
    SET opted_out = false, opted_out_at = NULL
    WHERE phone_number = _norm;
END;
$$;
