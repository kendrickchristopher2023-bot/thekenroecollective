-- Potluck / "what to bring" sign-up sheet -------------------------------------

CREATE TABLE public.event_bring_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  name text NOT NULL,
  note text,
  category text NOT NULL DEFAULT 'other',
  slots_needed integer NOT NULL DEFAULT 1,
  serves integer,
  suggested_by_guest boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_bring_items_event_idx ON public.event_bring_items (event_id, position, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_bring_items TO authenticated;
GRANT ALL ON public.event_bring_items TO service_role;
ALTER TABLE public.event_bring_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers read bring items" ON public.event_bring_items
  FOR SELECT TO authenticated
  USING (public.get_event_owner_id(event_id) = auth.uid()
      OR public.can_edit_event(event_id, auth.uid())
      OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Organizers insert bring items" ON public.event_bring_items
  FOR INSERT TO authenticated
  WITH CHECK (public.get_event_owner_id(event_id) = auth.uid()
      OR public.can_edit_event(event_id, auth.uid())
      OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Organizers update bring items" ON public.event_bring_items
  FOR UPDATE TO authenticated
  USING (public.get_event_owner_id(event_id) = auth.uid()
      OR public.can_edit_event(event_id, auth.uid())
      OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.get_event_owner_id(event_id) = auth.uid()
      OR public.can_edit_event(event_id, auth.uid())
      OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Organizers delete bring items" ON public.event_bring_items
  FOR DELETE TO authenticated
  USING (public.get_event_owner_id(event_id) = auth.uid()
      OR public.can_edit_event(event_id, auth.uid())
      OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.event_bring_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.event_bring_items(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  name text,
  dish text,
  note text,
  edit_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_bring_claims_item_idx ON public.event_bring_claims (item_id);
CREATE INDEX event_bring_claims_event_idx ON public.event_bring_claims (event_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_bring_claims TO authenticated;
GRANT ALL ON public.event_bring_claims TO service_role;
ALTER TABLE public.event_bring_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers read bring claims" ON public.event_bring_claims
  FOR SELECT TO authenticated
  USING (public.get_event_owner_id(event_id) = auth.uid()
      OR public.can_edit_event(event_id, auth.uid())
      OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Organizers update bring claims" ON public.event_bring_claims
  FOR UPDATE TO authenticated
  USING (public.get_event_owner_id(event_id) = auth.uid()
      OR public.can_edit_event(event_id, auth.uid())
      OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.get_event_owner_id(event_id) = auth.uid()
      OR public.can_edit_event(event_id, auth.uid())
      OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Organizers delete bring claims" ON public.event_bring_claims
  FOR DELETE TO authenticated
  USING (public.get_event_owner_id(event_id) = auth.uid()
      OR public.can_edit_event(event_id, auth.uid())
      OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER event_bring_items_touch BEFORE UPDATE ON public.event_bring_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER event_bring_claims_touch BEFORE UPDATE ON public.event_bring_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public (guest) surface --------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_bring_sheet(_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ev jsonb;
  show_names boolean;
  items jsonb;
BEGIN
  SELECT data INTO ev FROM public.events WHERE id = _event_id AND archived_at IS NULL;
  IF ev IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  show_names := coalesce((ev->>'bringSheetShowNames')::boolean, true);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'name', i.name,
    'note', i.note,
    'category', i.category,
    'slotsNeeded', i.slots_needed,
    'serves', i.serves,
    'suggested', i.suggested_by_guest,
    'claims', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', CASE WHEN show_names THEN c.name ELSE NULL END,
        'dish', c.dish,
        'note', c.note,
        'createdAt', c.created_at
      ) ORDER BY c.created_at), '[]'::jsonb)
      FROM public.event_bring_claims c WHERE c.item_id = i.id
    )
  ) ORDER BY i.position, i.created_at), '[]'::jsonb)
  INTO items
  FROM public.event_bring_items i
  WHERE i.event_id = _event_id;

  RETURN jsonb_build_object(
    'found', true,
    'eventTitle', ev->>'title',
    'enabled', coalesce((ev->>'bringSheetEnabled')::boolean, false),
    'allowSuggestions', coalesce((ev->>'bringSheetAllowSuggestions')::boolean, true),
    'showNames', show_names,
    'items', items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_bring_item(_item_id uuid, _name text, _dish text, _note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  it public.event_bring_items;
  ev jsonb;
  taken int;
  row_out public.event_bring_claims;
BEGIN
  SELECT * INTO it FROM public.event_bring_items WHERE id = _item_id FOR UPDATE;
  IF it IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That item is no longer on the list.');
  END IF;
  SELECT data INTO ev FROM public.events WHERE id = it.event_id AND archived_at IS NULL;
  IF ev IS NULL OR coalesce((ev->>'bringSheetEnabled')::boolean, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign-ups are closed for this event.');
  END IF;
  SELECT count(*) INTO taken FROM public.event_bring_claims WHERE item_id = _item_id;
  IF taken >= it.slots_needed THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Someone just claimed the last spot for that item.');
  END IF;
  INSERT INTO public.event_bring_claims (item_id, event_id, name, dish, note)
  VALUES (_item_id, it.event_id,
          NULLIF(btrim(coalesce(_name, '')), ''),
          NULLIF(left(btrim(coalesce(_dish, '')), 200), ''),
          NULLIF(left(btrim(coalesce(_note, '')), 300), ''))
  RETURNING * INTO row_out;
  RETURN jsonb_build_object('ok', true, 'id', row_out.id, 'token', row_out.edit_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.suggest_bring_item(
  _event_id text, _item_name text, _category text, _serves integer,
  _guest_name text, _note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ev jsonb;
  it public.event_bring_items;
  row_out public.event_bring_claims;
  next_pos int;
BEGIN
  IF _item_name IS NULL OR length(btrim(_item_name)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tell us what you would like to bring.');
  END IF;
  SELECT data INTO ev FROM public.events WHERE id = _event_id AND archived_at IS NULL;
  IF ev IS NULL OR coalesce((ev->>'bringSheetEnabled')::boolean, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign-ups are closed for this event.');
  END IF;
  IF coalesce((ev->>'bringSheetAllowSuggestions')::boolean, true) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The host is only accepting the items on the list.');
  END IF;
  IF (SELECT count(*) FROM public.event_bring_items WHERE event_id = _event_id) >= 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This list is full.');
  END IF;
  SELECT coalesce(max(position), 0) + 1 INTO next_pos FROM public.event_bring_items WHERE event_id = _event_id;
  INSERT INTO public.event_bring_items (event_id, name, category, slots_needed, serves, suggested_by_guest, position)
  VALUES (_event_id, left(btrim(_item_name), 120),
          coalesce(NULLIF(btrim(coalesce(_category, '')), ''), 'other'),
          1,
          CASE WHEN _serves IS NULL THEN NULL ELSE least(500, greatest(1, _serves)) END,
          true, next_pos)
  RETURNING * INTO it;
  INSERT INTO public.event_bring_claims (item_id, event_id, name, dish, note)
  VALUES (it.id, _event_id,
          NULLIF(btrim(coalesce(_guest_name, '')), ''),
          left(btrim(_item_name), 200),
          NULLIF(left(btrim(coalesce(_note, '')), 300), ''))
  RETURNING * INTO row_out;
  RETURN jsonb_build_object('ok', true, 'itemId', it.id, 'id', row_out.id, 'token', row_out.edit_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_bring_claim_by_token(
  _id uuid, _token text, _name text, _dish text, _note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated int;
BEGIN
  UPDATE public.event_bring_claims
     SET name = NULLIF(btrim(coalesce(_name, '')), ''),
         dish = NULLIF(left(btrim(coalesce(_dish, '')), 200), ''),
         note = NULLIF(left(btrim(coalesce(_note, '')), 300), '')
   WHERE id = _id AND edit_token = _token;
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'We could not find that sign-up.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_bring_claim_by_token(_id uuid, _token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  claim public.event_bring_claims;
  removed int;
BEGIN
  SELECT * INTO claim FROM public.event_bring_claims WHERE id = _id AND edit_token = _token;
  IF claim IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'We could not find that sign-up.');
  END IF;
  DELETE FROM public.event_bring_claims WHERE id = _id AND edit_token = _token;
  GET DIAGNOSTICS removed = ROW_COUNT;
  -- A guest-suggested item exists only because of that guest's own sign-up;
  -- once released with nobody else on it, remove the empty suggestion too.
  DELETE FROM public.event_bring_items i
   WHERE i.id = claim.item_id
     AND i.suggested_by_guest = true
     AND NOT EXISTS (SELECT 1 FROM public.event_bring_claims c WHERE c.item_id = i.id);
  RETURN jsonb_build_object('ok', removed > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_bring_sheet(text) FROM public;
REVOKE ALL ON FUNCTION public.claim_bring_item(uuid, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.suggest_bring_item(text, text, text, integer, text, text) FROM public;
REVOKE ALL ON FUNCTION public.update_bring_claim_by_token(uuid, text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.release_bring_claim_by_token(uuid, text) FROM public;

GRANT EXECUTE ON FUNCTION public.get_public_bring_sheet(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_bring_item(uuid, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.suggest_bring_item(text, text, text, integer, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_bring_claim_by_token(uuid, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_bring_claim_by_token(uuid, text) TO anon, authenticated, service_role;
