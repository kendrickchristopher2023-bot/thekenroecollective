
-- Product updates (app changelog / "what's new")
CREATE TABLE public.product_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  emoji TEXT,
  body_html TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT,
  cta_label TEXT,
  cta_url TEXT,
  audience_tier TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_updates TO authenticated;
GRANT SELECT ON public.product_updates TO anon;
GRANT ALL ON public.product_updates TO service_role;

ALTER TABLE public.product_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published updates"
  ON public.product_updates FOR SELECT
  USING (status = 'published');

CREATE POLICY "Owners read all updates"
  ON public.product_updates FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners insert updates"
  ON public.product_updates FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners update updates"
  ON public.product_updates FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners delete updates"
  ON public.product_updates FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER product_updates_set_updated_at
  BEFORE UPDATE ON public.product_updates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_product_updates_published ON public.product_updates(status, published_at DESC);

-- Per-user dismissals
CREATE TABLE public.product_update_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id UUID NOT NULL REFERENCES public.product_updates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (update_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.product_update_dismissals TO authenticated;
GRANT ALL ON public.product_update_dismissals TO service_role;

ALTER TABLE public.product_update_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own dismissals"
  ON public.product_update_dismissals FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_product_update_dismissals_user ON public.product_update_dismissals(user_id);
