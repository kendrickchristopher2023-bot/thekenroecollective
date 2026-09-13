CREATE TABLE public.invite_narrations (
  event_id text PRIMARY KEY,
  script_hash text NOT NULL,
  script text NOT NULL,
  chars integer NOT NULL DEFAULT 0,
  storage_path text,
  seconds integer,
  voice_id text,
  generating_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.invite_narrations TO service_role;

ALTER TABLE public.invite_narrations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_invite_narrations_updated_at
BEFORE UPDATE ON public.invite_narrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Claim the right to generate. Returns exactly one row.
--   ready          the cached audio matches these words and can be served
--   should_generate the caller must produce the audio now
CREATE OR REPLACE FUNCTION public.claim_invite_narration(
  _event_id text,
  _hash text,
  _script text,
  _chars integer
)
RETURNS TABLE (ready boolean, should_generate boolean, storage_path text, seconds integer, voice_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.invite_narrations;
BEGIN
  SELECT * INTO r FROM public.invite_narrations WHERE event_id = _event_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.invite_narrations (event_id, script_hash, script, chars, generating_at)
    VALUES (_event_id, _hash, _script, _chars, now());
    RETURN QUERY SELECT false, true, NULL::text, NULL::integer, NULL::text;
    RETURN;
  END IF;

  IF r.script_hash = _hash AND r.storage_path IS NOT NULL THEN
    RETURN QUERY SELECT true, false, r.storage_path, r.seconds, r.voice_id;
    RETURN;
  END IF;

  -- Someone else started on these same words moments ago: let them finish.
  IF r.generating_at IS NOT NULL AND r.generating_at > now() - interval '2 minutes' THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::integer, NULL::text;
    RETURN;
  END IF;

  UPDATE public.invite_narrations
  SET script_hash = _hash,
      script = _script,
      chars = _chars,
      storage_path = CASE WHEN script_hash = _hash THEN storage_path ELSE NULL END,
      seconds = CASE WHEN script_hash = _hash THEN seconds ELSE NULL END,
      generating_at = now()
  WHERE event_id = _event_id;

  RETURN QUERY SELECT false, true, NULL::text, NULL::integer, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invite_narration(text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_invite_narration(text, text, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_invite_narration(
  _event_id text,
  _hash text,
  _path text,
  _seconds integer,
  _voice_id text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.invite_narrations
  SET storage_path = _path,
      seconds = _seconds,
      voice_id = _voice_id,
      generating_at = NULL
  WHERE event_id = _event_id AND script_hash = _hash;
$$;

REVOKE ALL ON FUNCTION public.finish_invite_narration(text, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_invite_narration(text, text, text, integer, text) TO service_role;