
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;

DROP POLICY IF EXISTS "public read usable discount codes" ON public.discount_codes;
CREATE POLICY "authenticated read usable discount codes"
  ON public.discount_codes FOR SELECT
  TO authenticated
  USING (active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR used_count < max_uses));
REVOKE SELECT ON public.discount_codes FROM anon;

REVOKE SELECT ON public.rfq_invitations FROM authenticated, anon;
GRANT SELECT (id, rfq_id, yelp_business_id, business_name, claim_token, claimed_at, claimed_vendor_id, created_at)
  ON public.rfq_invitations TO authenticated;

DROP POLICY IF EXISTS "vendors bid on open rfqs" ON public.rfq_messages;
CREATE POLICY "verified vendors bid on open rfqs"
  ON public.rfq_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.rfq_requests r
      WHERE r.id = rfq_messages.rfq_id
        AND r.vendor_id IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.owner_user_id = auth.uid()
        AND v.status = 'verified'
    )
  );

DROP POLICY IF EXISTS "Anyone can log impression" ON public.ad_impressions;
CREATE POLICY "Anyone can log valid impression"
  ON public.ad_impressions FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    kind IN ('impression','click')
    AND EXISTS (SELECT 1 FROM public.ad_placements p WHERE p.id = placement_id AND p.status = 'active')
  );

DROP POLICY IF EXISTS "Public read product-updates" ON storage.objects;
DROP POLICY IF EXISTS "atelier_media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "event_photos_public_read" ON storage.objects;
