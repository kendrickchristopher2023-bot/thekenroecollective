# Hide demo data from production reports

## What's actually happening

There is no hard-coded fake data left in the app. The demo environment is not a
separate deployment — it is the same app and the **same database**, served on a
demo hostname. The demo host account owns three seeded events:

- The Harbourlight Autumn Gala
- Amara & Julien
- Long Table Supper No. 6
- plus one guest-created demo event ("Ann's Birthday Celebration")

Because production and demo share one database, the owner console (events
dashboard, analytics/reports, revenue, contacts) counts those demo-owned rows.
That is the "fake events and report data" showing on production.

There is also one real leftover test record from earlier QA: an event titled
"QA Test Gathering" owned by the `qa-aiart` test account.

No users will be removed from production or demo.

## The fix

Scope every owner/admin reporting surface to the environment it is viewed from:

1. On the production hostname, exclude all rows owned by the demo host account
   from owner-facing lists and metrics.
2. On the demo hostname, show only the demo account's data (so the demo looks
   populated and self-contained).
3. Real customer data is never touched or hidden.

Surfaces covered:

- Owner events dashboard (`/owner-events`)
- Owner analytics snapshot and contacts snapshot (reports/date-range tabs)
- Owner revenue tab (subscriptions, vendors, RFQs, ad placements)
- Recent updates report
- Users tab: the demo account stays listed and visible (it is a real login),
  but is flagged as "Demo" and excluded from aggregate tier/user counts.

## Leftover QA record

"QA Test Gathering" is a genuine test event, not demo seed data. Recommended:
archive it (reversible) rather than delete, so production reports are clean.
The `qa-aiart` account itself stays.

## Technical notes

- New `src/lib/demo-accounts.server.ts`: resolves the demo host user id once
  (by looking up `DEMO_ACCOUNT_EMAIL` through the admin client, memoised per
  request) and exposes a helper returning `{ excludeUserIds, onlyUserIds }`
  based on `isDemoRequest()`.
- `src/lib/events-admin.functions.ts` (`listAllEventsAdmin`): apply
  `.neq("user_id", demoId)` in production, `.eq("user_id", demoId)` in demo.
- Migration: add an optional `_exclude_user_id uuid default null` /
  `_only_user_id uuid default null` argument to `owner_analytics_snapshot` and
  `owner_contacts_snapshot`, filtering the event/guest/contact aggregates by it.
  Existing signatures stay so nothing breaks mid-deploy.
- `src/lib/owner-analytics.functions.ts`: pass the resolved ids into the RPCs.
- `src/lib/owner-revenue.functions.ts`: filter the subscription/vendor/RFQ/ad
  queries by owner id where the table has one.
- `src/components/admin/owner-users-panel.tsx`: add a small "Demo" badge for the
  demo account row; exclude it from the summary counts.
- Data change (separate, with approval): set `archived_at` on the single
  `QA Test Gathering` event row. No deletes, no user changes.

## Verification

Sign in as an owner on the production preview and confirm the events dashboard
and every report tab show zero demo events; then load the demo host and confirm
the seeded demo events and metrics still appear there.
