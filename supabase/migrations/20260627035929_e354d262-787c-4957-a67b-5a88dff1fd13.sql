
-- Fix vendor_reviews INSERT self-comparison bug
DROP POLICY IF EXISTS "Accepted requesters can create review" ON public.vendor_reviews;
CREATE POLICY "Accepted requesters can create review"
  ON public.vendor_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reviewer_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.rfq_requests r
      WHERE r.vendor_id = vendor_reviews.vendor_id
        AND r.requester_user_id = auth.uid()
        AND r.status = 'accepted'
    )
  );

-- Restrict verified vendor browsing to authenticated users (vendors page is already auth-gated)
DROP POLICY IF EXISTS "Anyone can view verified vendors" ON public.vendors;
CREATE POLICY "Authenticated users can view verified vendors"
  ON public.vendors
  FOR SELECT
  TO authenticated
  USING (
    status = 'verified'
    OR auth.uid() = owner_user_id
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
  );
