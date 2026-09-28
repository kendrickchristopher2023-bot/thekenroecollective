-- ============ Group eCards (Venture 04) ============

CREATE TABLE public.ecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occasion text NOT NULL,
  recipient_name text NOT NULL,
  theme text NOT NULL DEFAULT 'confetti',
  reveal_date timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'collecting' CHECK (status IN ('draft','collecting','revealed')),
  public_slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ecards TO authenticated;
GRANT ALL ON public.ecards TO service_role;

ALTER TABLE public.ecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers manage their own ecards"
  ON public.ecards FOR ALL TO authenticated
  USING (auth.uid() = organizer_user_id)
  WITH CHECK (auth.uid() = organizer_user_id);

CREATE INDEX ecards_organizer_idx ON public.ecards (organizer_user_id, created_at DESC);

CREATE TRIGGER ecards_touch_updated_at
  BEFORE UPDATE ON public.ecards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Security-definer owner lookup so contribution policies never recurse.
CREATE OR REPLACE FUNCTION public.ecard_owner_id(_ecard_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organizer_user_id FROM public.ecards WHERE id = _ecard_id
$$;

REVOKE ALL ON FUNCTION public.ecard_owner_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ecard_owner_id(uuid) TO authenticated, service_role;

CREATE TABLE public.ecard_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecard_id uuid NOT NULL REFERENCES public.ecards(id) ON DELETE CASCADE,
  contributor_name text NOT NULL,
  message text NOT NULL DEFAULT '',
  media_type text NOT NULL DEFAULT 'none' CHECK (media_type IN ('none','gif','image')),
  media_url text,
  gif_url text,
  is_hidden boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.ecard_contributions TO authenticated;
GRANT ALL ON public.ecard_contributions TO service_role;

ALTER TABLE public.ecard_contributions ENABLE ROW LEVEL SECURITY;

-- Organizer only. Contributors (anon) get no SELECT policy at all; they write
-- exclusively through the security-definer function below.
CREATE POLICY "Organizers read their card contributions"
  ON public.ecard_contributions FOR SELECT TO authenticated
  USING (public.ecard_owner_id(ecard_id) = auth.uid());

CREATE POLICY "Organizers update their card contributions"
  ON public.ecard_contributions FOR UPDATE TO authenticated
  USING (public.ecard_owner_id(ecard_id) = auth.uid())
  WITH CHECK (public.ecard_owner_id(ecard_id) = auth.uid());

CREATE POLICY "Organizers delete their card contributions"
  ON public.ecard_contributions FOR DELETE TO authenticated
  USING (public.ecard_owner_id(ecard_id) = auth.uid());

CREATE INDEX ecard_contributions_card_idx
  ON public.ecard_contributions (ecard_id, position, created_at);

-- ---------- Public (no login) access paths ----------

-- Card metadata only. Never exposes the organizer id or contributions.
CREATE OR REPLACE FUNCTION public.get_ecard_by_slug(_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'occasion', e.occasion,
    'recipient_name', e.recipient_name,
    'theme', e.theme,
    'reveal_date', e.reveal_date,
    'status', e.status,
    'public_slug', e.public_slug,
    'contribution_count', (
      SELECT count(*) FROM public.ecard_contributions c
      WHERE c.ecard_id = e.id AND c.is_hidden = false
    ),
    'revealed', (e.status = 'revealed' OR e.reveal_date <= now())
  )
  FROM public.ecards e
  WHERE e.public_slug = _slug AND e.status <> 'draft'
$$;

GRANT EXECUTE ON FUNCTION public.get_ecard_by_slug(text) TO anon, authenticated, service_role;

-- Contributors insert here. No read-back of other contributions.
CREATE OR REPLACE FUNCTION public.add_ecard_contribution(
  _slug text,
  _contributor_name text,
  _message text,
  _media_type text DEFAULT 'none',
  _media_url text DEFAULT NULL,
  _gif_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _card public.ecards;
  _name text := btrim(coalesce(_contributor_name, ''));
  _msg text := btrim(coalesce(_message, ''));
  _type text := coalesce(nullif(btrim(_media_type), ''), 'none');
BEGIN
  SELECT * INTO _card FROM public.ecards
   WHERE public_slug = _slug AND status = 'collecting';
  IF _card.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This card is not accepting messages right now.');
  END IF;
  IF _card.reveal_date <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This card has already been delivered.');
  END IF;
  IF _name = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please add your name.');
  END IF;
  IF _msg = '' AND _type = 'none' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please write a message or add some media.');
  END IF;
  IF _type NOT IN ('none','gif','image') THEN
    _type := 'none';
  END IF;

  INSERT INTO public.ecard_contributions (
    ecard_id, contributor_name, message, media_type, media_url, gif_url, position
  ) VALUES (
    _card.id,
    left(_name, 80),
    left(_msg, 2000),
    _type,
    CASE WHEN _type = 'image' THEN left(coalesce(_media_url, ''), 1000) ELSE NULL END,
    CASE WHEN _type = 'gif' THEN left(coalesce(_gif_url, ''), 1000) ELSE NULL END,
    COALESCE((SELECT max(position) + 1 FROM public.ecard_contributions WHERE ecard_id = _card.id), 0)
  );

  RETURN jsonb_build_object('ok', true, 'recipient_name', _card.recipient_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_ecard_contribution(text, text, text, text, text, text)
  TO anon, authenticated, service_role;

-- Recipient reveal. Returns nothing until the card is revealed or the date passes.
CREATE OR REPLACE FUNCTION public.get_ecard_reveal(_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
               'gif_url', c.gif_url
             ) ORDER BY c.position, c.created_at)
      FROM public.ecard_contributions c
      WHERE c.ecard_id = e.id AND c.is_hidden = false
    ), '[]'::jsonb)
  )
  FROM public.ecards e
  WHERE e.public_slug = _slug
    AND e.status <> 'draft'
    AND (e.status = 'revealed' OR e.reveal_date <= now())
$$;

GRANT EXECUTE ON FUNCTION public.get_ecard_reveal(text) TO anon, authenticated, service_role;