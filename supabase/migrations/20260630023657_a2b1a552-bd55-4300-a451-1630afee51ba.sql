
CREATE OR REPLACE FUNCTION public.decline_rfq_invitation_by_token(_token text, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv public.rfq_invitations%ROWTYPE;
BEGIN
  IF _token IS NULL OR length(_token) < 8 THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  SELECT * INTO _inv FROM public.rfq_invitations WHERE claim_token = _token;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF _inv.status = 'responded' THEN
    RETURN jsonb_build_object('error', 'already_responded');
  END IF;

  UPDATE public.rfq_invitations
  SET status = 'declined',
      responded_at = COALESCE(responded_at, now()),
      decline_reason = NULLIF(left(COALESCE(_reason, ''), 200), '')
  WHERE id = _inv.id;

  RETURN jsonb_build_object('ok', true, 'rfq_id', _inv.rfq_id);
END;
$$;

-- Add column for decline reason if missing (idempotent)
ALTER TABLE public.rfq_invitations
  ADD COLUMN IF NOT EXISTS decline_reason text;

REVOKE ALL ON FUNCTION public.decline_rfq_invitation_by_token(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.decline_rfq_invitation_by_token(text, text) TO anon, authenticated;
