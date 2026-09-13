-- ============================================================
-- Function EXECUTE privileges were still granted to PUBLIC ("=X/...") on many
-- of this app's functions. PUBLIC is inherited by anon and authenticated, so
-- role-level REVOKEs alone did not remove access. Strip PUBLIC EXECUTE from
-- every function/procedure the app owns in the public schema (skipping any
-- function provided by an extension so defaults like gen_random_uuid() keep
-- working), then grant back the minimum required per caller type.
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid
          AND d.classid = 'pg_proc'::regclass
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ── Public (no sign-in) helpers: required by public pages, each validates
--    its own token/input. ─────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_public_event_by_id(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_event_by_slug(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_update_guest(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_set_checkin(text, text, boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_design(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_ai_package(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rfq_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_rfq_bid_by_token(text, numeric, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decline_rfq_invitation_by_token(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_auth_rate_limit(text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_chat_rate_check(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_discount_code(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_discount_code(text, text, uuid) TO anon, authenticated;

-- ── Signed-in users: permission checks used by RLS policies and app reads,
--    plus self-service actions that enforce auth.uid() internally. ────────
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_event_addon(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_ai_packages_access(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pass_active_for_event(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_owner_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_can_edit_project(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_can_link_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_has_events_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_is_project_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_is_project_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_project_is_linked_to_event(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rfq_invited_vendor_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_my_referral_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_packages_trial(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_credit(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pass_material_use(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_set_role(uuid, public.app_role, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_analytics_snapshot(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_analytics_snapshot(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_contacts_snapshot(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_contacts_snapshot(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;