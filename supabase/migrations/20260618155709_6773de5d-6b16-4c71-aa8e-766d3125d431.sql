ALTER TABLE public.ad_placements
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'featured';

ALTER TABLE public.ad_placements
  DROP CONSTRAINT IF EXISTS ad_placements_tier_check;
ALTER TABLE public.ad_placements
  ADD CONSTRAINT ad_placements_tier_check CHECK (tier IN ('featured','spotlight'));

CREATE INDEX IF NOT EXISTS idx_ad_placements_owner ON public.ad_placements(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_ad_placements_sub ON public.ad_placements(stripe_subscription_id);

-- Vendors can manage their own ad placements
DROP POLICY IF EXISTS "Vendors manage own ads" ON public.ad_placements;
CREATE POLICY "Vendors manage own ads"
  ON public.ad_placements
  FOR ALL
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Admins/owners full access
DROP POLICY IF EXISTS "Admins manage all ads" ON public.ad_placements;
CREATE POLICY "Admins manage all ads"
  ON public.ad_placements
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
