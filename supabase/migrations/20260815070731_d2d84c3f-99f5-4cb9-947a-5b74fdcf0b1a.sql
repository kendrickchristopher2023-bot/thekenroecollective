-- 1. Additive columns so several attachments can coexist on one message.
ALTER TABLE public.ecard_contributions
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS audio_url text;

COMMENT ON COLUMN public.ecard_contributions.image_url IS 'Optional photo attachment. Coexists with gif_url, video_url and audio_url.';
COMMENT ON COLUMN public.ecard_contributions.video_url IS 'Optional video attachment. Coexists with gif_url, image_url and audio_url.';
COMMENT ON COLUMN public.ecard_contributions.audio_url IS 'Optional voice note attachment. Coexists with gif_url, image_url and video_url.';
COMMENT ON COLUMN public.ecard_contributions.media_url IS 'Legacy single-attachment column, kept in sync with the primary attachment for older readers. New code reads image_url/video_url/audio_url/gif_url.';

-- 2. Non-destructive backfill: classify the existing single attachment only.
UPDATE public.ecard_contributions
   SET image_url = media_url
 WHERE media_type = 'image' AND media_url IS NOT NULL AND btrim(media_url) <> '' AND image_url IS NULL;

UPDATE public.ecard_contributions
   SET video_url = media_url
 WHERE media_type = 'video' AND media_url IS NOT NULL AND btrim(media_url) <> '' AND video_url IS NULL;

UPDATE public.ecard_contributions
   SET audio_url = media_url
 WHERE media_type = 'audio' AND media_url IS NOT NULL AND btrim(media_url) <> '' AND audio_url IS NULL;

-- 3. Public read helpers now expose every attachment.
CREATE OR REPLACE FUNCTION public.get_ecard_reveal(_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'occasion', e.occasion,
    'recipient_name', e.recipient_name,
    'theme', e.theme,
    'reveal_date', e.reveal_date,
    'revealed', true,
    'contributions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', c.id,
               'contributor_name', c.contributor_name,
               'message', c.message,
               'media_type', c.media_type,
               'media_url', c.media_url,
               'gif_url', c.gif_url,
               'image_url', c.image_url,
               'video_url', c.video_url,
               'audio_url', c.audio_url
             ) ORDER BY c.position, c.created_at)
      FROM public.ecard_contributions c
      WHERE c.ecard_id = e.id AND c.is_hidden = false
    ), '[]'::jsonb)
  )
  FROM public.ecards e
  WHERE e.public_slug = _slug
    AND e.status <> 'draft'
    AND (e.status = 'revealed' OR e.reveal_date <= now())
$function$;

CREATE OR REPLACE FUNCTION public.get_ecard_contribution_by_token(_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', c.id,
    'contributor_name', c.contributor_name,
    'message', c.message,
    'media_type', c.media_type,
    'media_url', c.media_url,
    'gif_url', c.gif_url,
    'image_url', c.image_url,
    'video_url', c.video_url,
    'audio_url', c.audio_url,
    'occasion', e.occasion,
    'recipient_name', e.recipient_name,
    'theme', e.theme,
    'reveal_date', e.reveal_date,
    'public_slug', e.public_slug,
    'locked', (e.status = 'revealed' OR e.reveal_date <= now())
  )
  FROM public.ecard_contributions c
  JOIN public.ecards e ON e.id = c.ecard_id
  WHERE c.edit_token = _token
$function$;

-- 4. Write helpers accept several attachments. The old signatures are replaced
-- so calls stay unambiguous; every new argument is optional and defaults to null.
DROP FUNCTION IF EXISTS public.add_ecard_contribution(text, text, text, text, text, text);

