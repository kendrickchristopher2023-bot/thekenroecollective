
ALTER TABLE public.ai_packages
  ADD COLUMN IF NOT EXISTS share_token text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_ai_packages_share_token ON public.ai_packages(share_token) WHERE share_token IS NOT NULL;

-- Public read policy: anyone can read packages that have an active share_token,
-- but only the safe shareable columns are returned via the dedicated server fn
-- (we still gate by share_token being present and non-null).
GRANT SELECT ON public.ai_packages TO anon;

DROP POLICY IF EXISTS "Public can read shared ai_packages" ON public.ai_packages;
CREATE POLICY "Public can read shared ai_packages"
  ON public.ai_packages
  FOR SELECT
  TO anon
  USING (share_token IS NOT NULL);
