CREATE OR REPLACE FUNCTION public.get_ecard_music(_slug text)
RETURNS TABLE(id uuid, kind text, title text, seconds integer, storage_path text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.kind, p.title, p.seconds, p.storage_path
  FROM public.ecards c
  JOIN public.sound_pieces p ON p.id = c.music_piece_id
  WHERE c.public_slug = _slug
    AND p.removed_at IS NULL
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_sound_samples()
RETURNS TABLE(id uuid, kind text, title text, seconds integer, storage_path text, share_token text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.kind, p.title, p.seconds, p.storage_path, p.share_token
  FROM public.sound_pieces p
  WHERE p.is_sample
    AND p.removed_at IS NULL
  ORDER BY p.created_at DESC
  LIMIT 6;
$function$;