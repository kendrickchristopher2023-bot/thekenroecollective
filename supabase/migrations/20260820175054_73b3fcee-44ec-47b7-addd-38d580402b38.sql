-- rfq_invitations: make invitation rows server-write-only so claim tokens
-- can never be created or altered from a browser session.
DROP POLICY IF EXISTS "requester creates rfq invitations" ON public.rfq_invitations;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.rfq_invitations FROM authenticated;
REVOKE ALL ON public.rfq_invitations FROM anon;
GRANT SELECT ON public.rfq_invitations TO authenticated;
GRANT ALL ON public.rfq_invitations TO service_role;
COMMENT ON TABLE public.rfq_invitations IS 'Server-write-only. Clients have SELECT only (requester or invited vendor owner via RLS). All inserts/updates, including claim_token issuance and token-based claiming, go through service-role server code or SECURITY DEFINER RPCs that validate the token. Never grant INSERT/UPDATE/DELETE to anon or authenticated.';

-- event_addons: paid per-event entitlements. Readable by owner/admin only,
-- written exclusively by the Stripe webhook / server code (service role).
REVOKE ALL ON public.event_addons FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.event_addons FROM authenticated;
GRANT SELECT ON public.event_addons TO authenticated;
GRANT ALL ON public.event_addons TO service_role;
COMMENT ON TABLE public.event_addons IS 'Purchased per-event add-ons. Clients get SELECT only, scoped to the owning user or owner/admin roles. Writes are service-role only (Stripe webhook / server functions). Public event pages read entitlements through get_event_public_entitlements(); never grant anon access.';

-- ecard_rate_limit: internal counters, fail-closed with no policies. Ensure no
-- client role can reach it at all.
REVOKE ALL ON public.ecard_rate_limit FROM anon, authenticated;
GRANT ALL ON public.ecard_rate_limit TO service_role;
COMMENT ON TABLE public.ecard_rate_limit IS 'Internal rate-limit counters. RLS enabled with zero policies and no grants to anon/authenticated: intentionally unreachable from any client. Only SECURITY DEFINER RPCs and service-role server code touch it. Never add client grants or policies.';