
-- 1. Create or rotate the vault-managed shared secret
DO $$
DECLARE
  _val text := encode(gen_random_bytes(32), 'hex');
BEGIN
  IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_shared_secret') THEN
    UPDATE vault.secrets SET secret = _val WHERE name = 'cron_shared_secret';
  ELSE
    PERFORM vault.create_secret(_val, 'cron_shared_secret', 'Shared secret for /api/public/hooks/* cron auth');
  END IF;
END $$;

-- 2. Security-definer accessor limited to service_role
CREATE OR REPLACE FUNCTION public.get_cron_shared_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_cron_shared_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_shared_secret() TO service_role;

-- 3. Reschedule cron jobs with x-cron-secret header sourced from vault
DO $$
DECLARE
  _base text := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app';
BEGIN
  PERFORM cron.unschedule(j.jobname)
  FROM cron.job j
  WHERE j.jobname IN (
    'auto-thankyous-hourly',
    'rsvp-reminders-hourly',
    'sms-outbox-drain',
    'hard-delete-accounts',
    'guest-data-cleanup-weekly',
    'dispatch-announcements'
  );
END $$;

SELECT cron.schedule('auto-thankyous-hourly', '15 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/auto-thankyous',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
$cron$);

SELECT cron.schedule('rsvp-reminders-hourly', '0 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/rsvp-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
$cron$);

SELECT cron.schedule('sms-outbox-drain', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/sms-outbox-drain',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
$cron$);

SELECT cron.schedule('hard-delete-accounts', '15 3 * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/hard-delete-accounts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
$cron$);

SELECT cron.schedule('guest-data-cleanup-weekly', '0 3 * * 0', $cron$
  SELECT net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/guest-data-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
$cron$);

SELECT cron.schedule('dispatch-announcements', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/dispatch-announcements',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
$cron$);
