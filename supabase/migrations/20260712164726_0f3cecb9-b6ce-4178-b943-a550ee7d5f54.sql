-- Schedule the SMS outbox drain worker to run every minute.
-- The endpoint exits early with { skipped: 'unconfigured' } when Twilio
-- secrets are absent, so scheduling this is safe even before secrets are set.
SELECT cron.unschedule('sms-outbox-drain') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sms-outbox-drain');

SELECT cron.schedule(
  'sms-outbox-drain',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/sms-outbox-drain',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlbmV1cWZ3eGlhdG5oZmRtc2NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjkzNTEsImV4cCI6MjA5NzI0NTM1MX0.ykqIjPrbQcY9c6Oo7QOFGes1yRVXm8COfEVfVBcVTtc"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);