CREATE OR REPLACE VIEW public.vendor_reviews_public
WITH (security_invoker = on) AS
  SELECT id, vendor_id, rating, body, created_at
  FROM public.vendor_reviews;

GRANT SELECT ON public.vendor_reviews_public TO anon, authenticated;
GRANT ALL ON public.vendor_reviews_public TO service_role;