REVOKE SELECT (email, phone) ON public.vendors FROM anon, authenticated;
REVOKE UPDATE (email, phone) ON public.vendors FROM anon;
REVOKE INSERT (email, phone) ON public.vendors FROM anon;
-- Authenticated owners upsert via server function using service role, but keep INSERT/UPDATE on these columns for authenticated so RLS-based writes by owners still work.
GRANT INSERT (email, phone), UPDATE (email, phone) ON public.vendors TO authenticated;