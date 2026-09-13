
-- ─── Vendors ───────────────────────────────────────────────────────────────
CREATE TABLE public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  city TEXT,
  region TEXT,
  country TEXT,
  bio TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  hero_image TEXT,
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_range TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','paused')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vendors_owner ON public.vendors(owner_user_id);
CREATE INDEX idx_vendors_status_category ON public.vendors(status, category);
CREATE INDEX idx_vendors_region ON public.vendors(region);

GRANT SELECT ON public.vendors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view verified vendors"
  ON public.vendors FOR SELECT
  USING (status = 'verified' OR auth.uid() = owner_user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners can create their own vendor profile"
  ON public.vendors FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Owners can update their own vendor profile"
  ON public.vendors FOR UPDATE TO authenticated
  USING (auth.uid() = owner_user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (auth.uid() = owner_user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners and admins can delete vendor profile"
  ON public.vendors FOR DELETE TO authenticated
  USING (auth.uid() = owner_user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER trg_vendors_touch BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── RFQ requests ──────────────────────────────────────────────────────────
CREATE TABLE public.rfq_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  event_id TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  budget_min NUMERIC(10,2),
  budget_max NUMERIC(10,2),
  event_date DATE,
  guest_count INT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','quoted','accepted','declined','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rfq_requester ON public.rfq_requests(requester_user_id);
CREATE INDEX idx_rfq_vendor ON public.rfq_requests(vendor_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfq_requests TO authenticated;
GRANT ALL ON public.rfq_requests TO service_role;

ALTER TABLE public.rfq_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requester and vendor owner can view RFQ"
  ON public.rfq_requests FOR SELECT TO authenticated
  USING (
    auth.uid() = requester_user_id
    OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  );

CREATE POLICY "Authenticated users can create RFQ"
  ON public.rfq_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_user_id);

CREATE POLICY "Requester and vendor owner can update RFQ"
  ON public.rfq_requests FOR UPDATE TO authenticated
  USING (
    auth.uid() = requester_user_id
    OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = requester_user_id
    OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_user_id = auth.uid())
  );

CREATE TRIGGER trg_rfq_touch BEFORE UPDATE ON public.rfq_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── RFQ messages ──────────────────────────────────────────────────────────
CREATE TABLE public.rfq_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES public.rfq_requests(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rfq_messages_rfq ON public.rfq_messages(rfq_id);

GRANT SELECT, INSERT ON public.rfq_messages TO authenticated;
GRANT ALL ON public.rfq_messages TO service_role;

ALTER TABLE public.rfq_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view RFQ messages"
  ON public.rfq_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rfq_requests r
      LEFT JOIN public.vendors v ON v.id = r.vendor_id
      WHERE r.id = rfq_id
        AND (r.requester_user_id = auth.uid()
             OR v.owner_user_id = auth.uid()
             OR public.has_role(auth.uid(),'admin')
             OR public.has_role(auth.uid(),'owner'))
    )
  );

CREATE POLICY "Participants can post RFQ messages"
  ON public.rfq_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.rfq_requests r
      LEFT JOIN public.vendors v ON v.id = r.vendor_id
      WHERE r.id = rfq_id
        AND (r.requester_user_id = auth.uid() OR v.owner_user_id = auth.uid())
    )
  );

-- ─── Vendor reviews ────────────────────────────────────────────────────────
CREATE TABLE public.vendor_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, reviewer_user_id)
);
CREATE INDEX idx_vendor_reviews_vendor ON public.vendor_reviews(vendor_id);

GRANT SELECT ON public.vendor_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_reviews TO authenticated;
GRANT ALL ON public.vendor_reviews TO service_role;

ALTER TABLE public.vendor_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view vendor reviews"
  ON public.vendor_reviews FOR SELECT
  USING (true);

CREATE POLICY "Accepted requesters can create review"
  ON public.vendor_reviews FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.rfq_requests r
      WHERE r.vendor_id = vendor_id
        AND r.requester_user_id = auth.uid()
        AND r.status = 'accepted'
    )
  );

CREATE POLICY "Reviewer can update own review"
  ON public.vendor_reviews FOR UPDATE TO authenticated
  USING (reviewer_user_id = auth.uid())
  WITH CHECK (reviewer_user_id = auth.uid());

CREATE POLICY "Reviewer or admin can delete review"
  ON public.vendor_reviews FOR DELETE TO authenticated
  USING (reviewer_user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- ─── Ad placements ─────────────────────────────────────────────────────────
CREATE TABLE public.ad_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  headline TEXT NOT NULL,
  blurb TEXT,
  cta_url TEXT,
  hero_image TEXT,
  region TEXT,
  monthly_price_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','ended')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ad_placements_status ON public.ad_placements(status, region);
CREATE INDEX idx_ad_placements_vendor ON public.ad_placements(vendor_id);

GRANT SELECT ON public.ad_placements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_placements TO authenticated;
GRANT ALL ON public.ad_placements TO service_role;

ALTER TABLE public.ad_placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active placements"
  ON public.ad_placements FOR SELECT
  USING (
    status = 'active'
    OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'owner')
  );

CREATE POLICY "Vendor owner can create placement"
  ON public.ad_placements FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_user_id = auth.uid()));

CREATE POLICY "Vendor owner or admin can update placement"
  ON public.ad_placements FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
  );

CREATE POLICY "Vendor owner or admin can delete placement"
  ON public.ad_placements FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_user_id = auth.uid())
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
  );

CREATE TRIGGER trg_ad_placements_touch BEFORE UPDATE ON public.ad_placements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── Ad impressions ────────────────────────────────────────────────────────
CREATE TABLE public.ad_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id UUID NOT NULL REFERENCES public.ad_placements(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('impression','click')),
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID,
  referrer TEXT
);
CREATE INDEX idx_ad_impressions_placement ON public.ad_impressions(placement_id, kind, at);

GRANT INSERT ON public.ad_impressions TO anon, authenticated;
GRANT SELECT ON public.ad_impressions TO authenticated;
GRANT ALL ON public.ad_impressions TO service_role;

ALTER TABLE public.ad_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log impression"
  ON public.ad_impressions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Vendor owner or admin can read impressions"
  ON public.ad_impressions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ad_placements p
      JOIN public.vendors v ON v.id = p.vendor_id
      WHERE p.id = placement_id AND v.owner_user_id = auth.uid()
    )
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
  );
