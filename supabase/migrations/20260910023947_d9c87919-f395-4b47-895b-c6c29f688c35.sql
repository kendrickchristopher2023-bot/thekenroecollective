DROP FUNCTION public.claim_invite_narration(text, text, text, integer);
DROP FUNCTION public.claim_invite_narration(text, text, text, integer, text);

CREATE FUNCTION public.claim_invite_narration(
  _event_id text,
  _hash text,
  _script text,
  _chars integer,
  _voice_id text
)
RETURNS TABLE(ready boolean, should_generate boolean, storage_path text, seconds integer, voice_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.invite_narrations%ROWTYPE;
BEGIN
  SELECT * INTO r
  FROM public.invite_narrations
  WHERE event_id = _event_id
  FOR UPDATE;

  IF FOUND
     AND r.script_hash = _hash
     AND r.voice_id = _voice_id
     AND r.storage_path IS NOT NULL THEN
    RETURN QUERY SELECT true, false, r.storage_path, r.seconds, r.voice_id;
    RETURN;
  END IF;

  IF FOUND
     AND r.script_hash = _hash
     AND r.voice_id = _voice_id
     AND r.generating_at IS NOT NULL
     AND r.generating_at > now() - interval '2 minutes' THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::integer, r.voice_id;
    RETURN;
  END IF;

  INSERT INTO public.invite_narrations (
    event_id, script_hash, script, chars, storage_path, seconds, voice_id, generating_at
  ) VALUES (
    _event_id, _hash, _script, _chars, NULL, NULL, _voice_id, now()
  )
  ON CONFLICT (event_id) DO UPDATE SET
    script_hash = EXCLUDED.script_hash,
    script = EXCLUDED.script,
    chars = EXCLUDED.chars,
    storage_path = NULL,
    seconds = NULL,
    voice_id = EXCLUDED.voice_id,
    generating_at = now(),
    updated_at = now();

  RETURN QUERY SELECT false, true, NULL::text, NULL::integer, _voice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invite_narration(text, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invite_narration(text, text, text, integer, text) TO service_role;