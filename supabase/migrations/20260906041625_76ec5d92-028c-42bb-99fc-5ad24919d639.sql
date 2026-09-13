DROP POLICY IF EXISTS "Business cards are public to read" ON public.business_cards;
REVOKE SELECT ON public.business_cards FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_cards TO authenticated;
GRANT ALL ON public.business_cards TO service_role;