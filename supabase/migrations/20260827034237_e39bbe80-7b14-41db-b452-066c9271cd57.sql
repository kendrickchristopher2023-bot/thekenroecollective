CREATE TABLE public.event_invite_opens (
  event_id text NOT NULL,
  guest_id text NOT NULL,
  first_opened_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  open_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, guest_id)
);

GRANT SELECT ON public.event_invite_opens TO authenticated;
GRANT ALL ON public.event_invite_opens TO service_role;

ALTER TABLE public.event_invite_opens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts and admins can view invite opens"
ON public.event_invite_opens
FOR SELECT
TO authenticated
USING (
  public.can_edit_event(event_id, auth.uid())
  OR public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE INDEX event_invite_opens_event_idx ON public.event_invite_opens (event_id);

CREATE TRIGGER update_event_invite_opens_updated_at
BEFORE UPDATE ON public.event_invite_opens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.record_invite_open(_event_id text, _guest_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _exists boolean;
BEGIN
  IF _event_id IS NULL OR _guest_id IS NULL OR length(_guest_id) = 0 THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.events e,
         jsonb_array_elements(COALESCE(e.data->'guests', '[]'::jsonb)) g
    WHERE e.id = _event_id
      AND g->>'id' = _guest_id
  ) INTO _exists;

  IF NOT _exists THEN
    RETURN;
  END IF;

  INSERT INTO public.event_invite_opens (event_id, guest_id)
  VALUES (_event_id, _guest_id)
  ON CONFLICT (event_id, guest_id) DO UPDATE
    SET last_opened_at = now(),
        open_count = public.event_invite_opens.open_count + 1,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_invite_open(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_invite_open(text, text) TO anon, authenticated, service_role;