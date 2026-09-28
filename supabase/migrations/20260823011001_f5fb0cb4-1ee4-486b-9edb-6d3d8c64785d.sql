-- Vendor profile additions: separate logo, optional address, and explicit
-- opt-in flags for showing phone / address publicly (default OFF).
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS show_phone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_address boolean NOT NULL DEFAULT false;

-- vendors_public stays the ONLY public read path. anon/authenticated keep zero
-- privileges on public.vendors. Raw phone / address / email are never projected;
-- the masked columns return NULL unless the vendor opted in.
CREATE OR REPLACE VIEW public.vendors_public AS
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
    created_at,
    logo_url,
    CASE WHEN show_phone THEN phone END AS public_phone,
    CASE WHEN show_address THEN address END AS public_address
  FROM public.vendors
  WHERE status = 'verified'::text;

COMMENT ON VIEW public.vendors_public IS
  'Public vendor data boundary. Never project email, owner_user_id, review notes, stripe ids, or raw phone/address. Phone and address are exposed only through public_phone / public_address, which respect the vendor''s show_phone / show_address opt-in. Do NOT grant privileges on public.vendors to anon or authenticated.';

GRANT SELECT ON public.vendors_public TO anon, authenticated;
GRANT ALL ON public.vendors_public TO service_role;