GRANT INSERT ON public.support_tickets TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;