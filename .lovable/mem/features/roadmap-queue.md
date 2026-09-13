---
name: Roadmap queue (approved Aug 20 2026)
description: Approved build queue order and per-item scope: co-host access, multi-event series, post-event analytics, registry link
type: feature
---

Strict order, investigate-and-report before building each (except #4):

1. In flight: guest list search/filter/performance upgrade.
2. Admin/owner reporting upgrade (incl. 1,000-user truncation fix).
3. **Co-host / collaborator access** — build per approved plan: `event_members`
   (role enum editor|viewer), `event_invites`, security-definer helpers
   (`event_is_member`, `event_can_edit`), rewrite `events` RLS from
   `user_id = auth.uid()` to owner-or-member. Access matrix must be confirmed by
   Christopher before building.
4. **Multi-event series ("occasion" grouping)** — investigate only, report plan.
   Question: shared guest list across sub-events, RSVP once cascading to
   sub-events the guest is invited to.
5. Done: **Post-event host analytics** — `src/lib/post-event-analytics.ts` +
   `PostEventWrapUp` panel in the day-of toolkit: attendance vs expected heads,
   no-shows, walk-ins, needs logged, money position, CSV export.
6. **Registry/gift-list link** — build directly. External registry URL field on
   the event (Zola/Amazon/Target), separate from gift fund, shown on invite page
   alongside the gift-fund block when both enabled.

Confirm with Christopher before publishing each item.

## Deferred post-demo (logged Aug 23 2026, do not build before the demo)

7. **Duplicate detection on manual guest add** — bulk import already skips exact
   email/phone/name key matches (`guest-import.tsx`), but `addGuest` (single add,
   contacts picker, walk-in, guest self-add) appends with no check. Wanted: a
   "this looks like an existing guest, merge or add anyway?" prompt using fuzzy
   matching from `src/lib/guest-lookup.ts`. High value for reunions where several
   committee members enter the same relative.
8. **Collapse guest rows by default, click to expand** — at 200+ guests the fully
   expanded list is a wall. Collapsed row: name, RSVP, headcount, amount due.
   Touches the demo path, so not before the demo.
9. **Namespace the event cache by authenticated user id** — replace the shared
   `kcc.events.v1` cache key with a per-user key and migrate safely. The immediate
   ownership guard now purges foreign rows and queue entries, so defer this broader
   storage-layer change until after the demo.
