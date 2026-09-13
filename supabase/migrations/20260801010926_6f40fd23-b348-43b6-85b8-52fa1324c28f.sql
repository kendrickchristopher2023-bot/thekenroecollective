-- vendors: split anon (verified only, no role lookup) from authenticated.
DROP POLICY IF EXISTS "Public can view verified vendors" ON public.vendors;

CREATE POLICY "Anon can view verified vendors"
  ON public.vendors FOR SELECT TO anon
  USING (status = 'verified');

CREATE POLICY "Signed-in can view verified or own vendors"
  ON public.vendors FOR SELECT TO authenticated
  USING (
    status = 'verified'
    OR auth.uid() = owner_user_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- pricing_tiers: anon sees active tiers only, no role lookup.
DROP POLICY IF EXISTS "public read active tiers" ON public.pricing_tiers;

CREATE POLICY "Anon can read active tiers"
  ON public.pricing_tiers FOR SELECT TO anon
  USING (active = true);

CREATE POLICY "Signed-in can read tiers"
  ON public.pricing_tiers FOR SELECT TO authenticated
  USING (active = true OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- RFQ requests/messages: participants only, and only when signed in.
DROP POLICY IF EXISTS "Requester and vendor owner can view RFQ" ON public.rfq_requests;
CREATE POLICY "Requester and vendor owner can view RFQ"
  ON public.rfq_requests FOR SELECT TO authenticated
  USING (
    auth.uid() = requester_user_id
    OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = rfq_requests.vendor_id AND v.owner_user_id = auth.uid())
    OR public.rfq_invited_vendor_owner(id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

DROP POLICY IF EXISTS "Participants can view RFQ messages" ON public.rfq_messages;
CREATE POLICY "Participants can view RFQ messages"
  ON public.rfq_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rfq_requests r
      LEFT JOIN public.vendors v ON v.id = r.vendor_id
      WHERE r.id = rfq_messages.rfq_id
        AND (
          r.requester_user_id = auth.uid()
          OR v.owner_user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'owner'::public.app_role)
          OR EXISTS (
            SELECT 1 FROM public.rfq_invitations i
            JOIN public.vendors v2 ON v2.id = i.vendor_id
            WHERE i.rfq_id = r.id AND v2.owner_user_id = auth.uid()
          )
        )
    )
  );