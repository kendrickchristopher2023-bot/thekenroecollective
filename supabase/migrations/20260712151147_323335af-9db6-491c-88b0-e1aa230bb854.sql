
-- 1. Extend one_time_passes with refund tracking
ALTER TABLE public.one_time_passes
  ADD COLUMN IF NOT EXISTS first_material_use_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_reason text;

-- Extend tier check to allow 'whisper' (previously host/atelier only)
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name FROM pg_constraint
  WHERE conrelid = 'public.one_time_passes'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%tier%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.one_time_passes DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.one_time_passes
  ADD CONSTRAINT one_time_passes_tier_check
  CHECK (tier IN ('whisper', 'host', 'atelier'));

-- 2. mark_pass_material_use: stamp first_material_use_at once per pass attached to the given event
CREATE OR REPLACE FUNCTION public.mark_pass_material_use(_user uuid, _event_id text, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.one_time_passes
    SET first_material_use_at = now(),
        refund_reason = COALESCE(refund_reason, _reason)
  WHERE user_id = _user
    AND event_id = _event_id
    AND first_material_use_at IS NULL
    AND revoked_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_pass_material_use(uuid, text, text) TO authenticated, service_role;

-- 3. refund_log: append-only record of refunds
CREATE TABLE IF NOT EXISTS public.refund_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pass_id uuid REFERENCES public.one_time_passes(id) ON DELETE SET NULL,
  stripe_refund_id text,
  stripe_payment_intent_id text,
  amount_cents integer,
  currency text,
  reason text,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.refund_log TO authenticated;
GRANT ALL ON public.refund_log TO service_role;

ALTER TABLE public.refund_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own refunds" ON public.refund_log;
CREATE POLICY "Users view own refunds"
  ON public.refund_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role manages refunds" ON public.refund_log;
CREATE POLICY "Service role manages refunds"
  ON public.refund_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_refund_log_user ON public.refund_log(user_id);

-- 4. purchase_consent_log: append-only legal-evidence record
CREATE TABLE IF NOT EXISTS public.purchase_consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  price_id text NOT NULL,
  event_id text,
  consent_text text NOT NULL,
  terms_version text,
  refund_policy_version text,
  ip_address text,
  user_agent text,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.purchase_consent_log TO authenticated;
GRANT ALL ON public.purchase_consent_log TO service_role;

ALTER TABLE public.purchase_consent_log ENABLE ROW LEVEL SECURITY;

-- Append-only: users may insert their own consent, read their own consent; no updates or deletes.
DROP POLICY IF EXISTS "Users insert own consent" ON public.purchase_consent_log;
CREATE POLICY "Users insert own consent"
  ON public.purchase_consent_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "Users view own consent" ON public.purchase_consent_log;
CREATE POLICY "Users view own consent"
  ON public.purchase_consent_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role manages consent" ON public.purchase_consent_log;
CREATE POLICY "Service role manages consent"
  ON public.purchase_consent_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_purchase_consent_user ON public.purchase_consent_log(user_id);
