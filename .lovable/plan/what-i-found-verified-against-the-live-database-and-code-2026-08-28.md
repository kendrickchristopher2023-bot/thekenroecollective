Fix reminders: make "Event reminders" actually send, and unify the surfaces

## What I found (verified against the live database and code)

1. **The "Event reminders" panel does nothing.** Ticking "1 week before", "2 days before", etc. only saves the choice onto the event (`reminderPresetIds`). No scheduled job ever reads those presets, so no email or text is ever sent. "Send reminder now" writes a line to a local reminder log and shows a toast, and sends nothing at all. That is why your reminders never went out.
2. **The only reminder engine that really runs is the RSVP chase.** An hourly job emails guests who have **not replied yet**, on the schedule under "RSVP deadline". For Tenia's Birthday Dinner every guest is already marked **yes**, so the job correctly had nobody to nudge. Two guests were nudged on Aug 27 while still pending; that is the entire reminder history for the event.
3. **Reminders are spread across three places**, which is the confusion you noticed: "Event reminders" (fake), "RSVP deadline" auto-nudges (real, non-responders only), and "SMS reminders" (real, but manual only).
4. Infrastructure itself is healthy: the hourly job runs every hour, returns 200, and email delivery is working (recent sends logged as sent, no failures).

## What I'll build

### 1. Real event-countdown reminders

A new scheduled worker sends the reminder presets you tick, before the event date:

- Runs hourly, sends inside the host's daytime window (8am to 8pm event time), same rule the other reminder jobs use.
- Audience default: everyone who said **yes** or **maybe** (they need the "don't forget, here are the details" nudge), plus non-responders. Each preset sends once per guest, tracked in the database so a retry can never double-send.
- Content: event name, host, date and time with the zone label ("6:00 PM EDT"), location, their personal invite link, and a link to change their answer.

### 2. "Send reminder now" becomes a real send

The button opens the same audience picker used for resends (filter by no answer / yes / maybe / no, search, per-person checkboxes), shows a confirmation with the recipient count and names, then sends and logs every message. Existing plan reminder caps (Postcard 1, Whisper 3, Host and above unlimited) stay exactly as they are.

### 3. One reminders home instead of three

A single "Reminders" section with:

- **Automatic**: RSVP chase schedule (non-responders, tied to the RSVP deadline) and event countdown presets, each labelled with who it goes to and when the next one fires.
- **Send now**: manual email or text, one audience picker, one confirmation.
- **History**: what was sent, when, to how many people, from the real send log rather than local state.

### 4. Backfill for your event

Tenia's Birthday Dinner is on Aug 29. Once the worker is live, the "2 days before" / "1 day before" presets will fire on schedule. If you want the missed nudge out sooner, I can send it manually from the new Send now flow right after this ships.

## Technical notes

- New hook route `src/routes/api/public/hooks/event-reminders.ts`, worker in `src/lib/event-reminders.server.ts`, using `sendManagedEmail`, `isDaytimeInZone`, `formatEventForMessage` (zone-labelled times), `personalInviteUrl` / `oneTapRsvpUrls`.
- New table `event_reminder_sends` (event_id, guest_id, preset_id, sent_at, unique key) with RLS plus grants, so idempotency lives in the database, not in the event JSON blob. Migration applied to the live database and policies/grants re-verified after.
- `pg_cron` job on the hourly slot, calling the hook with the shared cron secret like the other jobs.
- New email template registered in `src/lib/email-templates/registry.ts`; every send logged to `email_send_log`.
- Manual send goes through a server function that re-checks the caller owns the event and re-checks the tier reminder cap server-side.
- Reminder cap tier values are reused as-is; no pricing or entitlement changes.
- `RemindersPanel` and `SmsRemindersPanel` in `src/routes/events.$eventId.index.tsx` merge into one section reusing `GuestAudiencePicker` and `confirmDialog`.

## Verification before I report back

- Trigger the worker against Tenia's event and confirm exactly one email per guest per preset, correct zone label, and no duplicates on a second run.
- Confirm `email_send_log` rows land as `sent` with no failures.
- Check the merged panel at 375px wide on the real event page.