DROP FUNCTION IF EXISTS public.claim_manual_schedule_send(uuid,uuid,uuid,text,uuid,timestamptz,text,text,text);
CREATE FUNCTION public.claim_manual_schedule_send(
  _manual_send_id uuid, _occurrence_id uuid, _person_id uuid, _channel text,
  _owner uuid, _due_at timestamptz, _status text, _subject text, _body text
) RETURNS TABLE(send_id uuid, is_new boolean, prior_at timestamptz, prior_status text, prior_error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('manual:' || _occurrence_id::text || ':' || _person_id::text || ':' || _channel));
  SELECT id, created_at, status, error INTO r FROM public.schedule_reminder_sends
    WHERE kind = 'manual' AND manual_send_id = _manual_send_id AND person_id = _person_id AND channel = _channel;
  IF FOUND THEN RETURN QUERY SELECT r.id, false, r.created_at, r.status, r.error; RETURN; END IF;
  -- Any manual attempt in the last 10 minutes counts, skipped ones included,
  -- so a second tab never adds a row. Only a real failure may be retried.
  SELECT id, created_at, status, error INTO r FROM public.schedule_reminder_sends
    WHERE kind = 'manual' AND occurrence_id = _occurrence_id AND person_id = _person_id AND channel = _channel
      AND created_at > now() - interval '10 minutes'
      AND status <> 'failed'
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN QUERY SELECT r.id, false, r.created_at, r.status, r.error; RETURN; END IF;
  RETURN QUERY INSERT INTO public.schedule_reminder_sends
    (occurrence_id, person_id, step_id, channel, owner_user_id, due_at, status, kind, manual_send_id, subject, body)
    VALUES (_occurrence_id, _person_id, NULL, _channel, _owner, _due_at, _status, 'manual', _manual_send_id, _subject, _body)
    RETURNING id, true, created_at, status, error;
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_manual_schedule_send(uuid,uuid,uuid,text,uuid,timestamptz,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_manual_schedule_send(uuid,uuid,uuid,text,uuid,timestamptz,text,text,text) TO service_role;