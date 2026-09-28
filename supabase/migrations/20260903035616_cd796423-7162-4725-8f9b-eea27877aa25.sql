ALTER TABLE public.sound_pieces
  ADD COLUMN IF NOT EXISTS remix_of uuid REFERENCES public.sound_pieces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_id uuid;

ALTER TABLE public.sound_piece_purchases
  ADD COLUMN IF NOT EXISTS event_id uuid;

ALTER TABLE public.sound_concierge_requests
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS quoted_cents integer;

CREATE INDEX IF NOT EXISTS sound_pieces_remix_of_idx ON public.sound_pieces(remix_of);
CREATE INDEX IF NOT EXISTS sound_pieces_event_idx ON public.sound_pieces(event_id);