-- CRITICAL FIX: guest-facing RSVP submission and door check-in only ever
-- wrote to a client-side local cache (events-store.ts's load()/save()),
-- which only pushes to Supabase via upsertEvent() — a requireSupabaseAuth
-- server function — when the CURRENT device has an authenticated session.
-- A genuinely anonymous guest's browser has no session, so their RSVP
-- click updated nothing beyond their own browser and was silently lost.
-- Confirmed empirically: submitted a real RSVP as an anonymous browser
-- session against a live event and the database value never changed.
--
-- These SECURITY DEFINER RPCs let an anonymous caller update ONLY the
-- specific guest's RSVP-shaped fields (never touching other guests, other
-- event fields, or anything requiring ownership) and manage check-in
-- entries, without needing a Supabase session at all.

create or replace function public.public_update_guest(_event_id text, _guest_id text, _patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  new_guests jsonb;
  found boolean;
begin
  select
    coalesce(jsonb_agg(case when g->>'id' = _guest_id then g || _patch else g end), '[]'::jsonb),
    bool_or(g->>'id' = _guest_id)
  into new_guests, found
  from public.events, jsonb_array_elements(coalesce(data->'guests', '[]'::jsonb)) as g
  where events.id = _event_id;

  if not coalesce(found, false) then
    return;
  end if;

  update public.events
  set data = jsonb_set(data, '{guests}', new_guests)
  where id = _event_id;
end;
$$;

grant execute on function public.public_update_guest(text, text, jsonb) to anon, authenticated;

create or replace function public.public_set_checkin(_event_id text, _guest_id text, _checked_in boolean, _note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  filtered jsonb;
  event_exists boolean;
begin
  select exists(select 1 from public.events where id = _event_id) into event_exists;
  if not event_exists then
    return;
  end if;

  select coalesce(jsonb_agg(c), '[]'::jsonb)
  into filtered
  from public.events, jsonb_array_elements(coalesce(data->'checkIns', '[]'::jsonb)) as c
  where events.id = _event_id and c->>'guestId' <> _guest_id;

  if _checked_in then
    filtered := filtered || jsonb_build_array(jsonb_build_object('guestId', _guest_id, 'at', now(), 'note', _note));
  end if;

  update public.events
  set data = jsonb_set(data, '{checkIns}', filtered)
  where id = _event_id;
end;
$$;

grant execute on function public.public_set_checkin(text, text, boolean, text) to anon, authenticated;
