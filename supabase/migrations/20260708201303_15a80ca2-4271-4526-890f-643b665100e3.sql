
-- Drop overly-permissive "share_token IS NOT NULL" public read policies
DROP POLICY IF EXISTS "Public can read shared ai_packages" ON public.ai_packages;
DROP POLICY IF EXISTS "Public can read shared designs" ON public.design_assets;

-- Token-scoped RPCs. SECURITY DEFINER so anon can read a single row only
-- when they supply the exact share_token; no listing/enumeration possible.

CREATE OR REPLACE FUNCTION public.get_shared_ai_package(p_token text)
RETURNS SETOF public.ai_packages
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.ai_packages
  WHERE share_token IS NOT NULL
    AND share_token = p_token
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_shared_design(p_token text)
RETURNS SETOF public.design_assets
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.design_assets
  WHERE share_token IS NOT NULL
    AND share_token = p_token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_shared_ai_package(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shared_design(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_ai_package(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_design(text) TO anon, authenticated;
