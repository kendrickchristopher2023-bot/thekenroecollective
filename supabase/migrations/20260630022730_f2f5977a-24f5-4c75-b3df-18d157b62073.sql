
-- 1) Expand rfq_invitations
ALTER TABLE public.rfq_invitations
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'invited',
  ADD COLUMN IF NOT EXISTS sent_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_rfq_invitations_vendor ON public.rfq_invitations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_rfq_invitations_rfq ON public.rfq_invitations(rfq_id);

-- Allow a signed-in vendor to read invitations addressed to their vendor profile
DROP POLICY IF EXISTS "vendor owner reads own invitations" ON public.rfq_invitations;
CREATE POLICY "vendor owner reads own invitations"
ON public.rfq_invitations FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = rfq_invitations.vendor_id
      AND v.owner_user_id = auth.uid()
  )
);

-- 2) Allow tokenized bids in rfq_messages (sender_user_id may be null when vendor_id set)
ALTER TABLE public.rfq_messages
  ALTER COLUMN sender_user_id DROP NOT NULL;

ALTER TABLE public.rfq_messages
  DROP CONSTRAINT IF EXISTS rfq_messages_sender_or_vendor_chk;
ALTER TABLE public.rfq_messages
  ADD CONSTRAINT rfq_messages_sender_or_vendor_chk
  CHECK (sender_user_id IS NOT NULL OR vendor_id IS NOT NULL);

-- 3) Fix awarded status on rfq_requests
ALTER TABLE public.rfq_requests
  DROP CONSTRAINT IF EXISTS rfq_requests_status_check;
ALTER TABLE public.rfq_requests
  ADD CONSTRAINT rfq_requests_status_check
  CHECK (status = ANY (ARRAY['open','quoted','accepted','awarded','declined','closed']));

-- 4) RPC: get_rfq_by_token — public; returns JSON with rfq brief + invitation status
CREATE OR REPLACE FUNCTION public.get_rfq_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _inv public.rfq_invitations%ROWTYPE;
  _rfq public.rfq_requests%ROWTYPE;
  _vendor_name text;
BEGIN
  IF _token IS NULL OR length(_token) < 8 THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;
  SELECT * INTO _inv FROM public.rfq_invitations WHERE claim_token = _token;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  SELECT * INTO _rfq FROM public.rfq_requests WHERE id = _inv.rfq_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'rfq_missing'); END IF;

  IF _inv.vendor_id IS NOT NULL THEN
    SELECT name INTO _vendor_name FROM public.vendors WHERE id = _inv.vendor_id;
  END IF;

  RETURN jsonb_build_object(
    'invitation', jsonb_build_object(
      'id', _inv.id,
      'status', _inv.status,
      'vendor_id', _inv.vendor_id,
      'vendor_name', _vendor_name,
      'business_name', _inv.business_name,
      'responded_at', _inv.responded_at
    ),
    'rfq', jsonb_build_object(
      'id', _rfq.id,
      'subject', _rfq.subject,
      'category', _rfq.category,
      'message', _rfq.message,
      'location', _rfq.location,
      'event_date', _rfq.event_date,
      'guest_count', _rfq.guest_count,
      'budget_min', _rfq.budget_min,
      'budget_max', _rfq.budget_max,
      'status', _rfq.status,
      'created_at', _rfq.created_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_rfq_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rfq_by_token(text) TO anon, authenticated, service_role;

-- 5) RPC: post_rfq_bid_by_token — public; inserts a single bid and marks invitation responded
CREATE OR REPLACE FUNCTION public.post_rfq_bid_by_token(
  _token text,
  _bid_amount numeric,
  _availability_note text,
  _body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _inv public.rfq_invitations%ROWTYPE;
  _rfq public.rfq_requests%ROWTYPE;
  _msg_id uuid;
BEGIN
  IF _token IS NULL OR length(_token) < 8 THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;
  IF _body IS NULL OR length(trim(_body)) < 1 THEN
    RETURN jsonb_build_object('error', 'empty_body');
  END IF;

  SELECT * INTO _inv FROM public.rfq_invitations WHERE claim_token = _token;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF _inv.vendor_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_vendor_on_invitation');
  END IF;

  SELECT * INTO _rfq FROM public.rfq_requests WHERE id = _inv.rfq_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'rfq_missing'); END IF;
  IF _rfq.status NOT IN ('open','quoted') THEN
    RETURN jsonb_build_object('error', 'rfq_closed');
  END IF;

  INSERT INTO public.rfq_messages (
    rfq_id, sender_user_id, vendor_id, body, is_bid,
    bid_amount, availability_note, bid_status
  ) VALUES (
    _inv.rfq_id, NULL, _inv.vendor_id,
    left(_body, 4000), true,
    nullif(_bid_amount, 0),
    nullif(left(coalesce(_availability_note, ''), 500), ''),
    'pending'
  )
  RETURNING id INTO _msg_id;

  UPDATE public.rfq_invitations
  SET status = 'responded', responded_at = now()
  WHERE id = _inv.id;

  UPDATE public.rfq_requests
  SET status = 'quoted', updated_at = now()
  WHERE id = _rfq.id AND status = 'open';

  RETURN jsonb_build_object(
    'ok', true,
    'message_id', _msg_id,
    'rfq_id', _rfq.id,
    'requester_user_id', _rfq.requester_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_rfq_bid_by_token(text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_rfq_bid_by_token(text, numeric, text, text) TO anon, authenticated, service_role;
