ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS atelier_trial_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS atelier_trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS atelier_trial_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS public.trial_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_hash text NOT NULL,
  email_domain text,
  ip_hash text,
  device_hash text,
  user_agent text,
  environment text NOT NULL DEFAULT 'live',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (email_hash)
);

GRANT SELECT ON public.trial_claims TO authenticated;
GRANT ALL ON public.trial_claims TO service_role;

ALTER TABLE public.trial_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trial claim"
  ON public.trial_claims FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS trial_claims_ip_recent_idx ON public.trial_claims(ip_hash, created_at DESC) WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS trial_claims_device_recent_idx ON public.trial_claims(device_hash, created_at DESC) WHERE device_hash IS NOT NULL;

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
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Sign in to start the Atelier trial.');
  END IF;

  IF _email_hash IS NULL OR length(_email_hash) < 16 THEN
    RETURN jsonb_build_object('error', 'A verified email is required to start the Atelier trial.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND atelier_trial_used = true) THEN
    RETURN jsonb_build_object('error', 'This 30-day Atelier trial has already been used on your account.');
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
      RETURN jsonb_build_object(
        'status', 'active',
        'priceId', 'atelier_trial_30d',
        'endsAt', _existing_trial.current_period_end,
        'guestLimit', 5
      );
    END IF;
    RETURN jsonb_build_object('error', 'This 30-day Atelier trial has already been used on your account.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND price_id <> 'atelier_trial_30d'
      AND status IN ('active','trialing','past_due','canceled')
  ) THEN
    RETURN jsonb_build_object('error', 'Trial access is for new customers only. You can manage or upgrade your existing plan from billing.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.trial_claims WHERE email_hash = _email_hash) THEN
    RETURN jsonb_build_object('error', 'A 30-day Atelier trial has already been claimed for this email.');
  END IF;

  IF _device_hash IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.trial_claims
    WHERE device_hash = _device_hash
      AND created_at > _now - interval '180 days'
  ) THEN
    RETURN jsonb_build_object('error', 'A 30-day Atelier trial has already been claimed from this device recently.');
  END IF;

  IF _ip_hash IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.trial_claims
    WHERE ip_hash = _ip_hash
      AND created_at > _now - interval '180 days'
  ) THEN
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

  RETURN jsonb_build_object(
    'status', 'active',
    'priceId', 'atelier_trial_30d',
    'endsAt', _ends_at,
    'guestLimit', 5
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'This 30-day Atelier trial has already been claimed.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_atelier_trial(uuid, text, text, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_atelier_trial_guest_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _guest_count int := 0;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.data->'guests') = 'array' THEN
    _guest_count := jsonb_array_length(NEW.data->'guests');
  END IF;

  IF _guest_count > 5 AND EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = NEW.user_id
      AND s.price_id = 'atelier_trial_30d'
      AND s.status = 'trialing'
      AND s.current_period_end > now()
  ) THEN
    RAISE EXCEPTION 'The 30-day Atelier trial supports up to 5 guests. Upgrade to Atelier to invite more guests.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_atelier_trial_guest_limit_trigger ON public.events;
CREATE TRIGGER enforce_atelier_trial_guest_limit_trigger
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_atelier_trial_guest_limit();