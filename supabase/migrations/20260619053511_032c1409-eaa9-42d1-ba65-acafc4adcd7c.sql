CREATE TABLE IF NOT EXISTS public.trial_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email_hash text,
  ip_hash text,
  device_hash text,
  outcome text NOT NULL,
  reason text,
  environment text NOT NULL DEFAULT 'live',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.trial_attempts TO authenticated;
GRANT ALL ON public.trial_attempts TO service_role;

ALTER TABLE public.trial_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trial attempts"
  ON public.trial_attempts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS trial_attempts_email_recent_idx ON public.trial_attempts(email_hash, created_at DESC) WHERE email_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS trial_attempts_ip_recent_idx ON public.trial_attempts(ip_hash, created_at DESC) WHERE ip_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_atelier_trial(
  _user_id uuid,
  _email_hash text,
  _email_domain text,
  _ip_hash text,
  _device_hash text,
  _user_agent text,
  _environment text DEFAULT 'live'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
  _ends_at timestamptz := now() + interval '30 days';
  _safe_user_id text := regexp_replace(_user_id::text, '[^a-zA-Z0-9_-]', '_', 'g');
  _existing_trial subscriptions%ROWTYPE;
  _reason text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Sign in to start the Atelier trial.');
  END IF;

  IF _email_hash IS NULL OR length(_email_hash) < 16 THEN
    INSERT INTO public.trial_attempts(user_id, email_hash, ip_hash, device_hash, outcome, reason, environment)
    VALUES (_user_id, _email_hash, nullif(_ip_hash, ''), nullif(_device_hash, ''), 'blocked', 'missing_email', coalesce(_environment, 'live'));
    RETURN jsonb_build_object('error', 'A verified email is required to start the Atelier trial.');
  END IF;

  SELECT * INTO _existing_trial
  FROM public.subscriptions
  WHERE user_id = _user_id
    AND price_id = 'atelier_trial_30d'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF _existing_trial.status = 'trialing'
      AND _existing_trial.current_period_end IS NOT NULL
      AND _existing_trial.current_period_end > _now THEN
      INSERT INTO public.trial_attempts(user_id, email_hash, ip_hash, device_hash, outcome, reason, environment)
      VALUES (_user_id, _email_hash, nullif(_ip_hash, ''), nullif(_device_hash, ''), 'allowed', 'already_active', coalesce(_environment, 'live'));
      RETURN jsonb_build_object(
        'status', 'active',
        'priceId', 'atelier_trial_30d',
        'endsAt', _existing_trial.current_period_end,
        'guestLimit', 5
      );
    END IF;
    _reason := 'account_trial_used';
    INSERT INTO public.trial_attempts(user_id, email_hash, ip_hash, device_hash, outcome, reason, environment)
    VALUES (_user_id, _email_hash, nullif(_ip_hash, ''), nullif(_device_hash, ''), 'blocked', _reason, coalesce(_environment, 'live'));
    RETURN jsonb_build_object('error', 'This 30-day Atelier trial has already been used on your account.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND atelier_trial_used = true) THEN
    _reason := 'profile_trial_used';
    INSERT INTO public.trial_attempts(user_id, email_hash, ip_hash, device_hash, outcome, reason, environment)
    VALUES (_user_id, _email_hash, nullif(_ip_hash, ''), nullif(_device_hash, ''), 'blocked', _reason, coalesce(_environment, 'live'));
    RETURN jsonb_build_object('error', 'This 30-day Atelier trial has already been used on your account.');
  END IF;

  IF (
    SELECT count(*) FROM public.trial_attempts
    WHERE email_hash = _email_hash
      AND outcome = 'blocked'
      AND created_at > _now - interval '1 hour'
  ) >= 3 THEN
    RETURN jsonb_build_object('error', 'Too many trial attempts. Please try again later.');
  END IF;

  IF _ip_hash IS NOT NULL AND _ip_hash <> '' AND (
    SELECT count(*) FROM public.trial_attempts
    WHERE ip_hash = _ip_hash
      AND outcome = 'blocked'
      AND created_at > _now - interval '1 hour'
  ) >= 3 THEN
    RETURN jsonb_build_object('error', 'Too many trial attempts from this network. Please try again later.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND price_id <> 'atelier_trial_30d'
      AND status IN ('active','trialing','past_due','canceled')
  ) THEN
    _reason := 'prior_paid_subscription';
    INSERT INTO public.trial_attempts(user_id, email_hash, ip_hash, device_hash, outcome, reason, environment)
    VALUES (_user_id, _email_hash, nullif(_ip_hash, ''), nullif(_device_hash, ''), 'blocked', _reason, coalesce(_environment, 'live'));
    RETURN jsonb_build_object('error', 'Trial access is for new customers only. You can manage or upgrade your existing plan from billing.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.trial_claims WHERE email_hash = _email_hash) THEN
    _reason := 'email_claimed';
    INSERT INTO public.trial_attempts(user_id, email_hash, ip_hash, device_hash, outcome, reason, environment)
    VALUES (_user_id, _email_hash, nullif(_ip_hash, ''), nullif(_device_hash, ''), 'blocked', _reason, coalesce(_environment, 'live'));
    RETURN jsonb_build_object('error', 'A 30-day Atelier trial has already been claimed for this email.');
  END IF;

  IF _device_hash IS NOT NULL AND _device_hash <> '' AND EXISTS (
    SELECT 1 FROM public.trial_claims
    WHERE device_hash = _device_hash
      AND created_at > _now - interval '180 days'
  ) THEN
    _reason := 'device_claimed_recently';
    INSERT INTO public.trial_attempts(user_id, email_hash, ip_hash, device_hash, outcome, reason, environment)
    VALUES (_user_id, _email_hash, nullif(_ip_hash, ''), nullif(_device_hash, ''), 'blocked', _reason, coalesce(_environment, 'live'));
    RETURN jsonb_build_object('error', 'A 30-day Atelier trial has already been claimed from this device recently.');
  END IF;

  IF _ip_hash IS NOT NULL AND _ip_hash <> '' AND EXISTS (
    SELECT 1 FROM public.trial_claims
    WHERE ip_hash = _ip_hash
      AND created_at > _now - interval '180 days'
  ) THEN
    _reason := 'network_claimed_recently';
    INSERT INTO public.trial_attempts(user_id, email_hash, ip_hash, device_hash, outcome, reason, environment)
    VALUES (_user_id, _email_hash, nullif(_ip_hash, ''), nullif(_device_hash, ''), 'blocked', _reason, coalesce(_environment, 'live'));
    RETURN jsonb_build_object('error', 'A 30-day Atelier trial has already been claimed from this network recently.');
  END IF;

  INSERT INTO public.trial_claims(user_id, email_hash, email_domain, ip_hash, device_hash, user_agent, environment)
  VALUES (_user_id, _email_hash, nullif(_email_domain, ''), nullif(_ip_hash, ''), nullif(_device_hash, ''), left(coalesce(_user_agent, ''), 500), coalesce(_environment, 'live'));

  INSERT INTO public.subscriptions(
    user_id,
    stripe_subscription_id,
    stripe_customer_id,
    product_id,
    price_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    environment
  ) VALUES (
    _user_id,
    'trial_' || _safe_user_id || '_' || coalesce(_environment, 'live'),
    'trial_cust_' || _safe_user_id,
    'trial_atelier',
    'atelier_trial_30d',
    'trialing',
    _now,
    _ends_at,
    true,
    coalesce(_environment, 'live')
  );

  UPDATE public.profiles
  SET tier = 'atelier',
      atelier_trial_used = true,
      atelier_trial_started_at = _now,
      atelier_trial_expires_at = _ends_at
  WHERE id = _user_id;

  INSERT INTO public.trial_attempts(user_id, email_hash, ip_hash, device_hash, outcome, reason, environment)
  VALUES (_user_id, _email_hash, nullif(_ip_hash, ''), nullif(_device_hash, ''), 'allowed', 'claimed', coalesce(_environment, 'live'));

  RETURN jsonb_build_object(
    'status', 'active',
    'priceId', 'atelier_trial_30d',
    'endsAt', _ends_at,
    'guestLimit', 5
  );
EXCEPTION
  WHEN unique_violation THEN
    INSERT INTO public.trial_attempts(user_id, email_hash, ip_hash, device_hash, outcome, reason, environment)
    VALUES (_user_id, _email_hash, nullif(_ip_hash, ''), nullif(_device_hash, ''), 'blocked', 'duplicate_claim', coalesce(_environment, 'live'));
    RETURN jsonb_build_object('error', 'This 30-day Atelier trial has already been claimed.');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_atelier_trial(uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_atelier_trial(uuid, text, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.claim_atelier_trial(uuid, text, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_atelier_trial(uuid, text, text, text, text, text, text) TO service_role;