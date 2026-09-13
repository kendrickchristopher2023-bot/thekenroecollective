
-- 1) Track which user owns a discount code (for personal referral codes)
ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS referrer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_discount_codes_referrer ON public.discount_codes(referrer_user_id);

-- 2) Cache the code on profile for quick lookup
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- 3) Referrals ledger
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_email_hash TEXT,
  code TEXT NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  credit_granted_at TIMESTAMPTZ,
  environment TEXT NOT NULL DEFAULT 'live',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON public.referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON public.referrals(code);

GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own referrals"
  ON public.referrals FOR SELECT
  TO authenticated
  USING (referrer_user_id = auth.uid() OR referred_user_id = auth.uid());

CREATE POLICY "Owners can see all referrals"
  ON public.referrals FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

-- 4) Personal code generator
CREATE OR REPLACE FUNCTION public.get_or_create_my_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      upper(substr(encode(gen_random_bytes(6), 'base64'), 1, 6));
    _new_code := regexp_replace(_new_code, '[^A-Z0-9\-]', 'X', 'g');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.discount_codes WHERE lower(code) = lower(_new_code));
    IF _tries > 8 THEN
      RAISE EXCEPTION 'code_generation_failed';
    END IF;
  END LOOP;

  INSERT INTO public.discount_codes(code, percent_off, tier_id, max_uses, active, referrer_user_id)
    VALUES (_new_code, 20, NULL, NULL, TRUE, _uid);

  UPDATE public.profiles SET referral_code = _new_code WHERE id = _uid;

  RETURN _new_code;
END;
$$;

-- 5) Redemption logger (called from checkout flow when a referral code is used)
CREATE OR REPLACE FUNCTION public.record_referral_redemption(
  _code TEXT,
  _referred_user_id UUID,
  _referred_email_hash TEXT DEFAULT NULL,
  _environment TEXT DEFAULT 'live'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referrer UUID;
  _row_id UUID;
BEGIN
  SELECT referrer_user_id INTO _referrer
    FROM public.discount_codes
    WHERE lower(code) = lower(_code) AND active = TRUE
    LIMIT 1;

  IF _referrer IS NULL OR _referrer = _referred_user_id THEN
    -- Not a referral code, or self-referral attempt
    RETURN NULL;
  END IF;

  INSERT INTO public.referrals(referrer_user_id, referred_user_id, referred_email_hash, code, environment)
    VALUES (_referrer, _referred_user_id, _referred_email_hash, _code, COALESCE(_environment, 'live'))
    RETURNING id INTO _row_id;

  RETURN _row_id;
END;
$$;
