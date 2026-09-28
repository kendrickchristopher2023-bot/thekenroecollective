CREATE TABLE public.one_time_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('host','atelier')),
  event_id text REFERENCES public.events(id) ON DELETE SET NULL,
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  price_id text,
  environment text NOT NULL DEFAULT 'sandbox',
  purchased_at timestamptz NOT NULL DEFAULT now(),
  attached_at timestamptz,
  expires_at timestamptz NOT NULL,
  ai_generations_used integer NOT NULL DEFAULT 0,
  ai_generations_cap integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_one_time_passes_user ON public.one_time_passes(user_id);
CREATE INDEX idx_one_time_passes_event ON public.one_time_passes(event_id);

GRANT SELECT, UPDATE ON public.one_time_passes TO authenticated;
GRANT ALL ON public.one_time_passes TO service_role;

ALTER TABLE public.one_time_passes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own passes" ON public.one_time_passes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users attach own passes" ON public.one_time_passes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages passes" ON public.one_time_passes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_updated_at_one_time_passes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_one_time_passes_updated_at
  BEFORE UPDATE ON public.one_time_passes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_one_time_passes();

CREATE OR REPLACE FUNCTION public.pass_active_for_event(_user uuid, _event text, _tier text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.one_time_passes
    WHERE user_id = _user AND event_id = _event AND tier = _tier AND expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.consume_ai_credit(_pass_id uuid, _user uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE remaining integer;
BEGIN
  UPDATE public.one_time_passes
    SET ai_generations_used = ai_generations_used + 1
    WHERE id = _pass_id AND user_id = _user AND expires_at > now()
      AND (ai_generations_cap IS NULL OR ai_generations_used < ai_generations_cap)
    RETURNING (COALESCE(ai_generations_cap, 999999) - ai_generations_used) INTO remaining;
  RETURN remaining;
END; $$;

UPDATE public.pricing_tiers SET price_onetime = 49.00 WHERE id = 'host';
UPDATE public.pricing_tiers SET price_onetime = 119.00 WHERE id = 'atelier';