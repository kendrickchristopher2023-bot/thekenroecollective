GRANT SELECT, UPDATE, DELETE ON TABLE public.event_well_wishes TO authenticated;
GRANT ALL ON TABLE public.event_well_wishes TO service_role;
REVOKE ALL ON TABLE public.event_well_wishes FROM anon;
GRANT EXECUTE ON FUNCTION public.add_well_wish(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_well_wishes(text) TO anon, authenticated;