-- ============ 1. Columns ============
ALTER TABLE public.ecards
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

CREATE UNIQUE INDEX IF NOT EXISTS ecards_stripe_session_id_key
  ON public.ecards (stripe_session_id) WHERE stripe_session_id IS NOT NULL;

ALTER TABLE public.ecard_contributions
  ADD COLUMN IF NOT EXISTS edit_token text;

ALTER TABLE public.ecard_contributions
  DROP CONSTRAINT IF EXISTS ecard_contributions_media_type_check;
ALTER TABLE public.ecard_contributions
  ADD CONSTRAINT ecard_contributions_media_type_check
  CHECK (media_type = ANY (ARRAY['none'::text, 'gif'::text, 'image'::text, 'video'::text]));

CREATE OR REPLACE FUNCTION public.ecard_make_token()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT encode(gen_random_bytes(18), 'hex')
$$;

UPDATE public.ecard_contributions
   SET edit_token = public.ecard_make_token()
 WHERE edit_token IS NULL;

ALTER TABLE public.ecard_contributions
  ALTER COLUMN edit_token SET DEFAULT public.ecard_make_token();
ALTER TABLE public.ecard_contributions
  ALTER COLUMN edit_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ecard_contributions_edit_token_key
  ON public.ecard_contributions (edit_token);

-- ============ 2. Rate limit table (internal only) ============
CREATE TABLE IF NOT EXISTS public.ecard_rate_limit (
  ecard_id uuid NOT NULL REFERENCES public.ecards(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (ecard_id, window_start)
);
REVOKE ALL ON public.ecard_rate_limit FROM anon, authenticated;
GRANT ALL ON public.ecard_rate_limit TO service_role;
ALTER TABLE public.ecard_rate_limit ENABLE ROW LEVEL SECURITY;

-- ============ 3. Organizer may add their own contribution ============
DROP POLICY IF EXISTS "Organizers add contributions to their cards" ON public.ecard_contributions;
CREATE POLICY "Organizers add contributions to their cards"
  ON public.ecard_contributions FOR INSERT TO authenticated
  WITH CHECK (public.ecard_owner_id(ecard_id) = auth.uid());

-- ============ 4. Profanity check ============
CREATE OR REPLACE FUNCTION public.ecard_has_profanity(_text text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  _t text := lower(coalesce(_text, ''));
  _w text;
  _words text[] := ARRAY[
    'fuck','shit','bitch','cunt','asshole','bastard','dickhead','motherfucker',
    'wanker','twat','slut','whore','nigger','nigga','faggot','fag','retard',
    'paki','spastic','kike','chink','tranny','rape','pedo','paedo'
  ];
BEGIN
  _t := regexp_replace(_t, '[^a-z ]', '', 'g');
  FOREACH _w IN ARRAY _words LOOP
    IF _t ~ ('(^| )' || _w || '(s|es|ing|ed)?( |$)') THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

-- ============ 5. Contribution insert RPC (locked after reveal, rate limited, profanity filtered, video, edit token) ============
CREATE OR REPLACE FUNCTION public.add_ecard_contribution(
  _slug text,
  _contributor_name text,
  _message text,
  _media_type text DEFAULT 'none'::text,
  _media_url text DEFAULT NULL::text,
  _gif_url text DEFAULT NULL::text
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
  IF _type NOT IN ('none','gif','image','video') THEN
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
    CASE WHEN _type IN ('image','video') THEN left(coalesce(_media_url, ''), 1000) ELSE NULL END,
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
$function$;

-- ============ 6. Contributor self-service by token ============
CREATE OR REPLACE FUNCTION public.get_ecard_contribution_by_token(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'contributor_name', c.contributor_name,
    'message', c.message,
    'media_type', c.media_type,
    'media_url', c.media_url,
    'gif_url', c.gif_url,
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
$$;

CREATE OR REPLACE FUNCTION public.update_ecard_contribution_by_token(
  _token text,
  _message text,
  _media_type text DEFAULT 'none'::text,
  _media_url text DEFAULT NULL::text,
  _gif_url text DEFAULT NULL::text
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
BEGIN
  SELECT * INTO _row FROM public.ecard_contributions WHERE edit_token = _token;
  IF _row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That edit link is not valid.');
  END IF;
  SELECT * INTO _card FROM public.ecards WHERE id = _row.ecard_id;
  IF _card.status = 'revealed' OR _card.reveal_date <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This card has already been sent, so it can no longer be changed.');
  END IF;
  IF _type NOT IN ('none','gif','image','video') THEN
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
         media_url = CASE WHEN _type IN ('image','video') THEN left(coalesce(_media_url, ''), 1000) ELSE NULL END,
         gif_url = CASE WHEN _type = 'gif' THEN left(coalesce(_gif_url, ''), 1000) ELSE NULL END
   WHERE id = _row.id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_ecard_contribution_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.ecard_contributions;
  _card public.ecards;
BEGIN
  SELECT * INTO _row FROM public.ecard_contributions WHERE edit_token = _token;
  IF _row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That edit link is not valid.');
  END IF;
  SELECT * INTO _card FROM public.ecards WHERE id = _row.ecard_id;
  IF _card.status = 'revealed' OR _card.reveal_date <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This card has already been sent, so it can no longer be changed.');
  END IF;
  DELETE FROM public.ecard_contributions WHERE id = _row.id;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ============ 7. Grants: RPC-only public surface, no table grants ============
REVOKE ALL ON FUNCTION public.add_ecard_contribution(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ecard_contribution_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_ecard_contribution_by_token(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_ecard_contribution_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ecard_has_profanity(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ecard_make_token() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.add_ecard_contribution(text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ecard_contribution_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_ecard_contribution_by_token(text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_ecard_contribution_by_token(text) TO anon, authenticated;