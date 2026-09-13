-- Account deletion request (30-day soft-delete window)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

-- Optional: guest-side email frequency preference paired with existing
-- suppressed_emails.  Values: 'all' (default), 'digest' (fewer emails,
-- weekly summary only), 'none' (equivalent to full unsubscribe).
ALTER TABLE public.suppressed_emails
  ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'none'
    CHECK (frequency IN ('all','digest','none'));

-- Request account deletion (marks profile; hard-delete happens after 30 days
-- via admin job).  Idempotent.
CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ts  timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT deletion_requested_at INTO _ts FROM public.profiles WHERE id = _uid;
  IF _ts IS NOT NULL THEN RETURN _ts; END IF;
  UPDATE public.profiles SET deletion_requested_at = now() WHERE id = _uid
    RETURNING deletion_requested_at INTO _ts;
  RETURN _ts;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.profiles SET deletion_requested_at = NULL WHERE id = _uid;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion() TO authenticated;