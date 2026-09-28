ALTER TABLE public.ecard_contributions
  DROP CONSTRAINT IF EXISTS ecard_contributions_media_type_check;

ALTER TABLE public.ecard_contributions
  ADD CONSTRAINT ecard_contributions_media_type_check
  CHECK (media_type = ANY (ARRAY['none'::text, 'gif'::text, 'image'::text, 'video'::text, 'audio'::text]));

CREATE OR REPLACE FUNCTION public.add_ecard_contribution(
  _slug text,
  _contributor_name text,
  _message text,
  _media_type text DEFAULT 'none',
  _media_url text DEFAULT NULL,
  _gif_url text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _card public.ecards;
  _name text := btrim(coalesce(_contributor_name, ''));
  _msg text := btrim(coalesce(_message, ''));
  _type text := coalesce(nullif(btrim(_media_type), ''), 'none');
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
  IF _type NOT IN ('none','gif','image','video','audio') THEN
    _type := 'none';
  END IF;
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
    ecard_id, contributor_name, message, media_type, media_url, gif_url, position, edit_token
  ) VALUES (
    _card.id,
    left(_name, 80),
    left(_msg, 2000),
    _type,
    CASE WHEN _type IN ('image','video','audio') THEN left(coalesce(_media_url, ''), 1000) ELSE NULL END,
    CASE WHEN _type = 'gif' THEN left(coalesce(_gif_url, ''), 1000) ELSE NULL END,
    COALESCE((SELECT max(position) + 1 FROM public.ecard_contributions WHERE ecard_id = _card.id), 0),
    _token
  );

  RETURN jsonb_build_object(
    'ok', true,
    'recipient_name', _card.recipient_name,
    'edit_token', _token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_ecard_contribution_by_token(
  _token text,
  _message text,
  _media_type text DEFAULT 'none',
  _media_url text DEFAULT NULL,
  _gif_url text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.ecard_contributions;
  _card public.ecards;
  _msg text := btrim(coalesce(_message, ''));
  _type text := coalesce(nullif(btrim(_media_type), ''), 'none');
BEGIN
  SELECT * INTO _row FROM public.ecard_contributions WHERE edit_token = _token;
  IF _row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That edit link is not valid.');
  END IF;
  SELECT * INTO _card FROM public.ecards WHERE id = _row.ecard_id;
  IF _card.status = 'revealed' OR _card.reveal_date <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This card has already been sent, so it can no longer be changed.');
  END IF;
  IF _type NOT IN ('none','gif','image','video','audio') THEN
    _type := 'none';
  END IF;
  IF _msg = '' AND _type = 'none' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please write a message or add some media.');
  END IF;
  IF public.ecard_has_profanity(_msg) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please reword that without offensive language.');
  END IF;

  UPDATE public.ecard_contributions
     SET message = left(_msg, 2000),
         media_type = _type,
         media_url = CASE WHEN _type IN ('image','video','audio') THEN left(coalesce(_media_url, ''), 1000) ELSE NULL END,
         gif_url = CASE WHEN _type = 'gif' THEN left(coalesce(_gif_url, ''), 1000) ELSE NULL END
   WHERE id = _row.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;