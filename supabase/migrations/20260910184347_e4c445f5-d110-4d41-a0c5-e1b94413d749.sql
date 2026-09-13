CREATE OR REPLACE FUNCTION public.restore_showcase_samples(
  _wishes jsonb,
  _comments jsonb,
  _photos jsonb,
  _bring_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _event_id text := 'showcase-wedding';
  _item jsonb;
  _item_id uuid;
  _claim text;
  _pos int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = _event_id) THEN
    RAISE EXCEPTION 'showcase event row is missing';
  END IF;
  PERFORM set_config('app.showcase_seed', 'on', true);

  DELETE FROM public.event_well_wishes WHERE event_id = _event_id;
  INSERT INTO public.event_well_wishes (event_id, name, message, hidden)
  SELECT _event_id, w->>'name', w->>'message', false
  FROM jsonb_array_elements(coalesce(_wishes, '[]'::jsonb)) AS w;

  DELETE FROM public.event_comments WHERE event_id = _event_id;
  INSERT INTO public.event_comments (event_id, guest_id, guest_name, author_role, body, visibility, hidden)
  SELECT _event_id, c->>'guestId', c->>'guestName', 'guest', c->>'body', 'public', false
  FROM jsonb_array_elements(coalesce(_comments, '[]'::jsonb)) AS c;

  IF NOT EXISTS (SELECT 1 FROM public.event_photos WHERE event_id = _event_id) THEN
    INSERT INTO public.event_photos (event_id, storage_path, uploader_label, status, content_type)
    SELECT _event_id, p->>'storagePath', p->>'uploaderLabel', 'visible', 'image/jpeg'
    FROM jsonb_array_elements(coalesce(_photos, '[]'::jsonb)) AS p;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.event_bring_items WHERE event_id = _event_id) THEN
    FOR _item IN SELECT * FROM jsonb_array_elements(coalesce(_bring_items, '[]'::jsonb)) LOOP
      _pos := _pos + 1;
      INSERT INTO public.event_bring_items (event_id, name, note, category, slots_needed, suggested_by_guest, position)
      VALUES (_event_id, _item->>'title', _item->>'note', coalesce(_item->>'category', 'other'),
              coalesce((_item->>'slots')::int, 1), false, _pos)
      RETURNING id INTO _item_id;
      FOR _claim IN SELECT jsonb_array_elements_text(coalesce(_item->'claimedBy', '[]'::jsonb)) LOOP
        INSERT INTO public.event_bring_claims (item_id, event_id, name, edit_token)
        VALUES (_item_id, _event_id, _claim, encode(gen_random_bytes(16), 'hex'));
      END LOOP;
    END LOOP;
  END IF;
END;
$$;