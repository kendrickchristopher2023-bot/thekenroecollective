CREATE OR REPLACE FUNCTION public.public_set_checkin(_event_id text, _guest_id text, _checked_in boolean, _note text DEFAULT NULL::text, _share_token text DEFAULT NULL::text, _heads integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  tok text;
  owner uuid;
  filtered jsonb;
  heads int;
begin
  select share_token, user_id into tok, owner
  from public.events where id = _event_id for update;

  if tok is null and owner is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if not (auth.uid() is not null and auth.uid() = owner) then
    if tok is null or _share_token is null or _share_token <> tok then
      return jsonb_build_object('ok', false, 'reason', 'forbidden');
    end if;
  end if;

  select coalesce(jsonb_agg(c), '[]'::jsonb)
  into filtered
  from public.events, jsonb_array_elements(coalesce(data->'checkIns', '[]'::jsonb)) as c
  where events.id = _event_id and c->>'guestId' <> _guest_id;

  if _checked_in then
    heads := greatest(1, least(60, coalesce(_heads, 1)));
    filtered := coalesce(filtered, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('guestId', _guest_id, 'at', now(), 'note', _note, 'heads', heads)
    );
  end if;

  update public.events
  set data = jsonb_set(data, '{checkIns}', coalesce(filtered, '[]'::jsonb))
  where id = _event_id;

  return jsonb_build_object('ok', true);
end;
$function$;

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
declare
  tok text;
  owner uuid;
  gid text;
  nm text;
  a int;
  c int;
  guest jsonb;
begin
  select share_token, user_id into tok, owner
  from public.events where id = _event_id for update;

  if tok is null and owner is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if not (auth.uid() is not null and auth.uid() = owner) then
    if tok is null or _share_token is null or _share_token <> tok then
      return jsonb_build_object('ok', false, 'reason', 'forbidden');
    end if;
  end if;

  nm := btrim(coalesce(_name, ''));
  if nm = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;
  nm := left(nm, 80);

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

  update public.events
  set data = jsonb_set(
    jsonb_set(data, '{guests}', coalesce(data->'guests', '[]'::jsonb) || jsonb_build_array(guest)),
    '{checkIns}',
    coalesce(data->'checkIns', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('guestId', gid, 'at', now(), 'heads', a + c, 'note', 'walk-in')
    )
  )
  where id = _event_id;

  return jsonb_build_object('ok', true, 'guestId', gid, 'heads', a + c);
end;
$function$;

REVOKE ALL ON FUNCTION public.public_add_walkin(text, text, text, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_add_walkin(text, text, text, integer, integer, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_set_checkin(text, text, boolean, text, text, integer) TO anon, authenticated, service_role;