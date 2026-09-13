# Multi-event series ("occasion" grouping) — investigation only

Status: no code written. This is the requested plan/decision document.

## The need

A reunion weekend, a wedding weekend, or a conference is one occasion made of
several gatherings (Friday meet-and-greet, Saturday banquet, Sunday brunch).
Today each of those must be created as a separate event with its own guest list,
its own invitation, and its own RSVP. Hosts re-import the same 200 people three
times and guests get three unrelated links.

## Proposed shape

Add an `occasion` as a thin grouping layer above events, never a replacement for
them. Every existing event stays a first-class row, so nothing regresses for
single-event hosts.

```text
occasion (The Kendrick Family Reunion 2027)
  guest roster  (one list, the source of truth)
    +-- event: Friday meet-and-greet   (invited: all)
    +-- event: Saturday banquet        (invited: all, paid)
    +-- event: Sunday brunch           (invited: subset)
```

### Data model

- New table `occasions`: `id`, `user_id`, `title`, `slug`, `data jsonb`,
  `archived_at`. Same RLS/GRANT shape as `events` (owner + `event_members` style
  collaborator access), so co-host rules carry over unchanged.
- `events` gains `occasion_id uuid null references occasions(id)`. Null means a
  standalone event, which is every event that exists today.
- Guest roster lives on the occasion. Each event keeps a per-event invite/RSVP
  record keyed by roster entry, rather than duplicating the guest.

### RSVP cascade

One guest link per occasion (`/o/<slug>?g=<token>`). The guest sees the sub-events
they are invited to and answers each one, with a single "yes to everything"
shortcut. Cascade rule: answering the occasion sets every sub-event the guest is
invited to; answering a sub-event overrides only that one. Headcount, capacity,
fare, and potluck stay per sub-event, because a banquet cap is not a brunch cap.

### Money

Charges stay per sub-event using the existing `party-fare.ts` contract. A future
"weekend pass" bundle price is deliberately out of scope for the first pass.

## Effort and risk

- Migration plus RLS/grants: small, additive.
- Occasion CRUD, roster sharing, per-event invite records: the bulk of the work.
- Guest-facing occasion page and cascade logic: medium, needs its own test pass.
- Reports, exports, seating, and check-in all need an occasion-level rollup view
  in addition to the existing per-event views.

Realistically a multi-day build, not a polish item. Highest-risk area is the
guest roster move: every existing surface reads guests off the event JSON today,
so the compatibility path is that an event with `occasion_id = null` keeps
reading its own guests exactly as it does now.

## Recommendation

Ship in two stages when greenlit:

1. Stage 1 (safe, useful alone): occasion grouping plus roster copy-forward, so
   a host creates the occasion once and each sub-event is seeded from the shared
   roster. No cascade, no shared guest link. Reuses every existing screen.
2. Stage 2: single occasion link with cascading RSVP and occasion-level reports.

Stage 1 removes the triple re-import pain, which is the actual complaint, at a
fraction of Stage 2's risk.
