# What's left, and what I'd do next to make this feel finished

Everything in the recent queue is shipped: capacity + token security, vanity slugs, walk-ins and party check-in, payment tracking with real automated reminders, guest list search/filter, admin and owner reporting with the 1,000-row fix, headcount clamping, pricing and pets fixes, invite proportionality, and the host logo on the invite.

Below is what is genuinely still open, ordered by how much a real host or guest notices it.

## 1. Invite frames and event themes (proposed, never built) - build it

The "Editorial Frames" design was delivered as a proposal only. There is no `event-themes.ts` and no frame renderer in the project today. This is the single biggest visual upgrade left: right now every invite looks identical regardless of occasion.

Build: a curated set of hand-authored SVG frames (celebrations, outdoor, sports, community, food, nightlife), a theme picker in event settings, full four-edge frames on desktop that degrade to top/bottom bands plus a crest under 640px, and print-safe edges for the PDF export. Gated at Whisper+.

## 2. Co-hosts and collaborators (proposed, never built) - build it (make it only available on host and atelier)

Events are still single-owner: there is no `event_members` table or any reference to one in the codebase. Any host with a partner, planner, or sibling helping out has to share a login. This is the most-requested kind of gap in a real events product.

Build: `event_members` (owner, co-host, door staff) with RLS and grants, an invite-by-email flow, role-scoped access to guest list, check-in, and payments, and an audit line for who changed what.

## 3. Demo vendor notifications leaking into the owner inbox - build it

The nightly demo seed already marks its rows `is_demo`, but owner notifications for "New vendor profile" still fire from those seeded rows. Small fix, but it makes the owner console look untrustworthy.

Build: skip notification creation for `is_demo` rows, and clear the existing duplicate notifications.

## 4. Finish the proportionality pass beyond the invite - do it

The invite page is done and verified at 390 / 768 / 1280 / 1920 / 2560. Still to pass: event dashboard (two onboarding dialogs stack on phone, and the plain modal is off-brand next to the Kenroe card), checkout, and door check-in. Same standard, same screenshot verification at all four widths.

## 5. Seating chart depth - do it last

Currently a single 1,684-line table-level tool: it groups guests to tables but has no individual seat assignment and no venue map. For an Atelier-tier feature this reads thin. Optional, larger piece of work, worth scoping separately.

## 6. Polish sweep (small, high-signal) - finish it

- Empty states: several host panels show a bare table shell with no guidance when there is no data yet.
- Loading states: swap remaining spinners for skeletons matching the final layout so pages stop jumping.
- Per-route head metadata audit across every content route (title, description, og, twitter) now that `/gatherings` and `/workroom` exist.
- Accessibility notes from the pricing/pets pass are still open: focus rings, labels on the attendee counters, contrast on the velvet-on-paper pairings.

## Suggested order - this works

1. Demo notification fix (quick, visible in your own console)
2. Proportionality pass on dashboard, checkout, check-in
3. Polish sweep (empty states, skeletons, metadata, accessibility)
4. Invite frames and themes
5. Co-hosts and collaborators
6. Seating chart depth, scoped separately

## Technical notes

- Frames: new `src/lib/event-themes.ts` for the taxonomy, frame SVGs as components alongside `src/components/decor.tsx`, new `inviteFrame` field on `KEvent` (additive, no migration risk to existing events), tier gate reusing the existing entitlements RPC path.
- Co-hosts: new table needs both RLS policies and explicit GRANTs in the same migration, plus a `has_event_role` security-definer function so policies don't recurse. Server functions move from "is this the owner" to "does this user hold a role on this event".
- Demo notifications: filter at the point the notification row is created, not at read time, so the owner inbox stays clean historically.

build it and see my notes above