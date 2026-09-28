CREATE TABLE public.event_guest_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact text NOT NULL,
  note text,
  party_size integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_guest_requests_status_check CHECK (status IN ('pending','approved','dismissed')),
  CONSTRAINT event_guest_requests_party_size_check CHECK (party_size BETWEEN 1 AND 20)
);

CREATE INDEX event_guest_requests_event_idx ON public.event_guest_requests (event_id, status, created_at DESC);
CREATE UNIQUE INDEX event_guest_requests_event_contact_key ON public.event_guest_requests (event_id, lower(contact));

GRANT SELECT, UPDATE, DELETE ON public.event_guest_requests TO authenticated;
GRANT ALL ON public.event_guest_requests TO service_role;

ALTER TABLE public.event_guest_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts and co-hosts can view join requests"
ON public.event_guest_requests FOR SELECT TO authenticated
USING (public.owns_event(event_id, auth.uid()) OR public.is_event_collaborator(event_id, auth.uid()));

CREATE POLICY "Hosts and co-hosts can update join requests"
ON public.event_guest_requests FOR UPDATE TO authenticated
USING (public.owns_event(event_id, auth.uid()) OR public.is_event_collaborator(event_id, auth.uid()))
WITH CHECK (public.owns_event(event_id, auth.uid()) OR public.is_event_collaborator(event_id, auth.uid()));

CREATE POLICY "Hosts can delete join requests"
ON public.event_guest_requests FOR DELETE TO authenticated
USING (public.owns_event(event_id, auth.uid()));

CREATE TRIGGER event_guest_requests_touch
BEFORE UPDATE ON public.event_guest_requests
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Controlled public write path: guests never insert directly.
CREATE OR REPLACE FUNCTION public.request_guest_addition(
  _event_id text,
  _name text,
  _contact text,
  _note text DEFAULT NULL,
  _party_size integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _recent integer;
  _clean_name text := btrim(coalesce(_name, ''));
  _clean_contact text := btrim(coalesce(_contact, ''));
  _size integer := greatest(1, least(20, coalesce(_party_size, 1)));
BEGIN
  IF length(_clean_name) < 2 OR length(_clean_name) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_name');
  END IF;
  IF length(_clean_contact) < 5 OR length(_clean_contact) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_contact');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = _event_id AND e.archived_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'event_not_found');
  END IF;

  SELECT count(*) INTO _recent
  FROM public.event_guest_requests r
  WHERE r.event_id = _event_id AND r.created_at > now() - interval '1 hour';

  IF _recent >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;

  INSERT INTO public.event_guest_requests (event_id, name, contact, note, party_size)
  VALUES (_event_id, _clean_name, _clean_contact, nullif(btrim(coalesce(_note, '')), ''), _size)
  ON CONFLICT (event_id, lower(contact)) DO UPDATE
    SET name = excluded.name,
        note = excluded.note,
        party_size = excluded.party_size,
        status = CASE WHEN public.event_guest_requests.status = 'approved' THEN 'approved' ELSE 'pending' END,
        updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.request_guest_addition(text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_guest_addition(text, text, text, text, integer) TO anon, authenticated, service_role;