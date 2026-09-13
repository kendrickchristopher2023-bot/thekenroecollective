REVOKE SELECT (email, phone) ON public.vendors FROM authenticated;
REVOKE SELECT (email, phone) ON public.vendors FROM anon;