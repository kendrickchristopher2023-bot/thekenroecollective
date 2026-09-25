# Schedules: recurring calls and events with email and text reminders

A standalone page where a host sets up a repeating call once (for example "Kendrick Family Reunion call, 1st Sunday of every month, 7:00 PM EDT"), adds people, and reminders go out by email and text automatically until an end date, or forever.

## What I checked before writing this

- Contacts already exist with `owner_user_id`, `email_norm`, `phone_norm` and unique indexes per owner. `phone_norm` keeps a leading `+`, so `+14045550100` and `4045550100` are stored as different people. Phase 1 fixes this (see "Phone cleanup").
- `sms_outbox`, `sms_consent_log`, the Twilio drain (`/api/public/hooks/sms-outbox-drain`) and the email sender (`enqueueTransactionalEmailServer`) exist and already carry the demo guard.
- The drain already sets `StatusCallback` on every send, and `/api/public/hooks/sms-status-webhook` exists and checks the Twilio signature. You confirmed all 17 rows stay "sent", so the callbacks are not landing. Phase 1 includes diagnosing and fixing this (see "Delivery callbacks").
- A day-before/day-of reminder engine for events already exists (`event_reminder_sends`, `src/lib/reminder-schedule.ts` for event-local time and daylight saving). Schedules reuse its time helpers.

## Tier source: what I found

Checkout keeps both current, but the `subscriptions` table is the real source:
- The payment handler writes a `subscriptions` row for every plan and mirrors the plan name into `profiles.tier` (sets it to host or atelier on activation, back to free on cancel).
- The app's own entitlement check (`meEntitlements`) reads the in-force `subscriptions` rows, including owner-granted comp plans (product ids starting `manual_`) and canceled-but-still-in-period or past-due rows. `profiles.tier` is a mirror that can lag or miss comps.

Decision: the gate is one SQL function `can_use_schedules(uid)` that returns true for owners, or when an in-force subscription maps to Host or Atelier (same rules as `meEntitlements`, comps included). `profiles.tier` is not used for the gate. Before build I will compare the 12 subscription rows against `profiles.tier` and report any user where they disagree.

## Phases (final)

1. **Core + import**: schedules, recurrence, exceptions, people (manual, contacts, groups, file/image/PDF/paste import), text consent, reminder plan, templates, calendar links, cron engine, quiet hours, daily cap, demo guard, phone cleanup, delivery callback fix.
2. **Delivery report + replies**: per-occurrence report of who got what and its delivery status; "I'll be there / Can't make it" links shown to the owner.
3. **Reuse**: attach to Projects, generic entry point for the Booking app.

## Who can use it

- Allowed: owners and users with an in-force Host or Atelier plan, checked by `can_use_schedules` in RLS insert/update policies and in every server function. UI hiding is cosmetic only.
- Downgrade: reminders pause, schedules stay visible and editable, the page explains why ("Reminders are paused because your plan no longer includes Schedules"), nothing is deleted. The engine checks the gate on every send, so pausing is automatic and resumes on upgrade.

## Data model (new tables)

```text
schedules
  id, owner_user_id, title, kind (call|meeting|event), description,
  join_url, dial_in, dial_pin, location,
  start_local (timestamp without tz, wall clock), timezone (IANA),
  duration_minutes, rrule (RFC 5545 text, no DTSTART inside),
  ends_kind (never|on_date|count), until_local, count,
  parent_schedule_id (set when "this and all future" splits a series),
  source_type (null|event|project|booking), source_id,
  status (active|paused|ended), is_demo, created_at, updated_at

schedule_exceptions
  id, schedule_id, original_local, action (skip|move),
  new_start_local, new_duration, note

schedule_people
  id, schedule_id, contact_id, channel (email|sms|both),
  paused, removed_at, first_sms_sent_at, rsvp_token (random 32 bytes),
  sms_consent_by (user id who ticked the box), sms_consent_at

schedule_reminder_steps
  id, schedule_id, offset_minutes (negative = before), channel,
  template_id, is_starting_now, position

schedule_templates
  id, owner_user_id, channel, subject, body (merge fields)

schedule_occurrences   (materialized, rolling 90 days)
  id, schedule_id, occurrence_local, starts_at (utc), ends_at,
  status (scheduled|skipped|moved|cancelled)
  unique (schedule_id, occurrence_local)

schedule_reminder_sends   (idempotency + delivery report)
  id, occurrence_id, person_id, step_id, channel, due_at,
  status (pending|queued|sent|delivered|failed|blocked|held|paused),
  sms_outbox_id, email_message_id, error, sent_at
  unique (occurrence_id, person_id, step_id, channel)

contact_imports
  id, owner_user_id, storage_path, kind (csv|xlsx|image|pdf|text),
  status (uploaded|parsed|confirmed|discarded), row_count, created_at

schedule_rsvps   (phase 2)
  id, occurrence_id, person_id, answer (yes|no), answered_at
```

