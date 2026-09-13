-- ============================================================================
-- Vendor privacy: permanent fix for the recurring reviewer-identity and
-- vendor-contact exposure.
--
-- ROOT CAUSE of the recurrences: the base tables kept broad "verified rows are
-- public" SELECT policies, and privacy relied on COLUMN-level grants. Any later
-- blanket `GRANT SELECT ON public.vendors TO anon` silently re-widened those
-- column grants back to every column, with no error, re-exposing email, phone,
-- review_notes, reviewed_by, owner_user_id and reviewer_user_id.
--
-- PERMANENT SHAPE:
--   * anon + authenticated have NO privileges at all on the base tables.
--   * public/directory reads go exclusively through the safe views.
--   * writes and owner/admin reads go through server code that verifies the
--     caller (service role), not through client-reachable table grants.
-- ============================================================================

-- 1. Drop the broad base-table read policies that caused the exposure.
DROP POLICY IF EXISTS "Public can view verified vendors" ON public.vendors;
DROP POLICY IF EXISTS "Signed-in can view verified vendors" ON public.vendors;
DROP POLICY IF EXISTS "Signed-in can view verified or own vendors" ON public.vendors;
DROP POLICY IF EXISTS "Public can view reviews of verified vendors" ON public.vendor_reviews;
DROP POLICY IF EXISTS "Signed-in can view reviews of verified vendors" ON public.vendor_reviews;

-- 2. Remove ALL base-table privileges from the two public-facing roles.
--    This also clears every historic column-level grant on these tables.
REVOKE ALL ON public.vendors FROM anon, authenticated;
REVOKE ALL ON public.vendor_reviews FROM anon, authenticated;
REVOKE ALL (email, phone) ON public.vendors FROM anon, authenticated;
REVOKE ALL (id, vendor_id, rating, body, created_at) ON public.vendor_reviews FROM anon, authenticated;

GRANT ALL ON public.vendors TO service_role;
GRANT ALL ON public.vendor_reviews TO service_role;

-- 3. Rebuild the safe views. They are owner-executed on purpose: the base
--    tables are unreadable to anon/authenticated, so an invoker view could not
--    work. The projection below IS the security boundary, plus a
--    verified-only row filter and security_barrier to stop predicate pushdown.
DROP VIEW IF EXISTS public.vendors_public;
CREATE VIEW public.vendors_public
WITH (security_barrier = true) AS
  SELECT
    id,
    slug,
    name,
    category,
    city,
    region,
    country,
    bio,
    website,
    hero_image,
    gallery,
    price_range,
    status,
    verified_at,
    created_at
  FROM public.vendors
  WHERE status = 'verified';

DROP VIEW IF EXISTS public.vendor_reviews_public;
CREATE VIEW public.vendor_reviews_public
WITH (security_barrier = true) AS
  SELECT
    r.id,
    r.vendor_id,
    r.rating,
    r.body,
    r.created_at
  FROM public.vendor_reviews r
  JOIN public.vendors v ON v.id = r.vendor_id AND v.status = 'verified';

REVOKE ALL ON public.vendors_public FROM anon, authenticated;
REVOKE ALL ON public.vendor_reviews_public FROM anon, authenticated;
GRANT SELECT ON public.vendors_public TO anon, authenticated;
GRANT SELECT ON public.vendor_reviews_public TO anon, authenticated;
GRANT ALL ON public.vendors_public TO service_role;
GRANT ALL ON public.vendor_reviews_public TO service_role;

-- 4. In-schema warnings so the next edit cannot make this mistake quietly.
COMMENT ON TABLE public.vendors IS
  'PRIVACY LOCKED. Contains vendor email, phone, review_notes, reviewed_by, stripe_subscription_id and owner_user_id. anon and authenticated MUST have zero privileges here. Never run GRANT SELECT ON public.vendors TO anon/authenticated (blanket OR column-level) - that is exactly what re-exposed vendor contact data four times. Public/directory reads use public.vendors_public. Owner/admin reads and all writes go through server code using the service role after verifying the caller.';

COMMENT ON TABLE public.vendor_reviews IS
  'PRIVACY LOCKED. Contains reviewer_user_id (reviewer identity). anon and authenticated MUST have zero privileges here. Never run GRANT SELECT ON public.vendor_reviews TO anon/authenticated (blanket OR column-level). Public reads use public.vendor_reviews_public. Review writes go through server code using the service role after verifying an accepted RFQ for the caller.';

COMMENT ON VIEW public.vendors_public IS
  'Directory-safe projection of public.vendors (verified rows only). Owner-executed on purpose because the base table is unreadable to anon/authenticated. NEVER add email, phone, review_notes, reviewed_by, reviewed_at, owner_user_id or stripe_subscription_id to this view.';

COMMENT ON VIEW public.vendor_reviews_public IS
  'Public projection of public.vendor_reviews for verified vendors. Owner-executed on purpose because the base table is unreadable to anon/authenticated. NEVER add reviewer_user_id to this view.';