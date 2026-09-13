DROP POLICY IF EXISTS "auth read yelp cache" ON public.yelp_cache;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.yelp_cache FROM authenticated;
ALTER TABLE public.yelp_cache ENABLE ROW LEVEL SECURITY;