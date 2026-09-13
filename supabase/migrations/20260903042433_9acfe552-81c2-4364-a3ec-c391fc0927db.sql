ALTER TABLE public.sound_pieces
  ADD COLUMN IF NOT EXISTS storage_bucket text NOT NULL DEFAULT 'sound-pieces',
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'studio',
  ADD COLUMN IF NOT EXISTS wall_music_id uuid REFERENCES public.event_wall_music(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prompt text,
  ADD COLUMN IF NOT EXISTS bpm integer,
  ADD COLUMN IF NOT EXISTS energy numeric,
  ADD COLUMN IF NOT EXISTS intro_ms integer,
  ADD COLUMN IF NOT EXISTS outro_ms integer;

ALTER TABLE public.sound_pieces
  DROP CONSTRAINT IF EXISTS sound_pieces_origin_check;

ALTER TABLE public.sound_pieces
  ADD CONSTRAINT sound_pieces_origin_check CHECK (origin IN ('studio', 'wall'));

-- Event ids in this app are short text codes, not uuids. Both tables are empty,
-- so this only fixes the column type before anything is stored.
ALTER TABLE public.sound_pieces
  ALTER COLUMN event_id TYPE text USING event_id::text;

ALTER TABLE public.sound_piece_purchases
  ALTER COLUMN event_id TYPE text USING event_id::text;

CREATE UNIQUE INDEX IF NOT EXISTS sound_pieces_wall_music_id_key
  ON public.sound_pieces (wall_music_id)
  WHERE wall_music_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sound_pieces_user_created_idx
  ON public.sound_pieces (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sound_pieces_event_idx
  ON public.sound_pieces (event_id)
  WHERE event_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sound_pieces TO authenticated;
GRANT ALL ON public.sound_pieces TO service_role;
GRANT SELECT ON public.sound_piece_purchases TO authenticated;
GRANT ALL ON public.sound_piece_purchases TO service_role;