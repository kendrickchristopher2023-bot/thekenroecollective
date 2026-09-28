-- vendors: stop exposing owner_user_id through the public Data API
REVOKE SELECT (owner_user_id) ON public.vendors FROM anon, authenticated;

-- vendor_reviews: replace blanket SELECT with column-scoped SELECT
REVOKE SELECT ON public.vendor_reviews FROM anon, authenticated;
GRANT SELECT (id, vendor_id, rating, body, created_at) ON public.vendor_reviews TO anon, authenticated;
GRANT ALL ON public.vendor_reviews TO service_role;