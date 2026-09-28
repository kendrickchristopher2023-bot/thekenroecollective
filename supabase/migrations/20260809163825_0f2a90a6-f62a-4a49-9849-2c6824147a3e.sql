GRANT SELECT, UPDATE, DELETE ON public.event_well_wishes TO authenticated;
GRANT ALL ON public.event_well_wishes TO service_role;
GRANT EXECUTE ON FUNCTION public.add_well_wish(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_well_wishes(text) TO anon, authenticated;