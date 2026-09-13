ALTER TABLE public.event_wall_music
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS prompt text,
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bpm integer,
  ADD COLUMN IF NOT EXISTS energy numeric,
  ADD COLUMN IF NOT EXISTS intro_ms integer,
  ADD COLUMN IF NOT EXISTS outro_ms integer,
  ADD COLUMN IF NOT EXISTS crossfade_ms integer NOT NULL DEFAULT 2500,
  ADD COLUMN IF NOT EXISTS link_url text,
  ADD COLUMN IF NOT EXISTS link_provider text,
  ADD COLUMN IF NOT EXISTS link_title text,
  ADD COLUMN IF NOT EXISTS link_art_url text;

ALTER TABLE public.event_wall_music ALTER COLUMN storage_path DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_wall_music_source_check'
  ) THEN
    ALTER TABLE public.event_wall_music
      ADD CONSTRAINT event_wall_music_source_check
      CHECK (source IN ('upload', 'ai', 'link'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_wall_music_payload_check'
  ) THEN
    ALTER TABLE public.event_wall_music
      ADD CONSTRAINT event_wall_music_payload_check
      CHECK (
        (source = 'link' AND link_url IS NOT NULL)
        OR (source <> 'link' AND storage_path IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS event_wall_music_event_order_idx
  ON public.event_wall_music (event_id, order_index, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_wall_music TO authenticated;
GRANT ALL ON public.event_wall_music TO service_role;