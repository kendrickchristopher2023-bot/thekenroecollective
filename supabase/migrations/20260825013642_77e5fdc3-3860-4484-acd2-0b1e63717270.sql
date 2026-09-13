-- Vendor-owner check that does NOT require the caller to hold privileges on the
-- privacy-locked public.vendors table. RLS policy bodies execute as the calling
-- role, so any policy with a subquery on public.vendors raised
-- "permission denied for table vendors" once anon/authenticated grants were
-- revoked from that table by the vendor privacy lockdown.
CREATE OR REPLACE FUNCTION public.is_vendor_owner(_vendor_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = _vendor_id AND v.owner_user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_verified_vendor_owner(_vendor_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = _vendor_id AND v.owner_user_id = _user_id AND v.status = 'verified'
  )
$$;

CREATE OR REPLACE FUNCTION public.owns_rfq_target_vendor(_rfq_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rfq_requests r
    JOIN public.vendors v ON v.id = r.vendor_id
    WHERE r.id = _rfq_id AND v.owner_user_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION public.is_vendor_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_verified_vendor_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_rfq_target_vendor(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_vendor_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_verified_vendor_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_rfq_target_vendor(uuid, uuid) TO authenticated, service_role;

-- ---------- rfq_requests ----------
DROP POLICY IF EXISTS "Requester and vendor owner can view RFQ" ON public.rfq_requests;
CREATE POLICY "Requester and vendor owner can view RFQ"
ON public.rfq_requests FOR SELECT TO authenticated
USING (
  auth.uid() = requester_user_id
  OR public.is_vendor_owner(vendor_id, auth.uid())
  OR public.rfq_invited_vendor_owner(id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
);

DROP POLICY IF EXISTS "Requester and vendor owner can update RFQ" ON public.rfq_requests;
CREATE POLICY "Requester and vendor owner can update RFQ"
ON public.rfq_requests FOR UPDATE TO authenticated
USING (auth.uid() = requester_user_id OR public.is_vendor_owner(vendor_id, auth.uid()))
WITH CHECK (auth.uid() = requester_user_id OR public.is_vendor_owner(vendor_id, auth.uid()));

-- ---------- rfq_invitations ----------
DROP POLICY IF EXISTS "vendor owner reads own invitations" ON public.rfq_invitations;
CREATE POLICY "vendor owner reads own invitations"
ON public.rfq_invitations FOR SELECT TO authenticated
USING (public.is_vendor_owner(vendor_id, auth.uid()));

-- ---------- rfq_messages ----------
DROP POLICY IF EXISTS "Participants can view RFQ messages" ON public.rfq_messages;
CREATE POLICY "Participants can view RFQ messages"
ON public.rfq_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rfq_requests r
    WHERE r.id = rfq_messages.rfq_id
      AND (
        r.requester_user_id = auth.uid()
        OR public.is_vendor_owner(r.vendor_id, auth.uid())
        OR public.rfq_invited_vendor_owner(r.id, auth.uid())
      )
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
);

DROP POLICY IF EXISTS "Participants can post RFQ messages" ON public.rfq_messages;
CREATE POLICY "Participants can post RFQ messages"
ON public.rfq_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.rfq_requests r
    WHERE r.id = rfq_messages.rfq_id
      AND (r.requester_user_id = auth.uid() OR public.is_vendor_owner(r.vendor_id, auth.uid()))
  )
  AND (vendor_id IS NULL OR public.is_vendor_owner(vendor_id, auth.uid()))
);

DROP POLICY IF EXISTS "invited vendors bid on rfqs" ON public.rfq_messages;
CREATE POLICY "invited vendors bid on rfqs"
ON public.rfq_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_user_id = auth.uid()
  AND vendor_id IS NOT NULL
  AND public.is_verified_vendor_owner(vendor_id, auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.rfq_requests r
    WHERE r.id = rfq_messages.rfq_id AND r.status IN ('open', 'quoted')
  )
  AND EXISTS (
    SELECT 1 FROM public.rfq_invitations i
    WHERE i.rfq_id = rfq_messages.rfq_id AND i.vendor_id = rfq_messages.vendor_id
  )
);

-- ---------- vendor_reviews ----------
DROP POLICY IF EXISTS "Authors, vendor owners and admins can view reviews" ON public.vendor_reviews;
CREATE POLICY "Authors, vendor owners and admins can view reviews"
ON public.vendor_reviews FOR SELECT TO authenticated
USING (
  reviewer_user_id = auth.uid()
  OR public.is_vendor_owner(vendor_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
);

-- ---------- ad_placements / ad_impressions ----------
DROP POLICY IF EXISTS "Vendor owner can create placement" ON public.ad_placements;
CREATE POLICY "Vendor owner can create placement"
ON public.ad_placements FOR INSERT TO authenticated
WITH CHECK (public.is_vendor_owner(vendor_id, auth.uid()));

DROP POLICY IF EXISTS "Vendor owner or admin can update placement" ON public.ad_placements;
CREATE POLICY "Vendor owner or admin can update placement"
ON public.ad_placements FOR UPDATE TO authenticated
USING (
  public.is_vendor_owner(vendor_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
)
WITH CHECK (
  public.is_vendor_owner(vendor_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
);

DROP POLICY IF EXISTS "Vendor owner or admin can delete placement" ON public.ad_placements;
CREATE POLICY "Vendor owner or admin can delete placement"
ON public.ad_placements FOR DELETE TO authenticated
USING (
  public.is_vendor_owner(vendor_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
);

DROP POLICY IF EXISTS "Vendors manage own ads" ON public.ad_placements;
CREATE POLICY "Vendors manage own ads"
ON public.ad_placements FOR ALL TO authenticated
USING (owner_user_id = auth.uid() AND public.is_vendor_owner(vendor_id, auth.uid()))
WITH CHECK (owner_user_id = auth.uid() AND public.is_vendor_owner(vendor_id, auth.uid()));

DROP POLICY IF EXISTS "Vendor owner or admin can read impressions" ON public.ad_impressions;
CREATE POLICY "Vendor owner or admin can read impressions"
ON public.ad_impressions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ad_placements p
    WHERE p.id = ad_impressions.placement_id
      AND public.is_vendor_owner(p.vendor_id, auth.uid())
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
);
