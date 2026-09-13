CREATE OR REPLACE FUNCTION public.increment_discount_usage(discount_code text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.discount_codes
  SET used_count = used_count + 1
  WHERE lower(code) = lower(discount_code)
    AND active = true
    AND (max_uses IS NULL OR used_count < max_uses);
$$;

REVOKE ALL ON FUNCTION public.increment_discount_usage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_discount_usage(text) TO service_role;