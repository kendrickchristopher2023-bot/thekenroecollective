# What's left to complete

## Already shipped (verified this audit)

- Guest list search/filter/performance upgrade
- Admin/owner reporting upgrade (incl. 1,000-user truncation fix)
- Post-event host analytics (PostEventWrapUp + CSV export)
- Registry/gift-list link (host settings + invite page block, separate from gift fund)
- Co-host/collaborator access (event_members table, invite-by-email, cohost/viewer roles, server-side access checks)
- Duplicate detection on manual guest add (fuzzy match prompt)
- Collapsed guest rows by default (Details toggle, Expand all)
- Per-user namespaced event cache (migration from shared key)
- Reconciliation child-rate fix (party-fare.ts single source of truth)
- Invite frames & themes (FRAMES_ENABLED = true, color customization)
- Demo vendor notification leak fix (is_demo skip)

## Genuinely remaining, ordered by impact

### 1. Adult/child designation for named plus-ones — open
Right now every named plus-one is billed/counted as an adult. A per-person adult/child flag is needed across the invite page, events-store, party-fare, and payment-messaging. The Zod schema in events-sync.functions.ts must be widened or the flag gets stripped on save. Interim mitigation (a hint telling guests to count children in the KIDS counter) is live, but the real flag is the fix. Low risk, additive.

### 2. Co-host access matrix confirmation — needed before relying on it
Co-hosts were built, but the roadmap precondition ("access matrix confirmed by Christopher before building") was never formally signed off. Need to confirm: what a cohost vs. viewer can touch (guest list, check-in, payments, settings, delete), and whether door-staff is a separate role or folded into viewer. This is a decision, not code.

### 3. Multi-event series ("occasion" grouping) — investigate only, report plan
Not started. Question to resolve: shared guest list across sub-events, RSVP once cascading to the sub-events a guest is invited to. Roadmap asks for a plan only, no build yet.

### 4. Proportionality / mobile polish pass (dashboard, checkout, door check-in)
The invite page is verified at 390/768/1280/1920/2560. The event dashboard (two onboarding dialogs stack on phone; plain modal off-brand vs. Kenroe card), checkout, and door check-in still need the same pass. Same screenshot standard at all four widths.

### 5. Polish sweep — high-signal, small
- **Empty states:** several host panels show a bare table shell with no guidance when there's no data.
- **Skeleton loaders:** swap remaining spinners on /events, /studio, /projects, /vendors, media library, RFQ inbox.
- **Per-route head metadata:** 0 of 77 routes currently declare a `head()`. Every content route needs a unique title, description, og/twitter tags now that /gatherings and /workroom exist.
- **Accessibility (from a11y-priorities list, in order):** mobile bottom-nav text labels + 44x44 tap targets on icon-only buttons; plain-language confirm dialog helper wired to destructive actions; bigger inputs sweep (py-2 text-sm → py-3 text-base); first-run 3-step welcome; consolidate mobile floating widgets into one Help pill; global error boundary with plain-language buttons.

### 6. Seating chart depth — optional, scope separately
Currently table-level only. Individual seat assignment and a venue map would make it read as an Atelier-tier feature. Larger piece, worth its own plan.

## Recommended order

1. Co-host access matrix confirmation (decision, unblocks confident use)
2. Adult/child designation for named plus-ones (real billing accuracy)
3. Polish sweep: head metadata + empty states + skeletons (broad, visible)
4. Proportionality/mobile pass on dashboard, checkout, check-in
5. Accessibility items (mobile tap targets, confirm dialog, inputs)
6. Multi-event series investigation (plan only)
7. Seating chart depth (separate plan)

Each item published only after your go-ahead.
