# Demo hardening: communications-only critical path

Scope is the narrowed offering: create event, customize invitation, import 200+ guests, send invitations, guests RSVP, send reminders and announcements, read guest list and headcount reports. Money, shirts, potluck, catering and day-of are out of scope for tomorrow and stay untouched.

Nothing publishes without your explicit confirmation.

## Step 1 - RSVP sweep at 212-guest scale (verify, then fix)

Run the guest path against the seeded `demo-reunion-200` event on desktop and mobile widths:

- Open the invite by direct link and by "find your name" lookup, including the ambiguous-name cases.
- Submit: yes, no, maybe; with plus-ones; with dietary notes; with a long free-text note.
- Re-submit as the same guest to confirm an RSVP edit updates rather than duplicates.
- Confirm the host guest list and headcount reflect each submission immediately (realtime), and that the headcount math stays Adults + Children + Plus-ones everywhere.

Anything that errors, silently drops a field, or double-counts gets fixed in this step.

## Step 2 - Send paths sweep

- Invitation send to a batch at scale: confirm queueing, per-recipient logging, no duplicate sends on a second click, and clear success or partial-failure feedback.
- Reminders: confirm the reminder window logic picks the right recipients (not yet RSVP'd vs attending) and that opt-outs and suppressed addresses are skipped.
- Announcements: confirm host send, guest visibility on the invite page, and that a failed recipient does not abort the whole batch.

## Step 3 - Reports read-back

- Guest list report and headcount report at 212 rows: correct totals, no truncation, CSV export opens cleanly.
- Confirm no crash from the profiles email lookup path used by the report pages.

## Step 4 - Demo-safety guardrails

- Confirm cookie notice, first-run tour and feedback prompts cannot overlay the invite or the wizard during the demo.
- Confirm `sm7eduqe` (the live customer event) is untouched by every change in this plan; all test writes stay on `demo-reunion-200`.

## Logged, not fixed today

- Comp grants write `environment='live'` while the client filters on the preview environment, so comped hosts see no entitlement in preview. Real bug, affects future comped customers.
- Photo Wall is an add-on in `pricing_tiers` but the docs describe it as a Host tier feature. Docs fix.

## Technical notes

- Verification is Playwright against localhost plus anon-key reads for entitlement and report checks; no live-tenant writes.
- Likely fix surfaces: `src/lib/events-sync.functions.ts`, `src/lib/events-invites.functions.ts`, `src/lib/announcements.functions.ts`, `src/lib/reminder-window.ts`, `src/lib/guest-lookup.ts`, `src/routes/invite.$eventId.tsx`, `src/routes/events.$eventId.index.tsx`.
- Each fix lands with a unit test where the logic is pure (headcount, reminder window, lookup disambiguation).
- I report findings after Step 1 and Step 2 before touching anything beyond them.
