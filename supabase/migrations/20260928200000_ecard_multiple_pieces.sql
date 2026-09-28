-- Group eCards can carry several Sound Studio pieces (songs, poems, letters),
-- in order, instead of the single ecards.music_piece_id.
--
-- Rows are only ever inserted by the server (service role) after it has checked
-- that the piece was paid for, or that the organizer is an owner. There is
-- deliberately no INSERT policy, so the paid-first rule cannot be skipped by
-- writing to the table directly.

CREATE TABLE IF NOT EXISTS public.ecard_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecard_id uuid NOT NULL REFERENCES public.ecards(id) ON DELETE CASCADE,
  piece_id uuid NOT NULL REFERENCES public.sound_pieces(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  heard_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ecard_id, piece_id)
);

CREATE INDEX IF NOT EXISTS ecard_pieces_ecard_idx ON public.ecard_pieces (ecard_id, position);

REVOKE ALL ON public.ecard_pieces FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ecard_pieces TO authenticated;
GRANT ALL ON public.ecard_pieces TO service_role;

ALTER TABLE public.ecard_pieces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers read their card pieces"
  ON public.ecard_pieces FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ecards e
    WHERE e.id = ecard_pieces.ecard_id AND e.organizer_user_id = auth.uid()
  ));

CREATE POLICY "Organizers remove their card pieces"
  ON public.ecard_pieces FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ecards e
    WHERE e.id = ecard_pieces.ecard_id AND e.organizer_user_id = auth.uid()
  ));

-- Carry over every card's existing single piece, so nothing already attached is lost.
INSERT INTO public.ecard_pieces (ecard_id, piece_id, position, heard_at)
SELECT c.id, c.music_piece_id, 0, c.music_heard_at
FROM public.ecards c
JOIN public.sound_pieces p ON p.id = c.music_piece_id
WHERE c.music_piece_id IS NOT NULL
ON CONFLICT (ecard_id, piece_id) DO NOTHING;

-- Every piece on a card, in play order, for the reveal page.
CREATE OR REPLACE FUNCTION public.get_ecard_pieces(_slug text)
 RETURNS TABLE(id uuid, kind text, title text, seconds integer, storage_path text, words text, "position" integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.kind, p.title, p.seconds, p.storage_path, p.words, ep.position
  FROM public.ecards c
  JOIN public.ecard_pieces ep ON ep.ecard_id = c.id
  JOIN public.sound_pieces p ON p.id = ep.piece_id
  WHERE c.public_slug = _slug
    AND p.removed_at IS NULL
  ORDER BY ep.position, ep.created_at;
$function$;

-- Stamped on the first real listen of each piece. The card-level
-- music_heard_at is kept too, for anything still reading it.
CREATE OR REPLACE FUNCTION public.mark_ecard_piece_heard(_slug text, _piece_id uuid)
 RETURNS void
 LANGUAGE sql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.ecard_pieces ep
  SET heard_at = now()
  FROM public.ecards c
  WHERE c.id = ep.ecard_id
    AND c.public_slug = _slug
    AND ep.piece_id = _piece_id
    AND ep.heard_at IS NULL;
  UPDATE public.ecards
  SET music_heard_at = now()
  WHERE public_slug = _slug
    AND music_heard_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.ecard_pieces ep
      WHERE ep.ecard_id = ecards.id AND ep.piece_id = _piece_id
    );
$function$;

REVOKE ALL ON FUNCTION public.get_ecard_pieces(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_ecard_piece_heard(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ecard_pieces(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_ecard_piece_heard(text, uuid) TO service_role;
