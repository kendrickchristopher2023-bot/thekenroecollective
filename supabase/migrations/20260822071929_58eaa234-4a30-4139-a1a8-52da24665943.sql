CREATE OR REPLACE FUNCTION public.public_self_add_guest(
  _event_id text,
  _name text,
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _data jsonb;
  _cap integer;
  _count integer;
  _gid text;
  _nm text := left(btrim(coalesce(_name, '')), 80);
  _em text := lower(btrim(coalesce(_email, '')));
  _ph text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
  _guest jsonb;
BEGIN
  IF length(_nm) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_name');
  END IF;
  IF _em = '' AND _ph = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_contact');
  END IF;

  SELECT data INTO _data FROM public.events
  WHERE id = _event_id AND archived_at IS NULL FOR UPDATE;

  IF _data IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'event_not_found');
  END IF;

  IF coalesce(_data->>'openGuestList', 'false') <> 'true' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_open');
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(_data->'guests', '[]'::jsonb)) g
    WHERE (_em <> '' AND lower(coalesce(g->>'email', '')) = _em)
       OR (_ph <> '' AND regexp_replace(coalesce(g->>'phone', ''), '\D', '', 'g') = _ph)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_listed');
  END IF;

  _cap := nullif(_data->>'capacity', '')::integer;
  SELECT jsonb_array_length(coalesce(_data->'guests', '[]'::jsonb)) INTO _count;
  IF _cap IS NOT NULL AND _count >= _cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'at_capacity');
  END IF;

  _gid := 'self-' || replace(gen_random_uuid()::text, '-', '');
  _guest := jsonb_build_object(
    'id', _gid,
    'name', _nm,
    'email', coalesce(nullif(_em, ''), ''),
    'phone', coalesce(nullif(btrim(coalesce(_phone, '')), ''), ''),
    'status', 'pending',
    'source', 'self_added'
  );

  UPDATE public.events
  SET data = jsonb_set(data, '{guests}', coalesce(data->'guests', '[]'::jsonb) || jsonb_build_array(_guest)),
      updated_at = now()
  WHERE id = _event_id;

  RETURN jsonb_build_object('ok', true, 'guestId', _gid);
END;
$$;

REVOKE ALL ON FUNCTION public.public_self_add_guest(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_self_add_guest(text, text, text, text) TO anon, authenticated, service_role;