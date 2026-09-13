-- ============================================================
-- 1. vendors: stop exposing email/phone through the Data API.
-- Column-level grants already exclude email/phone, but the table-level
-- SELECT grant overrides them, so revoke table-level SELECT and keep the
-- per-column grants for the safe directory columns.
-- ============================================================
REVOKE SELECT ON public.vendors FROM anon, authenticated;

GRANT SELECT (
  id, owner_user_id, name, slug, category, city, region, country, bio,
  website, hero_image, gallery, price_range, status, verified_at,
  created_at, updated_at
) ON public.vendors TO anon, authenticated;

-- ============================================================
-- 2. site_settings: no anonymous read of contact_email.
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read site settings" ON public.site_settings;

CREATE POLICY "Admins can read site settings"
  ON public.site_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'owner'::public.app_role));

REVOKE SELECT ON public.site_settings FROM anon;

-- ============================================================
-- 3. vendor_reviews: keep reviews public, hide reviewer identity from anon.
-- ============================================================
REVOKE SELECT ON public.vendor_reviews FROM anon;
GRANT SELECT (id, vendor_id, rating, body, created_at) ON public.vendor_reviews TO anon;

-- ============================================================
-- 4. support_tickets: internal AI draft is not readable by ticket owners.
-- ============================================================
REVOKE SELECT ON public.support_tickets FROM authenticated;
GRANT SELECT (
  id, user_id, contact_email, contact_name, subject, message,
  final_reply, status, created_at, updated_at
) ON public.support_tickets TO authenticated;

-- ============================================================
-- 5. rfq_invitations: holds invitee PII; no anonymous access at all.
-- The public claim flow uses SECURITY DEFINER token RPCs.
-- ============================================================
REVOKE ALL ON public.rfq_invitations FROM anon;

-- ============================================================
-- 6. SECURITY DEFINER functions: least-privilege EXECUTE.
-- Start from a clean slate on the definer functions we manage, then grant
-- back only what each caller type genuinely needs.
-- ============================================================

-- 6a. Trigger-only functions: never callable directly.
REVOKE ALL ON FUNCTION public.ad_placements_restrict_vendor_updates() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.one_time_passes_restrict_user_updates() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_atelier_trial_guest_limit() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_new_ad_placement() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_new_vendor() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_seed_admin() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.email_queue_wake() FROM anon, authenticated;

-- 6b. Infrastructure / cron / service-role-only functions.
REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_cron_shared_secret() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_app_error_logs() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_discount_usage(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.record_referral_redemption(text, uuid, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_pass_material_use_by_event(text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_atelier_trial(uuid, text, text, text, text, text, text) FROM anon, authenticated;

-- 6c. Signed-in-user functions: authenticated only, never anon.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.has_active_subscription(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.has_event_addon(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.has_ai_packages_access(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.pass_active_for_event(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_event_owner_id(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_or_create_my_referral_code() FROM anon;
REVOKE ALL ON FUNCTION public.request_account_deletion() FROM anon;
REVOKE ALL ON FUNCTION public.cancel_account_deletion() FROM anon;
REVOKE ALL ON FUNCTION public.claim_first_admin() FROM anon;
REVOKE ALL ON FUNCTION public.claim_ai_packages_trial(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.consume_ai_credit(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.mark_pass_material_use(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.super_admin_set_role(uuid, public.app_role, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.owner_analytics_snapshot(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.owner_analytics_snapshot(timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.owner_contacts_snapshot(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.owner_contacts_snapshot(timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.pm_can_edit_project(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.pm_can_link_events(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.pm_has_events_access(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.pm_is_project_admin(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.pm_is_project_member(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.pm_project_is_linked_to_event(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.rfq_invited_vendor_owner(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.sms_mark_opt_in(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.sms_mark_opt_out(text) FROM anon, authenticated;

-- 6d. Genuinely public helpers keep anon EXECUTE (public event pages, guest
-- RSVP/check-in, share links, discount validation, rate limits, bid links).
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