-- 1. Backup run log ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backup_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  prefix TEXT NOT NULL,
  table_count INT NOT NULL DEFAULT 0,
  row_count BIGINT NOT NULL DEFAULT 0,
  bytes BIGINT NOT NULL DEFAULT 0,
  tables JSONB NOT NULL DEFAULT '[]'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.backup_runs TO authenticated;
GRANT ALL ON public.backup_runs TO service_role;

ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and admins can view backup runs" ON public.backup_runs;
CREATE POLICY "Owners and admins can view backup runs"
ON public.backup_runs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE INDEX IF NOT EXISTS backup_runs_started_at_idx ON public.backup_runs (started_at DESC);

-- 2. Schema-driven table list ------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_backup_tables()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.relname::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname <> 'backup_runs'
  ORDER BY c.relname;
$$;

REVOKE ALL ON FUNCTION public.list_backup_tables() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_backup_tables() TO service_role;

-- 3. Nightly schedule --------------------------------------------------------
SELECT cron.unschedule('db-backup-nightly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'db-backup-nightly');

SELECT cron.schedule('db-backup-nightly', '45 3 * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/db-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);