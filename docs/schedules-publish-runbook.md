# Schedules: publish runbook (do not run until Christopher publishes)

## 1. What's New entry (draft, not yet visible)
Title: Schedules: set it once, and everyone gets reminded
Body: Have a call on the first Sunday of every month? Set it up once in Schedules, add your people, and we send email and text reminders before every date, for as long as you like. Import names from a spreadsheet, a PDF, or even a photo of a handwritten list, and check every row before it is saved. Skip or move a single date without changing the rest. Everyone gets an "Add to calendar" link, and anyone can reply STOP to stop texts. Included with Host and Atelier plans.
New: Send now. Need to reach everyone today? Tap Send now on any schedule, pick the date, check the message, and see exactly who gets a text or email before you send.
New: Welcome message. Set a kickoff message and the time it goes out. Reminders start after it is sent, and people you add later can get it too.
CTA: Open Schedules -> /schedules

## 2. Cron jobs (create only after publish)
```sql
select cron.schedule('schedule-reminders-tick', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/schedule-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', public.get_cron_shared_secret()),
    body := '{}'::jsonb);
$$);

select cron.schedule('schedule-reminders-topup-nightly', '15 7 * * *', $$
  select net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/schedule-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', public.get_cron_shared_secret()),
    body := '{"job":"topup"}'::jsonb);
$$);
```
(07:15 UTC = 3:15 AM Eastern. The top-up also deletes import files older than 24 hours.)

## 3. Post-publish checks
1. Without the secret header, POST the hook: expect 401.
2. `select count(*) from cron.job` = 21 (19 before + 2).
3. After 10 minutes: `select status, return_message from cron.job_run_details where jobid in (select jobid from cron.job where jobname like 'schedule-reminders%') order by start_time desc limit 5` shows succeeded, and net._http_response shows 200.
4. `sms_outbox` count unchanged unless a real schedule had a due text.
5. Next morning: every active schedule has `horizon_until` about 90 days out.
6. Send one test text from Christopher's own schedule to his own phone; confirm the sms_outbox row moves from sent to delivered (status callback).
7. Publish the What's New entry above.

Rollback: `select cron.unschedule('schedule-reminders-tick'); select cron.unschedule('schedule-reminders-topup-nightly');`
