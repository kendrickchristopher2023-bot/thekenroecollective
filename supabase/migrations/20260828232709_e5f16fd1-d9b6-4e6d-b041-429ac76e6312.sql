DROP FUNCTION IF EXISTS public.public_set_checkin(text, text, boolean, text, text);

CREATE TABLE public.event_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  guest_id text,
  guest_name text,
  action text NOT NULL CHECK (action IN ('guest.checked_in', 'guest.checked_out', 'walkin.added')),
  actor_type text NOT NULL CHECK (actor_type IN ('authenticated_user', 'door_link')),
  actor_user_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.event_activity_log TO authenticated;
GRANT ALL ON public.event_activity_log TO service_role;

ALTER TABLE public.event_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins and owners can read event activity"
ON public.event_activity_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE INDEX event_activity_log_occurred_at_idx
ON public.event_activity_log (occurred_at DESC);

CREATE INDEX event_activity_log_event_time_idx
ON public.event_activity_log (event_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.public_set_checkin(
  _event_id text,
  _guest_id text,
  _checked_in boolean,
  _note text DEFAULT NULL::text,
  _share_token text DEFAULT NULL::text,
  _heads integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tok text;
  owner uuid;
  ev jsonb;
  guest_row jsonb;
  guest_name text;
  filtered jsonb;
  heads int;
  prior_checkin jsonb;
BEGIN
  SELECT share_token, user_id, data INTO tok, owner, ev
  FROM public.events WHERE id = _event_id FOR UPDATE;

  IF ev IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF NOT (auth.uid() IS NOT NULL AND auth.uid() = owner) THEN
    IF tok IS NULL OR _share_token IS NULL OR _share_token <> tok THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
    END IF;
  END IF;

  SELECT value INTO guest_row
  FROM jsonb_array_elements(coalesce(ev->'guests', '[]'::jsonb))
  WHERE value->>'id' = _guest_id
  LIMIT 1;

  IF guest_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'guest_not_found');
  END IF;

  guest_name := left(coalesce(guest_row->>'name', 'Guest'), 120);

  SELECT value INTO prior_checkin
  FROM jsonb_array_elements(coalesce(ev->'checkIns', '[]'::jsonb))
  WHERE value->>'guestId' = _guest_id
  LIMIT 1;

  SELECT coalesce(jsonb_agg(c), '[]'::jsonb)
  INTO filtered
  FROM jsonb_array_elements(coalesce(ev->'checkIns', '[]'::jsonb)) AS c
  WHERE c->>'guestId' <> _guest_id;

  IF _checked_in THEN
    heads := greatest(1, least(60, coalesce(_heads, 1)));
    filtered := coalesce(filtered, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('guestId', _guest_id, 'at', now(), 'note', _note, 'heads', heads)
    );
  ELSE
    heads := greatest(1, least(60, coalesce(nullif(prior_checkin->>'heads', '')::integer, _heads, 1)));
  END IF;

  UPDATE public.events
  SET data = jsonb_set(data, '{checkIns}', coalesce(filtered, '[]'::jsonb))
  WHERE id = _event_id;

  IF (_checked_in AND prior_checkin IS NULL) OR (NOT _checked_in AND prior_checkin IS NOT NULL) THEN
    INSERT INTO public.event_activity_log (
      event_id, guest_id, guest_name, action, actor_type, actor_user_id, details
    ) VALUES (
      _event_id,
      _guest_id,
      guest_name,
      CASE WHEN _checked_in THEN 'guest.checked_in' ELSE 'guest.checked_out' END,
      CASE WHEN auth.uid() IS NULL THEN 'door_link' ELSE 'authenticated_user' END,
      auth.uid(),
      jsonb_build_object('heads', heads, 'note', _note)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'checkedIn', _checked_in, 'heads', heads);
END;
$function$;

REVOKE ALL ON FUNCTION public.public_set_checkin(text, text, boolean, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_set_checkin(text, text, boolean, text, text, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_add_walkin(
  _event_id text,
  _name text,
  _share_token text DEFAULT NULL::text,
  _adults integer DEFAULT 1,
  _children integer DEFAULT 0,
  _note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tok text;
  owner uuid;
  ev jsonb;
  gid text;
  nm text;
  a int;
  c int;
  guest jsonb;
BEGIN
  SELECT share_token, user_id, data INTO tok, owner, ev
  FROM public.events WHERE id = _event_id FOR UPDATE;

  IF ev IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF NOT (auth.uid() IS NOT NULL AND auth.uid() = owner) THEN
    IF tok IS NULL OR _share_token IS NULL OR _share_token <> tok THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
    END IF;
  END IF;

  nm := left(btrim(coalesce(_name, '')), 80);
  IF nm = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_name');
  END IF;

  a := greatest(1, least(20, coalesce(_adults, 1)));
  c := greatest(0, least(20, coalesce(_children, 0)));
  gid := 'walkin-' || replace(gen_random_uuid()::text, '-', '');

  guest := jsonb_build_object(
    'id', gid,
    'name', nm,
    'email', '',
    'phone', '',
    'status', 'yes',
    'adults', a,
    'children', c,
    'source', 'walkin',
    'dietary', left(coalesce(_note, ''), 200)
  );

  UPDATE public.events
  SET data = jsonb_set(
    jsonb_set(data, '{guests}', coalesce(data->'guests', '[]'::jsonb) || jsonb_build_array(guest)),
    '{checkIns}',
    coalesce(data->'checkIns', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('guestId', gid, 'at', now(), 'heads', a + c, 'note', 'walk-in')
    )
  )
  WHERE id = _event_id;

  INSERT INTO public.event_activity_log (
    event_id, guest_id, guest_name, action, actor_type, actor_user_id, details
  ) VALUES (
    _event_id,
    gid,
    nm,
    'walkin.added',
    CASE WHEN auth.uid() IS NULL THEN 'door_link' ELSE 'authenticated_user' END,
    auth.uid(),
    jsonb_build_object('heads', a + c, 'adults', a, 'children', c, 'note', _note)
  );

  RETURN jsonb_build_object('ok', true, 'guestId', gid, 'heads', a + c);
END;
$function$;

REVOKE ALL ON FUNCTION public.public_add_walkin(text, text, text, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_add_walkin(text, text, text, integer, integer, text) TO anon, authenticated, service_role;