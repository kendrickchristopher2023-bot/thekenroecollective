REVOKE ALL ON public.event_well_wishes FROM anon;
REVOKE INSERT, TRUNCATE, REFERENCES, TRIGGER ON public.event_well_wishes FROM authenticated;