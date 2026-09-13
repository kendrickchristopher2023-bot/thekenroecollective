-- carts: one open collection per user per environment
CREATE TABLE public.carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'live' CHECK (environment IN ('sandbox','live')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','checking_out','completed','abandoned')),
  promo_code text,
  stripe_session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX carts_one_open_per_user_env
  ON public.carts (user_id, environment)
  WHERE status = 'open';
CREATE INDEX carts_user_env_idx ON public.carts (user_id, environment);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts TO authenticated;
GRANT ALL ON public.carts TO service_role;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own carts"
  ON public.carts FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own carts"
  ON public.carts FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own carts"
  ON public.carts FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own carts"
  ON public.carts FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER carts_touch_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- cart_items: rows within a cart
CREATE TABLE public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  sku text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('subscription','addon_event','addon_account','ai_package')),
  event_id text,
  project_id uuid,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 5000),
  unit_amount_cents integer,
  currency text NOT NULL DEFAULT 'usd',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cart_items_cart_idx ON public.cart_items (cart_id);
-- One row per (cart, sku, event) so re-adding bumps quantity instead of duplicating
CREATE UNIQUE INDEX cart_items_unique_sku
  ON public.cart_items (cart_id, sku, COALESCE(event_id, ''), COALESCE(project_id::text, ''));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT ALL ON public.cart_items TO service_role;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items in their own carts"
  ON public.cart_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can insert items into their own carts"
  ON public.cart_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.user_id = auth.uid() AND c.status = 'open'));
CREATE POLICY "Users can update items in their own carts"
  ON public.cart_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.user_id = auth.uid() AND c.status = 'open'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.user_id = auth.uid() AND c.status = 'open'));
CREATE POLICY "Users can delete items from their own carts"
  ON public.cart_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.user_id = auth.uid() AND c.status = 'open'));