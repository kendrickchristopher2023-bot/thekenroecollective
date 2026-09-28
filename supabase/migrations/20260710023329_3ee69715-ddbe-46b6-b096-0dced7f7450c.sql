-- Replace the overly broad "verified vendors bid on open rfqs" INSERT policy on
-- rfq_messages with one that requires the vendor to have an invitation for the
-- RFQ. This prevents any verified vendor from bidding on RFQs they weren't
-- invited to.

DROP POLICY IF EXISTS "verified vendors bid on open rfqs" ON public.rfq_messages;

CREATE POLICY "invited vendors bid on rfqs"
ON public.rfq_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_user_id = auth.uid()
  AND vendor_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = rfq_messages.vendor_id
      AND v.owner_user_id = auth.uid()
      AND v.status = 'verified'
  )
  AND EXISTS (
    SELECT 1 FROM public.rfq_requests r
    WHERE r.id = rfq_messages.rfq_id
      AND r.status IN ('open','quoted')
  )
  AND EXISTS (
    SELECT 1 FROM public.rfq_invitations i
    WHERE i.rfq_id = rfq_messages.rfq_id
      AND i.vendor_id = rfq_messages.vendor_id
  )
);
