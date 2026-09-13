-- The prior migration (20260727201426) revoked SELECT on specific columns
-- (email, phone) from anon/authenticated, but anon/authenticated already
-- held a blanket table-level SELECT grant on vendors — in Postgres, a
-- broader table-level grant is not narrowed by a column-level REVOKE, so
-- that fix was a no-op. The same was true for review_notes/reviewed_by,
-- despite a code comment (vendors.functions.ts) claiming they were already
-- revoked. Any signed-in user could read every verified vendor's email,
-- phone, and internal review notes directly via a raw Supabase query.
--
-- Fix: revoke the table-level grant entirely, then explicitly grant
-- column-level SELECT for only the public-safe columns. This matches
-- exactly what listVendors/getVendorBySlug already select — no legitimate
-- code path needs email/phone/review_notes/reviewed_by/reviewed_at through
-- the anon/authenticated-scoped client (getMyVendor and the admin review
-- panel already correctly use the service-role client for those).
REVOKE SELECT ON public.vendors FROM anon, authenticated;
GRANT SELECT (id, owner_user_id, name, slug, category, city, region, country, bio, website, hero_image, gallery, price_range, status, verified_at, created_at, updated_at)
  ON public.vendors TO anon, authenticated;
