ALTER TABLE public.ecards ADD COLUMN IF NOT EXISTS music_heard_at timestamptz;

DROP FUNCTION IF EXISTS public.get_ecard_music(text);

CREATE FUNCTION public.get_ecard_music(_slug text)
 RETURNS TABLE(id uuid, kind text, title text, seconds integer, storage_path text, words text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.kind, p.title, p.seconds, p.storage_path, p.words
  FROM public.ecards c
  JOIN public.sound_pieces p ON p.id = c.music_piece_id
  WHERE c.public_slug = _slug
    AND p.removed_at IS NULL
  LIMIT 1;
$function$;

-- Recorded once, on the first real listen, so the sender is told it was heard
-- rather than only that the card was opened.
CREATE OR REPLACE FUNCTION public.mark_ecard_music_heard(_slug text)
 RETURNS void
 LANGUAGE sql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.ecards
  SET music_heard_at = now()
  WHERE public_slug = _slug
    AND music_piece_id IS NOT NULL
    AND music_heard_at IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.mark_ecard_music_heard(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_ecard_music_heard(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ecard_music(text) TO service_role;