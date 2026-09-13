ALTER TABLE public.sound_pieces
  ADD COLUMN IF NOT EXISTS eleven_song_id text,
  ADD COLUMN IF NOT EXISTS plan_json jsonb,
  ADD COLUMN IF NOT EXISTS loop_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_seconds integer;

COMMENT ON COLUMN public.sound_pieces.eleven_song_id IS 'Composer-side id of the stored recording; present only when the original audio can be kept and extended.';
COMMENT ON COLUMN public.sound_pieces.plan_json IS 'The arrangement the host approved, reused when the length is changed.';
COMMENT ON COLUMN public.sound_pieces.loop_ready IS 'Host marked this piece as suitable for looping under photographs.';
COMMENT ON COLUMN public.sound_pieces.parent_seconds IS 'Length of the piece this one was grown or trimmed from.';