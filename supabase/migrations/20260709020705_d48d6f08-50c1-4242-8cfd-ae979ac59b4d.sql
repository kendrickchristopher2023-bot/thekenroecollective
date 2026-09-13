-- Revoke public/authenticated access to internal admin/billing columns.
-- Admin UI reads these via the service_role client, which bypasses RLS and
-- has ALL grants, so admin flows are unaffected.

REVOKE SELECT (review_notes, reviewed_by, stripe_subscription_id)
  ON public.ad_placements FROM anon, authenticated;

REVOKE SELECT (review_notes, reviewed_by)
  ON public.vendors FROM anon, authenticated;