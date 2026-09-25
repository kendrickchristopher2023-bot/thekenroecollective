# Schedules: recurring calls and events with email and text reminders

A standalone page where a host sets up a repeating call once (for example "Kendrick Family Reunion call, 1st Sunday of every month, 7:00 PM EDT"), adds people, and reminders go out by email and text automatically until an end date, or forever.

## What I checked before writing this

- Contacts already exist with `owner_user_id`, `email_norm`, `phone_norm` and unique indexes per owner. Note: `phone_norm` keeps a leading `+`, so `+14045550100` and `4045550100` are stored as different people. That is the same mismatch `src/lib/phone-keys.ts` was written to fix. Import must write one canonical E.164 form and dedupe using all forms.
- `sms_outbox`, `sms_consent_log`, the Twilio drain (`/api/public/hooks/sms-outbox-drain`) and the email sender (`enqueueTransactionalEmailServer`) exist and already carry the demo guard.
- Correction to the request: Twilio status callbacks are already on. The drain sets `StatusCallback` on every send, and `/api/public/hooks/sms-status-webhook` verifies the Twilio signature and writes delivered / undelivered / failed plus the error code. If rows still all say "sent", the cause is unconfirmed: the webhook URL may point at the wrong host, or the callbacks are being rejected. Phase 2 starts by checking real rows and webhook logs, not by building the callback again.
- A day-before/day-of reminder engine for events already exists (`event_reminder_sends` idempotency table, `src/lib/reminder-schedule.ts` for event-local time and daylight saving). Schedules will reuse its time helpers, not copy them.
- Not yet verified: whether the tier lives in `profiles.tier` or is derived from entitlements (`meEntitlements`). Step 1 of the build confirms this and the gate uses whichever the checkout actually writes. If both exist and disagree, the entitlement source wins.

## Phases (slightly re-split)

1. **Core**: schedules, recurrence, exceptions, people (manual + contacts/groups), reminder plan, templates, calendar links, cron engine, consent and quiet hours, daily cap, demo guard. No import yet.
2. **Import + replies**: file/image/PDF/paste import with review table; "I'll be there / Can't make it" links; per-occurrence delivery report (after diagnosing the callback issue).
3. **Reuse**: attach to Projects, generic API for the Booking app.

Reason for moving import to phase 2: it is the riskiest and costliest piece (AI, uploads, private bucket), and phase 1 is already useful with manual entry and existing contacts. If you need import in phase 1 for the reunion, say so and I will keep your split.

## Who can use it

- Allowed: owners (existing owner check, server-side) and users on Host or Atelier.
- One SQL function `can_use_schedules(uid)` (security definer) used by both RLS insert policies and every server function. UI hiding is cosmetic only.
- Downgrade: existing schedules stay visible and editable, but reminders pause and the page explains why. Nothing is deleted. (Open question: confirm you want pause, not keep sending.)

## Data model (new tables)

```text
schedules
  id, owner_user_id, title, kind (call|meeting|event), description,
  join_url, dial_in, dial_pin, location,
  start_local (timestamp without tz, wall clock), timezone (IANA),
  duration_minutes, rrule (RFC 5545 text, no DTSTART inside),
  ends_kind (never|on_date|count), until_local, count,
  source_type (null|event|project|booking), source_id,
  status (active|paused|ended), is_demo, created_at, updated_at

schedule_exceptions
  id, schedule_id, original_local (the occurrence being changed),
  action (skip|move), new_start_local, new_duration, note

schedule_splits  (not a table: "this and all future" ends the old series
  with UNTIL and creates a new schedules row with parent_schedule_id)

schedule_people
  id, schedule_id, contact_id, channel (email|sms|both),
  paused (bool), removed_at, first_sms_sent_at, rsvp_token (random 32 bytes)

schedule_reminder_steps
  id, schedule_id, offset_minutes (negative = before), channel,
  template_id, is_starting_now (bool), position

schedule_templates
  id, owner_user_id, channel, subject, body (merge fields)

schedule_occurrences   (materialized, rolling window)
  id, schedule_id, occurrence_local, starts_at (utc instant), ends_at,
  status (scheduled|skipped|moved|cancelled)
  unique (schedule_id, occurrence_local)

schedule_reminder_sends   (idempotency + delivery report)
  id, occurrence_id, person_id, step_id, channel,
  due_at, status (pending|queued|sent|delivered|failed|blocked|held),
  sms_outbox_id, email_message_id, error, sent_at
  unique (occurrence_id, person_id, step_id, channel)

schedule_rsvps   (phase 2)
  id, occurrence_id, person_id, answer (yes|no), answered_at

contact_imports   (phase 2)
  id, owner_user_id, storage_path, status, row_count, cost_estimate, created_at
```