CREATE FUNCTION public.add_ecard_contribution(
  _slug text,
  _contributor_name text,
  _message text,
  _media_type text DEFAULT 'none'::text,
  _media_url text DEFAULT NULL::text,
  _gif_url text DEFAULT NULL::text,
  _image_url text DEFAULT NULL::text,
  _video_url text DEFAULT NULL::text,
  _audio_url text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _card public.ecards;
  _name text := btrim(coalesce(_contributor_name, ''));
  _msg text := btrim(coalesce(_message, ''));
  _type text := coalesce(nullif(btrim(_media_type), ''), 'none');
  _gif text := nullif(btrim(coalesce(_gif_url, '')), '');
  _img text := nullif(btrim(coalesce(_image_url, '')), '');
  _vid text := nullif(btrim(coalesce(_video_url, '')), '');
  _aud text := nullif(btrim(coalesce(_audio_url, '')), '');
  _legacy text := nullif(btrim(coalesce(_media_url, '')), '');
  _win timestamptz := date_trunc('hour', now());
  _n integer;
  _token text;
BEGIN
  SELECT * INTO _card FROM public.ecards WHERE public_slug = _slug;
  IF _card.id IS NULL OR _card.status = 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This card is not accepting messages right now.');
  END IF;
  IF _card.status = 'revealed' OR _card.reveal_date <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This card has already been sent.');
  END IF;
  IF _name = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please add your name.');
  END IF;

  -- Older callers send one attachment in _media_url plus a media_type.
  IF _legacy IS NOT NULL THEN
    IF _type = 'image' AND _img IS NULL THEN _img := _legacy; END IF;
    IF _type = 'video' AND _vid IS NULL THEN _vid := _legacy; END IF;
    IF _type = 'audio' AND _aud IS NULL THEN _aud := _legacy; END IF;
  END IF;

  -- media_type stays meaningful for legacy readers: the primary attachment.
  _type := CASE
    WHEN _gif IS NOT NULL THEN 'gif'
    WHEN _aud IS NOT NULL THEN 'audio'
    WHEN _vid IS NOT NULL THEN 'video'
    WHEN _img IS NOT NULL THEN 'image'
    ELSE 'none'
  END;

  IF _msg = '' AND _type = 'none' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please write a message or add some media.');
  END IF;
  IF public.ecard_has_profanity(_msg) OR public.ecard_has_profanity(_name) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please reword that without offensive language.');
  END IF;

  INSERT INTO public.ecard_rate_limit (ecard_id, window_start, count)
  VALUES (_card.id, _win, 1)
  ON CONFLICT (ecard_id, window_start)
    DO UPDATE SET count = public.ecard_rate_limit.count + 1
  RETURNING count INTO _n;
  IF _n > 60 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This card has had a lot of messages in the last hour. Please try again shortly.');
  END IF;

  _token := public.ecard_make_token();

  INSERT INTO public.ecard_contributions (
    ecard_id, contributor_name, message, media_type, media_url, gif_url,
    image_url, video_url, audio_url, position, edit_token
  ) VALUES (
    _card.id,
    left(_name, 80),
    left(_msg, 2000),
    _type,
    left(coalesce(_aud, _vid, _img, ''), 1000),
    left(coalesce(_gif, ''), 1000),
    left(coalesce(_img, ''), 1000),
    left(coalesce(_vid, ''), 1000),
    left(coalesce(_aud, ''), 1000),
    COALESCE((SELECT max(position) + 1 FROM public.ecard_contributions WHERE ecard_id = _card.id), 0),
    _token
  );

  UPDATE public.ecard_contributions
     SET media_url = nullif(media_url, ''),
         gif_url = nullif(gif_url, ''),
         image_url = nullif(image_url, ''),
         video_url = nullif(video_url, ''),
         audio_url = nullif(audio_url, '')
   WHERE edit_token = _token;

  RETURN jsonb_build_object(
    'ok', true,
    'recipient_name', _card.recipient_name,
    'edit_token', _token
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.update_ecard_contribution_by_token(text, text, text, text, text);

CREATE FUNCTION public.update_ecard_contribution_by_token(
  _token text,
  _message text,
  _media_type text DEFAULT 'none'::text,
  _media_url text DEFAULT NULL::text,
  _gif_url text DEFAULT NULL::text,
  _image_url text DEFAULT NULL::text,
  _video_url text DEFAULT NULL::text,
  _audio_url text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.ecard_contributions;
  _card public.ecards;
  _msg text := btrim(coalesce(_message, ''));
  _type text := coalesce(nullif(btrim(_media_type), ''), 'none');
  _gif text := nullif(btrim(coalesce(_gif_url, '')), '');
  _img text := nullif(btrim(coalesce(_image_url, '')), '');
  _vid text := nullif(btrim(coalesce(_video_url, '')), '');
  _aud text := nullif(btrim(coalesce(_audio_url, '')), '');
  _legacy text := nullif(btrim(coalesce(_media_url, '')), '');
BEGIN
  SELECT * INTO _row FROM public.ecard_contributions WHERE edit_token = _token;
  IF _row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That edit link is not valid.');
  END IF;
  SELECT * INTO _card FROM public.ecards WHERE id = _row.ecard_id;
  IF _card.status = 'revealed' OR _card.reveal_date <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This card has already been sent, so it can no longer be changed.');
  END IF;

  IF _legacy IS NOT NULL THEN
    IF _type = 'image' AND _img IS NULL THEN _img := _legacy; END IF;
    IF _type = 'video' AND _vid IS NULL THEN _vid := _legacy; END IF;
    IF _type = 'audio' AND _aud IS NULL THEN _aud := _legacy; END IF;
  END IF;

  _type := CASE
    WHEN _gif IS NOT NULL THEN 'gif'
    WHEN _aud IS NOT NULL THEN 'audio'
    WHEN _vid IS NOT NULL THEN 'video'
    WHEN _img IS NOT NULL THEN 'image'
    ELSE 'none'
  END;

  IF _msg = '' AND _type = 'none' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please write a message or add some media.');
  END IF;
  IF public.ecard_has_profanity(_msg) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please reword that without offensive language.');
  END IF;

  UPDATE public.ecard_contributions
     SET message = left(_msg, 2000),
         media_type = _type,
         media_url = left(coalesce(_aud, _vid, _img, ''), 1000),
         gif_url = nullif(left(coalesce(_gif, ''), 1000), ''),
         image_url = nullif(left(coalesce(_img, ''), 1000), ''),
         video_url = nullif(left(coalesce(_vid, ''), 1000), ''),
         audio_url = nullif(left(coalesce(_aud, ''), 1000), '')
   WHERE id = _row.id;

  UPDATE public.ecard_contributions
     SET media_url = nullif(media_url, '')
   WHERE id = _row.id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_ecard_contribution(text, text, text, text, text, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_ecard_contribution_by_token(text, text, text, text, text, text, text, text) TO anon, authenticated, service_role;