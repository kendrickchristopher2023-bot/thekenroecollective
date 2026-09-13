ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS honoree_email text,
  ADD COLUMN IF NOT EXISTS wishes_sent_at timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.event_well_wishes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text,
  message text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_well_wishes_event_id_idx ON public.event_well_wishes (event_id, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.event_well_wishes TO authenticated;
GRANT ALL ON public.event_well_wishes TO service_role;

ALTER TABLE public.event_well_wishes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers read their event well wishes"
  ON public.event_well_wishes FOR SELECT TO authenticated
  USING (public.get_event_owner_id(event_id) = auth.uid()
         OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers update their event well wishes"
  ON public.event_well_wishes FOR UPDATE TO authenticated
  USING (public.get_event_owner_id(event_id) = auth.uid()
         OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.get_event_owner_id(event_id) = auth.uid()
         OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers delete their event well wishes"
  ON public.event_well_wishes FOR DELETE TO authenticated
  USING (public.get_event_owner_id(event_id) = auth.uid()
         OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER event_well_wishes_touch_updated_at
  BEFORE UPDATE ON public.event_well_wishes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Guests have no session, so posting goes through this definer function.
CREATE OR REPLACE FUNCTION public.add_well_wish(_event_id text, _name text, _message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.event_well_wishes;
BEGIN
  IF _message IS NULL OR length(btrim(_message)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Message is required.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id AND e.archived_at IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Event not found.');
  END IF;
  INSERT INTO public.event_well_wishes (event_id, name, message)
  VALUES (_event_id, NULLIF(btrim(coalesce(_name, '')), ''), left(btrim(_message), 2000))
  RETURNING * INTO _row;
  RETURN jsonb_build_object('ok', true, 'id', _row.id, 'createdAt', _row.created_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_well_wishes(_event_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id, 'name', w.name, 'message', w.message, 'createdAt', w.created_at
  ) ORDER BY w.created_at DESC), '[]'::jsonb)
  FROM public.event_well_wishes w
  JOIN public.events e ON e.id = w.event_id AND e.archived_at IS NULL
  WHERE w.event_id = _event_id AND w.hidden = false;
$$;

GRANT EXECUTE ON FUNCTION public.add_well_wish(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_well_wishes(text) TO anon, authenticated;