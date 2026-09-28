CREATE OR REPLACE FUNCTION public.get_or_create_my_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _uid UUID := auth.uid();
  _existing TEXT;
  _new_code TEXT;
  _tries INT := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT referral_code INTO _existing FROM public.profiles WHERE id = _uid;
  IF _existing IS NOT NULL AND length(_existing) > 0 THEN
    RETURN _existing;
  END IF;

  LOOP
    _tries := _tries + 1;
    _new_code := 'KENROE-' ||
      upper(substr(encode(extensions.gen_random_bytes(6), 'base64'), 1, 6));
    _new_code := regexp_replace(_new_code, '[^A-Z0-9\-]', 'X', 'g');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.discount_codes WHERE lower(code) = lower(_new_code));
    IF _tries > 8 THEN
      RAISE EXCEPTION 'code_generation_failed';
    END IF;
  END LOOP;

  INSERT INTO public.discount_codes(code, percent_off, tier_id, max_uses, active, referrer_user_id, kind)
    VALUES (_new_code, 20, NULL, NULL, TRUE, _uid, 'referral');

  UPDATE public.profiles SET referral_code = _new_code WHERE id = _uid;

  RETURN _new_code;
END;
$$;