Booking app later: it creates a `schedules` row with no rrule, `ends_kind = count, count = 1`, `source_type = 'booking'`, one person and the default steps. Same engine.

## Recurrence

- One-time, daily, weekly with weekdays, monthly by date or position (`BYDAY=1SU`, `-1FR`), quarterly (`MONTHLY;INTERVAL=3`), yearly, custom intervals. No hourly; daily is the fastest.
- Library: `rrule` (pure JavaScript). Rules expand in wall-clock time, then each result becomes an instant with the existing `eventInstant(stamp, timezone)`, so 7:00 PM stays 7:00 PM across daylight saving.
- Editing like Outlook: "This one" writes an exception. "This and all future" ends the old series with UNTIL and creates a new linked series. "All" edits the series and regenerates future occurrences, keeping exceptions whose date still exists.
- "The 31st" in shorter months: the form warns and offers "last day of the month".

## Engine and cron

- **Materialize ahead, rolling 90 days**, rebuilt on every edit and topped up nightly. The report, replies and idempotency keys need real rows; exceptions become simple updates; the 5-minute tick reads a small indexed table. Open-ended series continue forever because the nightly top-up keeps extending the window.
- **Tick every 5 minutes**: `POST /api/public/hooks/schedule-reminders`, requiring the same `x-cron-secret` header as the other hooks. It:
  1. finds steps due in the last 30 minutes with no send row,
  2. inserts `schedule_reminder_sends` with `on conflict do nothing`, so retries and overlapping ticks cannot double-send,
  3. filters: removed, paused, plan downgraded, email opt-out, text opt-out (all phone forms), missing text consent, quiet hours, daily cap, demo,
  4. hands texts to `sms_outbox` and emails to `enqueueTransactionalEmailServer`. No second sender.
- More than 30 minutes late: marked `failed: missed_window` rather than sending a stale "starting now".
- **Quiet hours** 9 PM to 8 AM in the schedule's zone: a text moves to 8:00 AM, or to 8:59 PM the evening before if 8 AM would be after the call starts. "Starting now" is exempt.
- **Daily cap**: 200 texts per owner per day, owners exempt. Over-cap sends are marked `held` and listed on the page with the reason.
- The engine only runs once published (pg_cron calls the published app). Preview testing uses an owner-only "Run now (dry run)" button.

## Text consent

- Adding or importing any person with a text channel requires a ticked checkbox: "These people agreed to get text reminders from me." Server-side, a text channel is refused without it.
- Stored per person: who ticked it (`sms_consent_by`) and when (`sms_consent_at`), also written to `sms_consent_log`.
- First text to a number: "Kenroe reminders from {host}: ... Reply STOP to opt out." Tracked by `first_sms_sent_at`. STOP goes into the existing `sms_consent_log` and is honored everywhere.

## Messages

- Merge fields: `{first_name}`, `{title}`, `{when}` (e.g. "Sun, Oct 4 at 7:00 PM EDT"), `{join}`, `{calendar}`, `{host}`, and `{rsvp}` in phase 2.
- Default plan: email 1 week before, text 1 day before, text 1 hour before, text "starting now" with the join link. Fully editable.
- Calendar: a per-person `.ics` link with the RRULE, EXDATE for skipped dates and RECURRENCE-ID for moved ones, reusing `src/lib/ics.ts`. Plus a Google Calendar link (Google cannot carry exceptions; noted in help text).

## Import (phase 1), end to end

1. Upload widget (drag and drop or pick a file), plus a paste-text box. CSV/XLSX up to 5 MB; images up to 10 MB; PDF up to 10 MB and 10 pages.
2. File goes to a new private bucket `contact-imports` at `{user_id}/{import_id}/...`. Policies allow insert, read and delete only where the first folder is the uploader's id. No list policy.
3. A server function (sign-in + tier check) reads the file: CSV/XLSX parsed directly, free; images and PDFs sent to `google/gemini-3.6-flash` with a strict schema returning name, phone, email and a confidence per field.
4. Phones normalized to E.164 (US default), emails validated, duplicates matched against the owner's contacts using all phone forms.
5. Review table: editable rows, low confidence in yellow, invalid in red, merge or skip per duplicate, the text consent checkbox. Nothing saved yet.
6. Confirm saves contacts and adds them to the schedule, then deletes the file. A nightly job deletes any leftover file older than 24 hours.
7. Rough AI cost: a photo or 1-page list about 1 to 3 cents; a 10-page PDF about 10 to 25 cents. Spreadsheets free. Handwriting accuracy varies, which is why review is mandatory.

## Phone cleanup (phase 1)

