-- 1. The showcase event row survives every delete that is not explicitly opted in.
CREATE OR REPLACE FUNCTION public.protect_showcase_event_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_showcase_event(OLD.id)
     AND coalesce(current_setting('app.allow_showcase_delete', true), '') <> 'on' THEN
    -- Skip this row silently so a bulk cleanup still deletes everything else.
    RETURN NULL;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_showcase_event_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_showcase_event_delete ON public.events;
CREATE TRIGGER protect_showcase_event_delete
  BEFORE DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.protect_showcase_event_delete();

-- 2. Never tombstone the showcase, even if a delete is ever forced through.
CREATE OR REPLACE FUNCTION public.record_demo_event_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(OLD.is_demo, false) AND NOT public.is_showcase_event(OLD.id) THEN
    INSERT INTO public.demo_seed_tombstones (kind, row_key)
    VALUES ('event', OLD.id)
    ON CONFLICT (kind, row_key) DO UPDATE SET deleted_at = now();
  END IF;
  RETURN OLD;
END;
$$;

-- 3. The public-write lock stays, but a server-side restore may pass through it.
CREATE OR REPLACE FUNCTION public.block_showcase_public_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_showcase_event(COALESCE(NEW.event_id, OLD.event_id))
     AND coalesce(current_setting('app.showcase_seed', true), '') <> 'on' THEN
    RAISE EXCEPTION 'This is a sample invitation and is read-only.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Restore the showcase's invented samples in one transaction. Service role only.
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
    SELECT _event_id, p->>'storagePath', p->>'uploaderLabel', 'approved', 'image/jpeg'
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
REVOKE ALL ON FUNCTION public.restore_showcase_samples(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_showcase_samples(jsonb, jsonb, jsonb, jsonb) TO service_role;

-- 5. Separate counter for the sample. No identity, no join to any customer table.
CREATE TABLE IF NOT EXISTS public.showcase_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('open', 'play', 'cta')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.showcase_interactions TO service_role;
ALTER TABLE public.showcase_interactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS showcase_interactions_created_idx ON public.showcase_interactions (created_at);