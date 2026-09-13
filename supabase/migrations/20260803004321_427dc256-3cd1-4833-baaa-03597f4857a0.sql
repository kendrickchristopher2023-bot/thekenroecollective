-- 1. vendors_public must not be a SECURITY DEFINER view.
ALTER VIEW public.vendors_public SET (security_invoker = on);

-- With security_invoker the view enforces the caller's RLS, so anon needs a
-- narrow SELECT policy on verified vendors. Column-level grants below keep
-- email/phone/review_notes/owner_user_id unreadable for anon.
DROP POLICY IF EXISTS "Anon can view verified vendors" ON public.vendors;
CREATE POLICY "Anon can view verified vendors"
  ON public.vendors FOR SELECT TO anon
  USING (status = 'verified');

-- 2. Contact details must never be readable outside the owner/staff paths.
REVOKE SELECT (email, phone, review_notes, reviewed_by, owner_user_id)
  ON public.vendors FROM anon, authenticated;

GRANT SELECT (
  id, name, slug, category, city, region, country, bio, website,
  hero_image, gallery, price_range, status, verified_at, created_at, updated_at
) ON public.vendors TO anon, authenticated;

GRANT SELECT ON public.vendors_public TO anon, authenticated;