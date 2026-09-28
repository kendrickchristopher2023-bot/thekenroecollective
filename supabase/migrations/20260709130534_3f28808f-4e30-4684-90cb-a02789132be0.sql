
-- 1. Add kind column to discount_codes
ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'promo';

UPDATE public.discount_codes SET kind = 'referral'
  WHERE referrer_user_id IS NOT NULL AND kind = 'promo';

-- 2. One referral redemption per user, ever
CREATE UNIQUE INDEX IF NOT EXISTS referrals_one_per_referred_user
  ON public.referrals(referred_user_id);

-- 3. Update generator to tag kind='referral'
CREATE OR REPLACE FUNCTION public.get_or_create_my_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- max_uses stays NULL: referrer can share widely; per-friend uniqueness
  -- enforced by referrals_one_per_referred_user + validate_discount_code.
  INSERT INTO public.discount_codes(code, percent_off, tier_id, max_uses, active, referrer_user_id, kind)
    VALUES (_new_code, 20, NULL, NULL, TRUE, _uid, 'referral');

  UPDATE public.profiles SET referral_code = _new_code WHERE id = _uid;

  RETURN _new_code;
END;
$function$;

-- 4. Enhanced validate_discount_code with optional user_id for referral guards.
-- Keep the old 2-arg signature working; add new 3-arg overload.
CREATE OR REPLACE FUNCTION public.validate_discount_code(
  p_code text,
  p_tier_id text,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.discount_codes%ROWTYPE;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Code not found');
  END IF;

  SELECT * INTO _row
  FROM public.discount_codes
  WHERE lower(code) = lower(trim(p_code)) AND active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Code not found');
  END IF;
  IF _row.expires_at IS NOT NULL AND _row.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Code expired');
  END IF;
  IF _row.max_uses IS NOT NULL AND _row.used_count >= _row.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Code fully redeemed');
  END IF;
  IF _row.tier_id IS NOT NULL AND p_tier_id <> '*' AND _row.tier_id <> p_tier_id THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Code not valid on this plan');
  END IF;

  -- Referral-specific guards
  IF _row.kind = 'referral' THEN
    IF p_user_id IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Sign in to use a referral link');
    END IF;
    IF _row.referrer_user_id = p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'You cannot use your own referral code');
    END IF;
    IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_user_id = p_user_id) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'This referral link has already been used on your account');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = p_user_id
        AND status IN ('active','trialing','past_due','canceled')
        AND price_id NOT LIKE 'atelier_trial%'
    ) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Referral codes are for first-time subscribers');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'percent_off', _row.percent_off,
    'amount_off', _row.amount_off,
    'tier_id', _row.tier_id,
    'kind', _row.kind
  );
END;
$function$;

-- Keep the 2-arg version as a thin wrapper so existing callers still compile.
CREATE OR REPLACE FUNCTION public.validate_discount_code(p_code text, p_tier_id text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.validate_discount_code(p_code, p_tier_id, NULL::uuid);
$function$;

-- 5. Tighten record_referral_redemption: self-referral + duplicate guard.
-- Unique index provides the hard guarantee; this returns NULL gracefully.
CREATE OR REPLACE FUNCTION public.record_referral_redemption(
  _code text,
  _referred_user_id uuid,
  _referred_email_hash text DEFAULT NULL::text,
  _environment text DEFAULT 'live'::text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _referrer UUID;
  _row_id UUID;
BEGIN
  SELECT referrer_user_id INTO _referrer
    FROM public.discount_codes
    WHERE lower(code) = lower(_code) AND active = TRUE AND kind = 'referral'
    LIMIT 1;

  IF _referrer IS NULL OR _referrer = _referred_user_id THEN
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_user_id = _referred_user_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.referrals(referrer_user_id, referred_user_id, referred_email_hash, code, environment)
    VALUES (_referrer, _referred_user_id, _referred_email_hash, _code, COALESCE(_environment, 'live'))
    ON CONFLICT (referred_user_id) DO NOTHING
    RETURNING id INTO _row_id;

  RETURN _row_id;
END;
$function$;
