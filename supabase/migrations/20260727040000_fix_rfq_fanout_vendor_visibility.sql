-- Fan-out-invited vendors (rfq_requests.vendor_id IS NULL, invitation lives in
-- rfq_invitations) could never SELECT the RFQ or its message thread — the
-- existing policies only checked the pinned rfq_requests.vendor_id match.
-- Purely additive (OR clauses) so no one's existing access changes.

DROP POLICY IF EXISTS "Requester and vendor owner can view RFQ" ON public.rfq_requests;
CREATE POLICY "Requester and vendor owner can view RFQ" ON public.rfq_requests
FOR SELECT
USING (
  (auth.uid() = requester_user_id)
  OR (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = rfq_requests.vendor_id AND v.owner_user_id = auth.uid()))
  OR (EXISTS (
    SELECT 1 FROM public.rfq_invitations i
    JOIN public.vendors v2 ON v2.id = i.vendor_id
    WHERE i.rfq_id = rfq_requests.id AND v2.owner_user_id = auth.uid()
  ))
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'owner'::app_role)
);

DROP POLICY IF EXISTS "Participants can view RFQ messages" ON public.rfq_messages;
CREATE POLICY "Participants can view RFQ messages" ON public.rfq_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.rfq_requests r
    LEFT JOIN public.vendors v ON v.id = r.vendor_id
    WHERE r.id = rfq_messages.rfq_id
      AND (
        r.requester_user_id = auth.uid()
        OR v.owner_user_id = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'owner'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.rfq_invitations i
          JOIN public.vendors v2 ON v2.id = i.vendor_id
          WHERE i.rfq_id = r.id AND v2.owner_user_id = auth.uid()
        )
      )
  )
);
