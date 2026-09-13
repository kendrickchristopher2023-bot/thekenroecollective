GRANT SELECT ON public.pricing_tiers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pricing_tiers TO authenticated;
GRANT ALL ON public.pricing_tiers TO service_role;

GRANT SELECT ON public.discount_codes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.discount_codes TO authenticated;
GRANT ALL ON public.discount_codes TO service_role;

CREATE POLICY "public read usable discount codes"
ON public.discount_codes
FOR SELECT
TO anon, authenticated
USING (
  active = true
  AND (expires_at IS NULL OR expires_at > now())
  AND (max_uses IS NULL OR used_count < max_uses)
);

CREATE POLICY "owners manage discount codes"
ON public.discount_codes
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'owner'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "owners read all pricing tiers"
ON public.pricing_tiers
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "owners insert pricing tiers"
ON public.pricing_tiers
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "owners update pricing tiers"
ON public.pricing_tiers
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'owner'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "owners delete pricing tiers"
ON public.pricing_tiers
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'owner'::public.app_role));