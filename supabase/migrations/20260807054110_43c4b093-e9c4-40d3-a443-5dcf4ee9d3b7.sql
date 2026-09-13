select cron.schedule(
  'ecard-delivery-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/ecard-delivery',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_cron_shared_secret()
    ),
    body := '{}'::jsonb
  );
  $$
);