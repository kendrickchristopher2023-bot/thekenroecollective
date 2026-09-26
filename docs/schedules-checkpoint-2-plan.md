# Schedules checkpoint 2 plan (not built)

## E. Reply by text
- Current inbound setup: `/api/public/hooks/sms-opt-out-webhook` already checks the Twilio signature (TWILIO_AUTH_TOKEN), handles STOP/START/HELP, and then treats YES/NO/MAYBE as an **event** RSVP (`recordSmsRsvp`, soonest upcoming event where the guest's phone matches).
- Needed on Twilio: confirm the sending number (or its Messaging Service) has "A message comes in" set to `https://thekenroecollective.com/api/public/hooks/sms-opt-out-webhook` (POST). The signature check must use that exact URL. Verify with one test inbound before switching anything.
- Build: extend the same webhook, never a second one. Order stays: STOP/START/HELP first, unchanged. Then parse 1/2/3, YES/MAYBE/NO, "will", "may", "can't".
- Matching: find schedule_people for this number (all phone forms) whose schedule sent a text to it most recently (schedule_reminder_sends to that person). Record the RSVP for that schedule's next upcoming date (source=sms), reply "Got it: you will attend Sun, Oct 4. Change any time: {rsvp}".
- Ambiguity: number on 2 schedules texted within the same 48 hours, or both a schedule and an event awaiting an answer: no RSVP, reply asking them to use their link. No upcoming date: reply saying so. Unknown number: today's behavior.
- Risks: taking YES from an event guest as a schedule answer (fixed by the "most recent text" rule plus the ambiguity reply); signature URL mismatch rejects every inbound (test first); replies count toward the daily cap.

## F. Host summary
- Columns on schedules: summary_channel (off|email|sms|both), instant_notice boolean (default off).
- Engine: once per date at 8 AM schedule time, one row per channel in schedule_reminder_sends (kind='summary', unique per occurrence and channel) so it never double-sends; same demo, plan and cap guards. Report link to /schedules/{id}.
- Instant notice: queued from submitRsvp, same guards, off by default.
- Migration extends the kind check; published engine unaffected (it ignores the new kind).

## G. No-answer nudge
- schedule_reminder_steps.audience ('all'|'no_answer'). Engine skips people with any answer for that date (reason "already answered"). Default off.

## H. Attendance history
- Read-only view per person across the last 12 dates; flag "hasn't answered in 3 dates". No new tables.

## I. Co-hosts
- schedule_members (schedule_id, user_id, role view|edit, invited_email, token, accepted_at). Invite by email reusing the existing invite email pattern.
- RLS: a helper can_view_schedule(sid) used only on schedules, schedule_occurrences, schedule_people (names only through a view), schedule_rsvps. Co-hosts never see contacts outside the schedule or the owner's other data. Sends and billing stay owner-only.