Built for reuse: the Booking app creates a `schedules` row with `rrule = null`, `ends_kind = count, count = 1`, `source_type = 'booking'`, one person, and the default steps. Same engine, no new code.

## Recurrence

- One-time, daily, weekly with weekdays, monthly by date or position (1st Sunday, last Friday via `BYDAY=1SU` / `-1FR`), quarterly (`MONTHLY;INTERVAL=3`), yearly, custom intervals.
- Library: `rrule` (pure JavaScript, works in the server runtime). I expand the rule in "floating" wall-clock time, then convert each result to an instant with the existing `eventInstant(stamp, timezone)`. This is what keeps 7:00 PM at 7:00 PM across daylight saving.
- Hourly: I recommend leaving it out. It is simple for the rule itself, but it multiplies occurrences and texts (24 a day per person), breaks the "1 day before" reminder logic, and invites cost accidents. Minimum interval: daily.
- Edits like Outlook: "This one" writes an exception. "This and all future" splits the series. "All" edits the row and regenerates future occurrences, keeping exceptions whose date still exists in the rule.
- Edge case: "the 31st" in months without a 31st. RFC 5545 skips those months. The form will warn and offer "last day of the month" instead.

## Engine and cron

- **Materialize ahead, rolling 90 days**, recomputed on every schedule edit and topped up nightly. Why: the delivery report, RSVPs and idempotency keys all need a real row to point at; skip/move exceptions are simple row updates; and the 5-minute tick only reads a small indexed table instead of expanding every rule. Open-ended series work forever because the nightly top-up always extends the window.
- **Tick every 5 minutes**: `POST /api/public/hooks/schedule-reminders`, protected by `verifyCronSecret` (same `x-cron-secret` as the other hooks). It:
  1. finds occurrences with a step due in the last 30 minutes that has no send row yet,
  2. inserts `schedule_reminder_sends` with `on conflict do nothing` (the unique key makes retries and overlapping ticks safe),
  3. applies filters (removed, paused, email opt-out, SMS opt-out via `phoneKeys`, quiet hours, daily cap, demo),
  4. hands texts to `sms_outbox` and emails to `enqueueTransactionalEmailServer`. No second sender.
- Missed ticks: a step more than 30 minutes late is marked `failed: missed_window` instead of sending a stale "starting now".
- **Quiet hours** 9 PM to 8 AM in the schedule's time zone: the text moves to 8:00 AM, and if that would be after the call starts it moves to 8:59 PM the evening before. The "starting now" text is exempt. (Your rule. Note: a 7 AM call's 1-hour reminder moves to 8:59 PM the night before.)
- **Daily cap**: default 200 texts per owner per day, owners exempt or higher. Over-cap sends are marked `held` and shown on the page with a clear reason. (Open question: the number.)
- **Important**: the engine only runs once published, since pg_cron calls the published app. Preview testing will use a manual "run now" button restricted to owners.

## Messages

- Merge fields: `{first_name}`, `{title}`, `{when}` (e.g. "Sun, Oct 4 at 7:00 PM EDT"), `{join}`, `{calendar}`, `{rsvp}` (phase 2), `{host}`.
- Default plan: email 1 week before, text 1 day before, text 1 hour before, text "starting now" with the join link. Fully editable.
- Calendar: a public `.ics` route per person, `/s/$token.ics`, with the RRULE, EXDATE for skipped dates and RECURRENCE-ID entries for moved ones, reusing `src/lib/ics.ts`. Plus a Google Calendar link (Google links cannot carry exceptions, so they only get the rule; noted in the help text).
- First text to any number: "Kenroe reminders from {host}: ... Reply STOP to opt out." Tracked by `first_sms_sent_at`. STOP flows into the existing `sms_consent_log`.

## Import (phase 2), end to end

