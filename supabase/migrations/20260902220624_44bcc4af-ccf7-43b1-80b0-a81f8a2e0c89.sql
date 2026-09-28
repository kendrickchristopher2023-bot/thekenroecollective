-- 1) Saved pieces
CREATE TABLE public.sound_pieces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'song',
  title TEXT NOT NULL DEFAULT 'Untitled piece',
  words TEXT NOT NULL DEFAULT '',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  seconds INTEGER NOT NULL DEFAULT 60,
  storage_path TEXT NOT NULL,
  licence TEXT NOT NULL DEFAULT 'Personal use licence: you may play, share and include this piece in your own celebrations, cards and slideshows. Resale or commercial broadcast is not included.',
  source_sample TEXT,
  is_sample BOOLEAN NOT NULL DEFAULT false,
  share_token TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sound_pieces_share_token_key ON public.sound_pieces(share_token);
CREATE INDEX sound_pieces_user_idx ON public.sound_pieces(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sound_pieces TO authenticated;
GRANT ALL ON public.sound_pieces TO service_role;

ALTER TABLE public.sound_pieces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their own pieces"
  ON public.sound_pieces FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2) Purchases (webhook owned)
CREATE TABLE public.sound_piece_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  piece_id UUID REFERENCES public.sound_pieces(id) ON DELETE SET NULL,
  ecard_id UUID REFERENCES public.ecards(id) ON DELETE SET NULL,
  price_key TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  seconds INTEGER NOT NULL DEFAULT 60,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  credit_unused BOOLEAN NOT NULL DEFAULT false,
  environment TEXT NOT NULL DEFAULT 'test',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sound_piece_purchases_session_key
  ON public.sound_piece_purchases(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX sound_piece_purchases_user_idx ON public.sound_piece_purchases(user_id, created_at DESC);

GRANT SELECT ON public.sound_piece_purchases TO authenticated;
GRANT ALL ON public.sound_piece_purchases TO service_role;

ALTER TABLE public.sound_piece_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "People see their own music purchases"
  ON public.sound_piece_purchases FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3) Concierge requests
CREATE TABLE public.sound_concierge_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  occasion TEXT NOT NULL DEFAULT '',
  brief TEXT NOT NULL DEFAULT '',
  budget TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.sound_concierge_requests TO authenticated;
GRANT ALL ON public.sound_concierge_requests TO service_role;

ALTER TABLE public.sound_concierge_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in people can send a concierge request"
  ON public.sound_concierge_requests FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Owners and admins read concierge requests"
  ON public.sound_concierge_requests FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR auth.uid() = user_id
  );

-- 4) Daily free audition counter
CREATE TABLE public.sound_audition_day (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
GRANT ALL ON public.sound_audition_day TO service_role;
ALTER TABLE public.sound_audition_day ENABLE ROW LEVEL SECURITY;

-- Count one audition for this person today and report what is left.
CREATE OR REPLACE FUNCTION public.sound_take_audition(_user_id UUID, _limit INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used INTEGER;
BEGIN
  INSERT INTO public.sound_audition_day (user_id, day, used)
  VALUES (_user_id, (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET used = public.sound_audition_day.used + 1
  RETURNING used INTO v_used;

  IF v_used > _limit THEN
    RAISE EXCEPTION 'audition_limit_reached';
  END IF;
  RETURN GREATEST(_limit - v_used, 0);
END;
$$;

-- 5) eCards can carry a piece
ALTER TABLE public.ecards
  ADD COLUMN IF NOT EXISTS music_piece_id UUID REFERENCES public.sound_pieces(id) ON DELETE SET NULL;

-- 6) Public readers
-- Share link: only the safe fields for one piece, by its share token.
CREATE OR REPLACE FUNCTION public.get_sound_piece_by_token(_token TEXT)
RETURNS TABLE (id UUID, kind TEXT, title TEXT, seconds INTEGER, storage_path TEXT, licence TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.kind, p.title, p.seconds, p.storage_path, p.licence, p.created_at
  FROM public.sound_pieces p
  WHERE p.share_token = _token
  LIMIT 1;
$$;

-- The piece attached to a card, readable by anyone holding the card slug.
CREATE OR REPLACE FUNCTION public.get_ecard_music(_slug TEXT)
RETURNS TABLE (id UUID, kind TEXT, title TEXT, seconds INTEGER, storage_path TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.kind, p.title, p.seconds, p.storage_path
  FROM public.ecards c
  JOIN public.sound_pieces p ON p.id = c.music_piece_id
  WHERE c.public_slug = _slug
  LIMIT 1;
$$;

-- A short list of pieces flagged as public samples for the landing page.
CREATE OR REPLACE FUNCTION public.get_sound_samples()
RETURNS TABLE (id UUID, kind TEXT, title TEXT, seconds INTEGER, storage_path TEXT, share_token TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.kind, p.title, p.seconds, p.storage_path, p.share_token
  FROM public.sound_pieces p
  WHERE p.is_sample
  ORDER BY p.created_at DESC
  LIMIT 6;
$$;

GRANT EXECUTE ON FUNCTION public.get_sound_piece_by_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ecard_music(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sound_samples() TO anon, authenticated;

-- 7) Launch switch, off for now
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS music_studio_public BOOLEAN NOT NULL DEFAULT false;

-- 8) Timestamps
CREATE TRIGGER update_sound_pieces_updated_at BEFORE UPDATE ON public.sound_pieces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sound_piece_purchases_updated_at BEFORE UPDATE ON public.sound_piece_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sound_concierge_requests_updated_at BEFORE UPDATE ON public.sound_concierge_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();