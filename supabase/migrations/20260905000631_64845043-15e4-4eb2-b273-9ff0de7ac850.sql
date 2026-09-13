CREATE TABLE public.sound_piece_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  piece_id uuid NOT NULL REFERENCES public.sound_pieces(id) ON DELETE CASCADE,
  source_piece_id uuid NOT NULL REFERENCES public.sound_pieces(id) ON DELETE CASCADE,
  took text[] NOT NULL DEFAULT '{}',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (piece_id, source_piece_id),
  CHECK (piece_id <> source_piece_id)
);

CREATE INDEX sound_piece_sources_piece_idx ON public.sound_piece_sources (piece_id);
CREATE INDEX sound_piece_sources_source_idx ON public.sound_piece_sources (source_piece_id);

GRANT SELECT, INSERT, DELETE ON public.sound_piece_sources TO authenticated;
GRANT ALL ON public.sound_piece_sources TO service_role;

ALTER TABLE public.sound_piece_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners see the lineage of their own pieces"
  ON public.sound_piece_sources FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sound_pieces p
    WHERE p.id = sound_piece_sources.piece_id AND p.user_id = auth.uid()
  ));

CREATE POLICY "Owners record lineage on their own pieces"
  ON public.sound_piece_sources FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sound_pieces p
    WHERE p.id = sound_piece_sources.piece_id AND p.user_id = auth.uid()
  ) AND EXISTS (
    SELECT 1 FROM public.sound_pieces s
    WHERE s.id = sound_piece_sources.source_piece_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "Owners remove lineage on their own pieces"
  ON public.sound_piece_sources FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sound_pieces p
    WHERE p.id = sound_piece_sources.piece_id AND p.user_id = auth.uid()
  ));