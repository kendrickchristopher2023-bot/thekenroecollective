# Technical rules

- New public tables: `REVOKE ALL ... FROM anon, authenticated; GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated; GRANT ALL ... TO service_role;` then RLS policies. Why: a blanket ALL grant also hands out TRUNCATE, TRIGGER and REFERENCES, which RLS does not stop.
- Schedules co-hosts get read access through RLS only; every co-host write goes through a server function that checks `schedule_member_role` before using the admin client. Why: keeps owner-only write policies unchanged and puts one audited gate in front of co-host edits.
- Schedule texts go through `sms_outbox` with an empty `event_id`, and link back through `schedule_reminder_sends.sms_outbox_id` or `schedule_host_notices.sms_outbox_id`. Why: one sender, one opt-out check, and replies can tell schedule texts from event texts.
