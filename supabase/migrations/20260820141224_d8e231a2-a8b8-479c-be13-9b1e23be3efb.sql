CREATE OR REPLACE FUNCTION public.public_update_guest(_event_id text, _guest_id text, _patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Server-side party-size clamp, mirroring MAX_PLUS_ONES in the app: one guest
  -- row may never record more than 20 adults, kids or pets. Bigger groups are
  -- meant to be split into separate guest rows.
  if merged ? 'adults' then
    merged := jsonb_set(merged, '{adults}',
      to_jsonb(least(20, greatest(0, coalesce(nullif(merged->>'adults','')::int, 0)))));
  end if;
  if merged ? 'children' then
    merged := jsonb_set(merged, '{children}',
      to_jsonb(least(20, greatest(0, coalesce(nullif(merged->>'children','')::int, 0)))));
  end if;
  if merged ? 'pets' then
    merged := jsonb_set(merged, '{pets}',
      to_jsonb(least(20, greatest(0, coalesce(nullif(merged->>'pets','')::int, 0)))));
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
$function$;