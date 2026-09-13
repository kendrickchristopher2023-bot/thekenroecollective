-- Internal / service-role-only tables: RLS is enabled with no policies (fail closed).
-- Remove residual table-level grants so anon/authenticated have no privileges at all.
REVOKE ALL ON TABLE public.data_cleanup_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.auth_rate_limit FROM anon, authenticated;
REVOKE ALL ON TABLE public.support_rate_limit FROM anon, authenticated;
REVOKE ALL ON TABLE public.guest_privacy_rate_limit FROM anon, authenticated;
REVOKE ALL ON TABLE public.guest_privacy_requests FROM anon, authenticated;
REVOKE ALL ON TABLE public.vendor_search_cache FROM anon, authenticated;

GRANT ALL ON TABLE public.data_cleanup_log TO service_role;
GRANT ALL ON TABLE public.auth_rate_limit TO service_role;
GRANT ALL ON TABLE public.support_rate_limit TO service_role;
GRANT ALL ON TABLE public.guest_privacy_rate_limit TO service_role;
GRANT ALL ON TABLE public.guest_privacy_requests TO service_role;
GRANT ALL ON TABLE public.vendor_search_cache TO service_role;

-- Paid entitlement table: reads stay policy-gated for signed-in users; no client writes.
REVOKE ALL ON TABLE public.event_addons FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.event_addons FROM authenticated;
GRANT SELECT ON TABLE public.event_addons TO authenticated;
GRANT ALL ON TABLE public.event_addons TO service_role;
