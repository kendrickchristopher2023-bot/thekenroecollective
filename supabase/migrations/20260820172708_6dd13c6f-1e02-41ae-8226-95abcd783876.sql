SELECT cron.unschedule('payment-reminders-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'payment-reminders-daily');

SELECT cron.schedule('payment-reminders-daily', '30 16 * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/payment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
$cron$);