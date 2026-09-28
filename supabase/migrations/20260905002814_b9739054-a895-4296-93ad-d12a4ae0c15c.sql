-- Readable-but-unguessable share addresses -----------------------------------
CREATE OR REPLACE FUNCTION public.sound_slugify(_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(
      trim(both '-' from regexp_replace(lower(COALESCE(_text, '')), '[^a-z0-9]+', '-', 'g')),
      ''
    ),
    'piece'
  );
$$;

-- 10 characters from a 31-symbol alphabet (no look-alikes) ~= 49.5 bits.
CREATE OR REPLACE FUNCTION public.sound_share_suffix()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  alphabet text := '23456789abcdefghjkmnpqrstuvwxyz';
  out text := '';
  i int;
BEGIN
  FOR i IN 1..10 LOOP
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  END LOOP;
  RETURN out;
END;
$$;

ALTER TABLE public.sound_pieces ADD COLUMN IF NOT EXISTS share_slug text;
CREATE UNIQUE INDEX IF NOT EXISTS sound_pieces_share_slug_key
  ON public.sound_pieces (share_slug) WHERE share_slug IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sound_pieces_set_share_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.share_slug IS NULL THEN
    NEW.share_slug := left(public.sound_slugify(NEW.title), 48) || '-' || public.sound_share_suffix();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sound_pieces_share_slug ON public.sound_pieces;
CREATE TRIGGER sound_pieces_share_slug
  BEFORE INSERT ON public.sound_pieces
  FOR EACH ROW EXECUTE FUNCTION public.sound_pieces_set_share_slug();

UPDATE public.sound_pieces
   SET share_slug = left(public.sound_slugify(title), 48) || '-' || public.sound_share_suffix()
 WHERE share_slug IS NULL;

-- Playlists -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sound_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  event_id text,
  share_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  share_slug text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sound_playlists_share_token_key
  ON public.sound_playlists (share_token);
CREATE UNIQUE INDEX IF NOT EXISTS sound_playlists_share_slug_key
  ON public.sound_playlists (share_slug) WHERE share_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS sound_playlists_user_idx ON public.sound_playlists (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sound_playlists TO authenticated;
GRANT ALL ON public.sound_playlists TO service_role;
ALTER TABLE public.sound_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their own playlists"
  ON public.sound_playlists FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.sound_playlists_set_share_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.share_slug IS NULL THEN
    NEW.share_slug := left(public.sound_slugify(NEW.name), 48) || '-' || public.sound_share_suffix();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sound_playlists_share_slug ON public.sound_playlists;
CREATE TRIGGER sound_playlists_share_slug
  BEFORE INSERT OR UPDATE ON public.sound_playlists
  FOR EACH ROW EXECUTE FUNCTION public.sound_playlists_set_share_slug();

CREATE TABLE IF NOT EXISTS public.sound_playlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.sound_playlists(id) ON DELETE CASCADE,
  piece_id uuid NOT NULL REFERENCES public.sound_pieces(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, piece_id)
);

CREATE INDEX IF NOT EXISTS sound_playlist_items_order_idx
  ON public.sound_playlist_items (playlist_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sound_playlist_items TO authenticated;
GRANT ALL ON public.sound_playlist_items TO service_role;
ALTER TABLE public.sound_playlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage items in their own playlists"
  ON public.sound_playlist_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sound_playlists pl
       WHERE pl.id = playlist_id AND pl.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sound_playlists pl
       WHERE pl.id = playlist_id AND pl.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.sound_pieces p
       WHERE p.id = piece_id AND p.user_id = auth.uid() AND p.removed_at IS NULL
    )
  );

-- Public readers: title, order and audio only -------------------------------
CREATE OR REPLACE FUNCTION public.get_shared_sound_piece(_key text)
RETURNS TABLE(
  id uuid, kind text, title text, seconds integer,
  storage_path text, storage_bucket text, licence text,
  created_at timestamptz, host_name text, event_title text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.kind, p.title, p.seconds,
         p.storage_path, COALESCE(p.storage_bucket, 'sound-pieces'), p.licence,
         p.created_at, pr.display_name, e.data->>'title'
    FROM public.sound_pieces p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id
    LEFT JOIN public.events e ON e.id::text = p.event_id
   WHERE (p.share_slug = _key OR p.share_token = _key)
     AND p.removed_at IS NULL
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_shared_playlist(_key text)
RETURNS TABLE(
  playlist_id uuid, playlist_name text, description text, host_name text,
  piece_id uuid, title text, kind text, seconds integer,
  storage_path text, storage_bucket text, bpm integer, energy numeric,
  item_position integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pl.id, pl.name, pl.description, pr.display_name,
         p.id, p.title, p.kind, p.seconds,
         p.storage_path, COALESCE(p.storage_bucket, 'sound-pieces'),
         p.bpm, p.energy, i.position
    FROM public.sound_playlists pl
    LEFT JOIN public.profiles pr ON pr.id = pl.user_id
    LEFT JOIN public.sound_playlist_items i ON i.playlist_id = pl.id
    LEFT JOIN public.sound_pieces p
           ON p.id = i.piece_id AND p.removed_at IS NULL
   WHERE (pl.share_slug = _key OR pl.share_token = _key)
   ORDER BY i.position ASC NULLS LAST, i.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_sound_piece(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_playlist(text) TO anon, authenticated;