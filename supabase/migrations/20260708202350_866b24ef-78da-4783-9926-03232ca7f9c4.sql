-- Lock discount_codes to owners only; expose safe validation via RPC
DROP POLICY IF EXISTS "authenticated read usable discount codes" ON public.discount_codes;
DROP POLICY IF EXISTS "admin write codes" ON public.discount_codes;

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
  IF _row.tier_id IS NOT NULL AND _row.tier_id <> p_tier_id THEN
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

REVOKE ALL ON FUNCTION public.validate_discount_code(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_discount_code(text, text) TO anon, authenticated, service_role;

-- Extend the existing seed trigger so Adrian gets owner+admin on first sign-up
CREATE OR REPLACE FUNCTION public.grant_seed_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) IN (
    lower('kendrickchristopher@hotmail.com'),
    lower('adrian@kenroecollective.com'),
    lower('adrianmonroe@kenroecollective.com')
  ) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;