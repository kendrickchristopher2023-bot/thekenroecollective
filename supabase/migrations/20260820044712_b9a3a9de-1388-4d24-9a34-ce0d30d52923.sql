-- Shared headcount helper: single source of truth for "confirmed attendees".
CREATE OR REPLACE FUNCTION public.event_confirmed_headcount(_data jsonb, _exclude_guest text DEFAULT NULL)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(
      COALESCE(NULLIF(g->>'adults','')::int, 1)
    + COALESCE(NULLIF(g->>'children','')::int, 0)
    + CASE WHEN jsonb_typeof(g->'plusOnes') = 'array' THEN jsonb_array_length(g->'plusOnes') ELSE 0 END
  ), 0)::int
  FROM jsonb_array_elements(COALESCE(_data->'guests', '[]'::jsonb)) AS g
  WHERE g->>'status' = 'yes'
    AND (_exclude_guest IS NULL OR g->>'id' IS DISTINCT FROM _exclude_guest);
$$;

GRANT EXECUTE ON FUNCTION public.event_confirmed_headcount(jsonb, text) TO anon, authenticated, service_role;

-- Guest RSVP write path: row-locked, capacity-enforcing, plus-one clamped.
DROP FUNCTION IF EXISTS public.public_update_guest(text, text, jsonb);

CREATE OR REPLACE FUNCTION public.public_update_guest(_event_id text, _guest_id text, _patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  ev jsonb;
  guest_row jsonb;
  merged jsonb;
  allowed int;
  cap int;
  waitlist boolean;
  others int;
  party int;
  outcome text := 'ok';
begin
  -- Lock the event row: concurrent RSVPs serialise here, so the capacity check
  -- below cannot be raced and one guest's write cannot clobber another's.
  select data into ev from public.events where id = _event_id for update;
  if ev is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select value into guest_row
  from jsonb_array_elements(coalesce(ev->'guests', '[]'::jsonb))
  where value->>'id' = _guest_id
  limit 1;

  if guest_row is null then
    return jsonb_build_object('ok', false, 'reason', 'guest_not_found');
  end if;

  merged := guest_row || _patch;

  -- Server-side plus-ones clamp: never more than the host allows, never > 20.
  allowed := least(20, greatest(0, coalesce(nullif(ev->>'plusOnesAllowed','')::int, 0)));
  if jsonb_typeof(merged->'plusOnes') = 'array'
     and jsonb_array_length(merged->'plusOnes') > allowed then
    merged := jsonb_set(
      merged,
      '{plusOnes}',
      (select coalesce(jsonb_agg(p.value), '[]'::jsonb)
         from (select value from jsonb_array_elements(merged->'plusOnes') limit allowed) p)
    );
  end if;

  cap := coalesce(nullif(ev->>'capacity','')::int, 0);
  waitlist := coalesce((ev->>'waitlistEnabled')::boolean, false);

  if cap > 0 and merged->>'status' = 'yes' then
    others := public.event_confirmed_headcount(ev, _guest_id);
    party := coalesce(nullif(merged->>'adults','')::int, 1)
           + coalesce(nullif(merged->>'children','')::int, 0)
           + case when jsonb_typeof(merged->'plusOnes') = 'array'
                  then jsonb_array_length(merged->'plusOnes') else 0 end;

    if others + party > cap then
      if waitlist then
        merged := jsonb_set(merged, '{status}', '"waitlisted"');
        outcome := 'waitlisted';
      else
        return jsonb_build_object(
          'ok', false,
          'reason', 'over_capacity',
          'capacity', cap,
          'remaining', greatest(0, cap - others)
        );
      end if;
    end if;
  end if;

  update public.events
  set data = jsonb_set(
    data,
    '{guests}',
    (select coalesce(jsonb_agg(case when value->>'id' = _guest_id then merged else value end), '[]'::jsonb)
       from jsonb_array_elements(coalesce(data->'guests', '[]'::jsonb)))
  )
  where id = _event_id;

  return jsonb_build_object('ok', true, 'outcome', outcome, 'status', merged->>'status');
end;
$$;

GRANT EXECUTE ON FUNCTION public.public_update_guest(text, text, jsonb) TO anon, authenticated, service_role;

-- Door check-in: now requires the event's share/door token.
DROP FUNCTION IF EXISTS public.public_set_checkin(text, text, boolean, text);

CREATE OR REPLACE FUNCTION public.public_set_checkin(
  _event_id text,
  _guest_id text,
  _checked_in boolean,
  _note text DEFAULT NULL,
  _share_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  tok text;
  owner uuid;
  filtered jsonb;
begin
  select share_token, user_id into tok, owner
  from public.events where id = _event_id for update;

  if tok is null and owner is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Authorisation: the event owner (signed in), or a caller presenting the
  -- event's door share token. Nothing else may write attendance.
  if not (auth.uid() is not null and auth.uid() = owner) then
    if tok is null or _share_token is null or _share_token <> tok then
      return jsonb_build_object('ok', false, 'reason', 'forbidden');
    end if;
  end if;

  -- Drop any existing entry for this guest first, so a duplicate scan is
  -- idempotent rather than creating a second arrival.
  select coalesce(jsonb_agg(c), '[]'::jsonb)
  into filtered
  from public.events, jsonb_array_elements(coalesce(data->'checkIns', '[]'::jsonb)) as c
  where events.id = _event_id and c->>'guestId' <> _guest_id;

  if _checked_in then
    filtered := coalesce(filtered, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('guestId', _guest_id, 'at', now(), 'note', _note)
    );
  end if;

  update public.events
  set data = jsonb_set(data, '{checkIns}', coalesce(filtered, '[]'::jsonb))
  where id = _event_id;

  return jsonb_build_object('ok', true);
end;
$$;

GRANT EXECUTE ON FUNCTION public.public_set_checkin(text, text, boolean, text, text) TO anon, authenticated, service_role;