- Going forward, every write stores one canonical E.164 form (`+14045550100`), and dedupe compares all forms through `phoneKeys`.
- Existing data: a read-only report first, listing each pair per owner where the `+1` and 10-digit forms are the same number, with each side's linked groups, events, broadcasts and opt-out history. You review it before anything merges.
- Merge (after approval): keep the older contact, repoint every reference (group members, event links, broadcast recipients, schedule people) to it, copy over any missing name or email, mark the other `merged_into` rather than deleting it. Opt-outs from either side apply to the survivor. No history is lost.

## Delivery callbacks (phase 1, small item)

- Current state: 17 rows, all "sent" with a Twilio id, none updated since. Texts do arrive.
- Diagnosis first, cause unconfirmed. Likely candidates, checked in this order: the callback address is built from the incoming request, so it may point at an address Twilio cannot reach or that differs from what it signs; the signature check may compare against `http` or a different host than Twilio used, rejecting every callback; `TWILIO_AUTH_TOKEN` may not match the account sending.
- Checks: read the webhook logs for rejected calls, fetch one message's status from Twilio to confirm it reports "delivered", and send one test callback.
- Fix whichever it is (most likely a fixed published address for the callback and the signature check). Then backfill the 17 rows by asking Twilio for each message's final status.

## Pages

- `/schedules` in the main navigation: schedules with next occurrence, people count, status, and any held or paused notice.
- `/schedules/new` and `/schedules/$id`: tabs for Details, Repeats, People (with Import), Reminders, Upcoming (next 10 dates with skip/move), and Delivery in phase 2.
- `/s/$token`: public page for one person, showing only their own next date, calendar links and (phase 2) their reply. No other names, numbers or emails.
- Checked at phone, tablet, desktop and TV widths in a real browser. Plain American English, no em dashes, What's New entry at ship.

## Security, point by point

- RLS on every new table, owner-only (directly or via the parent schedule). Grants to `authenticated` and `service_role` only; no `anon` grant on anything holding phone or email. Policies and grants verified by query after each migration.
- Every server function that uses the admin client first loads the schedule, contact, event or project through the user's own client and refuses if it is not theirs.
- The public token page uses one narrow server function returning only first name, title, next date and that person's own answer.
- Demo: sends stop at the shared email and text guard for the demo account; schedules carry `is_demo` and the engine skips them. Seeded demo data uses example.com emails and 555-01xx numbers.
- NULL-safe filters (`coalesce`, `is distinct from`) so rows without a user id are never silently dropped.
- Nothing touches event sm7eduqe or the sample wedding.

## Migrations (each applied to the live database, then verified)

1. Phase 1 tables, indexes, grants, RLS, `can_use_schedules`, updated_at triggers.
2. `contacts.merged_into` column and the canonical-phone write trigger.
3. Storage policies for the private `contact-imports` bucket (bucket created with the storage tool).
4. pg_cron jobs: 5-minute tick, nightly top-up and nightly import-file cleanup, calling the published hooks with the secret header.
5. Phase 2: `schedule_rsvps`.
6. Phase 3: none expected; `source_type` already exists.

The contact merge itself is a data change, run only after you approve the report.

## Test checklist before phase 1 is called done

- Daylight saving: a 1st-Sunday 7:00 PM series across the November change stays at 7:00 PM local, with the right EDT/EST label.
- Last-Friday and 5th-Sunday rules produce the right dates, and 5th-Sunday skips months without one.
- Skip one date and move one date; series and calendar file stay correct.
- "This and all future" split: old series ends, new one starts, no gap or duplicate.
- Open-ended series: nightly top-up extends the 90-day window.
- Retry and two overlapping ticks never double-send.
- Quiet-hours move: a 10 PM text goes out at 8:00 AM; "starting now" is not moved.
- Opt-out honored for both phone forms; email opt-out honored; no consent means no text.
- Daily cap holds the 201st text and shows it plainly.
- Downgraded account: reminders pause, page explains, nothing deleted.
- Demo account cannot send any text or email.
- RLS and grants: a second non-owner account and a signed-out visitor cannot read any schedule, person, phone or email.
- Import: CSV, XLSX, a photo, a PDF and pasted text all reach the review table; file deleted after confirm.
- Delivery callback: a test text moves from "sent" to "delivered".
- Engine dry run: send rows created, nothing enqueued, before any real send is switched on.

## Technical notes

- New files: `src/lib/schedules.functions.ts`, `src/lib/schedules-engine.server.ts`, `src/lib/schedule-rrule.ts` (pure, unit tested), `src/lib/contact-import.functions.ts`, `src/routes/_authenticated/schedules*.tsx`, `src/routes/s.$token.tsx`, `src/routes/api/public/hooks/schedule-reminders.ts`.
- Dependency: `rrule` (pure JS). `xlsx` is already installed.