1. Upload widget (drag and drop or pick file). CSV/XLSX up to 5 MB, images up to 10 MB, PDF up to 10 MB and 10 pages. Plus a paste-text box.
2. File goes to a new private bucket `contact-imports` at `{user_id}/{import_id}/...`. Policies: insert, read and delete only where the first folder equals the uploader's id. No list policy for anyone else.
3. Server function (auth + tier check) reads the file: CSV/XLSX parsed directly (no AI, free); images and PDFs sent to the Lovable AI model `google/gemini-3.6-flash` with a strict schema returning name, phone, email and a confidence per field.
4. Server normalizes phones to E.164 (US default), validates email, and marks duplicates against the owner's contacts using all phone forms.
5. Review table: editable rows, yellow for low confidence, red for invalid, a merge/skip choice per duplicate. Nothing is saved yet.
6. Confirm saves contacts and adds them to the schedule, then deletes the file. A nightly job deletes any leftover file older than 24 hours.
7. Rough AI cost: a photo or 1-page list is about 1 to 3 cents; a 10-page PDF about 10 to 25 cents. Spreadsheets cost nothing. Handwriting accuracy will vary, which is why the review table is mandatory.

## Pages

- `/schedules` in the main navigation: list of schedules with next occurrence, people count, status.
- `/schedules/new` and `/schedules/$id`: tabs for Details, Repeats, People, Reminders, Upcoming (next 10 occurrences with skip/move), and in phase 2 Delivery.
- `/s/$token`: public page for one person, shows only their own next date, calendar links, and I'll be there / Can't make it. No other names, numbers or emails.
- Layouts checked at phone, tablet, desktop and TV widths in a real browser before I call it done. Plain American English, no em dashes, What's New entry at ship.

## Security, point by point

- RLS on every new table, owner-only (`owner_user_id = auth.uid()` directly, or via the parent schedule). Grants to `authenticated` and `service_role` only; no `anon` grant on any table that holds phone or email. Verified after the migration by querying policies and grants.
- Every server function that uses the admin client first loads the schedule, contact or event by id through the signed-in user's own client (RLS) and refuses if it is not theirs.
- The public token page reads through one narrow server function that returns only first name, schedule title, next date and that person's own answer.
- Demo: sends already stop at the shared email and text guard for the demo account; schedules also carry `is_demo` and the engine skips them. Any seeded demo data uses example.com emails and 555-01xx numbers.
- NULL-safe filters: exclusions written as `coalesce(x, false)` / `is distinct from`, so rows without a user id are never silently dropped.
- Nothing touches event sm7eduqe or the sample wedding.

## Migrations (each applied to the live database, then verified)

1. Phase 1 tables, indexes, grants, RLS, `can_use_schedules`, updated_at triggers.
2. pg_cron jobs: 5-minute tick and nightly top-up, calling the published hooks with the secret header.
3. Phase 2: `schedule_rsvps`, `contact_imports`, storage policies for the private bucket (bucket created with the storage tool).
4. Phase 3: none expected; `source_type` already exists.

## Things in the request I would change

- Status callbacks are already built (see above). The real task is finding why rows stay "sent".
- Skip hourly.
- "Forever" plus quiet-hour moves plus a daily cap can hide missed reminders. The page will show held and moved sends plainly rather than silently.
- Texting imported people who never opted in is the biggest legal risk. The STOP line helps but is not consent. I recommend the first message be an email where one exists, and a checkbox the owner must tick confirming these people agreed to receive texts.

## Open questions

1. Is `profiles.tier` the real tier source, or should the gate use entitlements? (I will check and report either way.)
2. On downgrade: pause reminders, or keep sending existing ones?
3. Daily text cap: 200 per owner per day OK?
4. Import in phase 1 or phase 2?
5. Is the phone-number cleanup (merging `+1` and 10-digit duplicates in existing contacts) in scope, since dedupe depends on it?

## Technical notes

- New files: `src/lib/schedules.functions.ts`, `src/lib/schedules-engine.server.ts`, `src/lib/schedule-rrule.ts` (pure, unit tested for DST, 5th-Sunday, last-Friday, exceptions), `src/routes/_authenticated/schedules*.tsx`, `src/routes/s.$token.tsx`, `src/routes/api/public/hooks/schedule-reminders.ts`.
- Dependency: `rrule` (pure JS). `xlsx` is already installed.
- Unit tests before any send path is enabled; engine tested with a dry-run mode that writes send rows but never enqueues.
