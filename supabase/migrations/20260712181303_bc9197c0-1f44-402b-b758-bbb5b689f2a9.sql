-- Restrict direct access to vendor contact fields (email, phone).
-- Only service_role (server-side admin/RFQ fanout code) may read these columns.
-- End users must go through the RFQ flow to contact vendors.
REVOKE SELECT (email, phone) ON public.vendors FROM anon, authenticated;
-- Explicitly ensure service_role retains access.
GRANT SELECT (email, phone) ON public.vendors TO service_role;