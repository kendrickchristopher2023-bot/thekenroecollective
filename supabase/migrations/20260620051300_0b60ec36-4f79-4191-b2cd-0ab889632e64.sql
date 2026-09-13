CREATE TABLE public.event_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addon_key text NOT NULL,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  environment text NOT NULL DEFAULT 'sandbox',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, addon_key, environment)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_addons TO authenticated;
GRANT ALL ON public.event_addons TO service_role;

ALTER TABLE public.event_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own event addons"
  ON public.event_addons FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users can insert their own event addons"
  ON public.event_addons FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX event_addons_event_idx ON public.event_addons(event_id, environment);
CREATE INDEX event_addons_user_idx ON public.event_addons(user_id);
