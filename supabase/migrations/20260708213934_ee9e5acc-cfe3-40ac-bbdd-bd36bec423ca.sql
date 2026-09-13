
DROP POLICY IF EXISTS "Participants can post RFQ messages" ON public.rfq_messages;
DROP POLICY IF EXISTS "verified vendors bid on open rfqs" ON public.rfq_messages;

CREATE POLICY "Participants can post RFQ messages"
ON public.rfq_messages
FOR INSERT
WITH CHECK (
  sender_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.rfq_requests r
    LEFT JOIN public.vendors v ON v.id = r.vendor_id
    WHERE r.id = rfq_messages.rfq_id
      AND (r.requester_user_id = auth.uid() OR v.owner_user_id = auth.uid())
  )
  AND (
    rfq_messages.vendor_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.vendors v2
      WHERE v2.id = rfq_messages.vendor_id
        AND v2.owner_user_id = auth.uid()
    )
  )
);

CREATE POLICY "verified vendors bid on open rfqs"
ON public.rfq_messages
FOR INSERT
WITH CHECK (
  sender_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.rfq_requests r
    WHERE r.id = rfq_messages.rfq_id AND r.vendor_id IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.owner_user_id = auth.uid() AND v.status = 'verified'
  )
  AND rfq_messages.vendor_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.vendors v3
    WHERE v3.id = rfq_messages.vendor_id
      AND v3.owner_user_id = auth.uid()
  )
);
