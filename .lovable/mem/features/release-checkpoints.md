---
name: Release checkpoints
description: Known-good published build checkpoints (dates, contents) to revert back to if a later change breaks something
type: feature
---
# Known-good published checkpoints

## 2026-08-27 — timezone hardening + countdown restore + master reports + vendor RLS (commit 7a566f86 "Restored countdown on invites")
Treat this as the latest checkpoint. 329 unit tests passing across 52 files.

Included in this build (cumulative on top of the 2026-08-20 baseline, in ship order):
1. Timezone hardening: `src/lib/datetime.ts` is the single source of truth for all event date/time formatting. Resolves DST using the offset in effect ON the event date (two-pass Intl trick). In-person event times are NEVER converted to the viewer's zone; always labeled with the event's IANA zone. ESLint `no-restricted-syntax` rule blocks raw Date formatting outside `datetime.ts`. ~86 call sites migrated across 47 files.
2. Countdown timer restore on invites (`src/routes/invite.$eventId.tsx`): `countdownEnabled` now defaults to ON unless explicitly `!== false`, so older events get the timer back. Counts true remaining duration (viewer-independent) from `eventInstant(date, timezone)`. Degradation: "Happening now" for 4h after start, then "That's a wrap. Thank you for celebrating with us." No negative clocks.
3. Master Guest Report (`src/lib/master-guest-report.ts` + `src/components/master-guest-report.tsx`): unified headcount via `partyMemberCount` / `billableAdults` (verified Quinton Kendrick = 4). Clickable dashboard stat tiles filter the guest list via URL search params. Sub-reports for Dietary (caterer-ready totals), T-shirts, Non-responders (one-click reminders), Payments. CSV + landscape PDF (`src/lib/master-report-pdf.ts`) with check-off columns and repeated headers. Host-only access enforced server-side in `src/lib/host-report.functions.ts`.
4. Image focal repositioning (`src/lib/image-focal.ts` + `src/components/image-focal-control.tsx`): drag-to-reposition + zoom slider using URL hash fragments. 44px tap targets, keyboard fallback.
5. Vendor RLS fixes: `SECURITY DEFINER` helpers for RFQ/vendor profile actions, `friendlyDbError` to mask Postgres errors. `ad_placements` column-level security hardened (public SELECT on active ads; `stripe_subscription_id` / `review_notes` revoked).
6. Co-host sync fix: `maySyncEvent` in `src/lib/events-store.ts` now allows co-host status so co-host edits persist and events stay visible.
7. Slug-conflict save retry (`tests/unit/slug-conflict-save.test.ts`): save retries without the conflicting link and prompts for a new one instead of looping.
8. Social share hydration fix (`src/components/share-hub.tsx`): pre-filled composer no longer empty.
9. Guest lookup fuzzy matching (`src/lib/guest-lookup.ts`) + `event_guest_requests` moderation table + "contact host" fallback.
10. Invitation comments system (public/private, host moderation, tied to guest list) + admin `/dev-changelog` (technical logs) vs customer `/whats-new` (buyer-impacting only).
11. Email invite color/logo inheritance: templates use event colors + logo with `readableShade` contrast safeguards. Postcard email invitations enabled.
12. UX/accessibility pass: US spelling sweep, simplified one-line guest cards, read-only schedule on public invites, 44px tap targets, global 16px font, "Beginner vs Expert" UI mode, mobile check-in crowding fix.
13. Adult/child flags for plus-ones; `party-fare.ts` as billing source of truth; namespaced local event cache `kcc.events.v1.u.{userId}`; fuzzy duplicate detection + collapsible guest list rows.
14. `loadTier` 60s TTL cache fix; rolling creation cap (3 events/365 days) for Postcard users (`src/lib/rolling-event-cap.ts`).
15. Well Wishes send fix (email template allow-list) + `tests/unit/email-registry.test.tsx`.

Publish status at this checkpoint (last confirmed honest state):
- LIVE on thekenroecollective.com: Timezone date-rendering fix (v1), 5 correction emails for Tenia's dinner, vendor/ad RLS grants, email registration fix.
- PREVIEW ONLY (not yet live): Timezone hardening (lint guard + migrated call sites), Master Guest Report, countdown restore, image repositioning. Re-confirm publish status before relying on these in production.

Not touched in this build: mrsmkendrick@gmail.com's event data (preserved per instruction). Pending follow-ups: fold `src/lib/event-time.ts` into `datetime.ts`, full every-surface timezone audit list, end-to-end Well Wishes re-verification.

## 2026-08-20 — walk-ins + party-level check-in (commit a68f9dad "Built walk-in check-in flow")
Published to https://thekenroecollective.com. Prior known-good baseline.

Included and verified live in this build (cumulative, in ship order):
1. T-shirt sizes (Host+ per-event toggle, guest/host/admin entry, plus-ones, tally + CSV export, lock-sizes toggle).
2. Demo data reseed fix (`is_demo` flag + `demo_seed_tombstones`, so deleted production/demo events stay deleted through the 4:30 AM UTC cron).
3. Watermark / Photo Wall public-page fix (security-definer RPCs `get_event_public_entitlements`, `get_package_public_entitlements`; no anon grants on `event_addons` / `subscriptions`).
4. Capacity + door-token bundle: atomic `public_update_guest` (row lock, full-party headcount incl. plus-ones, waitlist overflow), server-side share-token verification in `public_set_checkin`, plus-ones ceiling 20, party counts clamped to 20 server-side, persistent over-capacity banner.
5. Vanity link / slug fix: `branded_slug_available` RPC, debounced availability check, dead "coming soon subdomain" copy removed.
6. Walk-ins + party-level check-in: `public_add_walkin` RPC (token-verified), `heads` on check-ins, `arrivedHeadcount` / `checkInSummary` helpers, door-page "Add walk-in", host panel split into Invited arrived / Walk-ins / Yet to arrive.

All 71 unit tests passing at that checkpoint.

## How to revert
Use the revert button on the relevant chat message, or the History tab, rather than hand-writing undo code.
