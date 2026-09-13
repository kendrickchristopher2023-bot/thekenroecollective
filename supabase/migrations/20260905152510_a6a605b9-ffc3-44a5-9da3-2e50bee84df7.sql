SELECT cron.unschedule('error-alerts-hourly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'error-alerts-hourly');
SELECT cron.schedule('error-alerts-hourly', '20 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/error-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$cron$);

SELECT cron.unschedule('error-digest-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'error-digest-daily');
SELECT cron.schedule('error-digest-daily', '25 11 * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/error-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{"digest": true}'::jsonb,
    timeout_milliseconds := 60000
  );
$cron$);