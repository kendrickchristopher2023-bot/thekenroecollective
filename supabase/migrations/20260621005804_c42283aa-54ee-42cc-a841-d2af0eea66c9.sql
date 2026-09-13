
CREATE TABLE public.design_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('menu','package','apparel','signage','favor','thank_you')),
  template_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled design',
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  thumbnail_url TEXT,
  share_token TEXT UNIQUE,
  environment TEXT NOT NULL DEFAULT 'live',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.design_assets TO authenticated;
GRANT SELECT ON public.design_assets TO anon;
GRANT ALL ON public.design_assets TO service_role;

ALTER TABLE public.design_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their designs"
  ON public.design_assets FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public can read shared designs"
  ON public.design_assets FOR SELECT
  TO anon, authenticated
  USING (share_token IS NOT NULL);

CREATE INDEX idx_design_assets_user ON public.design_assets(user_id, updated_at DESC);
CREATE INDEX idx_design_assets_share ON public.design_assets(share_token) WHERE share_token IS NOT NULL;

CREATE TRIGGER design_assets_set_updated_at
  BEFORE UPDATE ON public.design_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();
