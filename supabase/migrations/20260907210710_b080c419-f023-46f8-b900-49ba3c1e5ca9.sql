DROP FUNCTION IF EXISTS public.get_shared_sound_piece(text);

CREATE OR REPLACE FUNCTION public.get_shared_sound_piece(_key text)
RETURNS TABLE(
  id uuid, kind text, title text, seconds integer,
  storage_path text, storage_bucket text, licence text,
  created_at timestamptz, host_name text, event_title text,
  words text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.kind, p.title, p.seconds,
         p.storage_path, COALESCE(p.storage_bucket, 'sound-pieces'), p.licence,
         p.created_at, pr.display_name, e.data->>'title', p.words
    FROM public.sound_pieces p
    LEFT JOIN public.profiles pr ON pr.id = p.user_id
    LEFT JOIN public.events e ON e.id::text = p.event_id
   WHERE (p.share_slug = _key OR p.share_token = _key)
     AND p.removed_at IS NULL
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_shared_sound_piece(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_sound_piece(text) TO anon, authenticated, service_role;