CREATE OR REPLACE FUNCTION public.validate_discount_code(p_code text, p_tier_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.discount_codes%ROWTYPE;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Code not found');
  END IF;

  SELECT * INTO _row
  FROM public.discount_codes
  WHERE lower(code) = lower(trim(p_code))
    AND active = true
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
  -- p_tier_id = '*' means "skip tier scope" (used for add-ons / per-event purchases)
  IF _row.tier_id IS NOT NULL AND p_tier_id <> '*' AND _row.tier_id <> p_tier_id THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Code not valid on this plan');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'percent_off', _row.percent_off,
    'amount_off', _row.amount_off,
    'tier_id', _row.tier_id
  );
END;
$$;