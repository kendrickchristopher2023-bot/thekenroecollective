-- 1. Manifest of mirrored storage objects ----------------------------------
CREATE TABLE IF NOT EXISTS public.storage_backup_objects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bucket_id TEXT NOT NULL,
  object_path TEXT NOT NULL,
  mirror_path TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  content_type TEXT,
  etag TEXT,
  source_updated_at TIMESTAMPTZ,
  copied_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  purge_after TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'mirrored',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT storage_backup_objects_unique UNIQUE (bucket_id, object_path)
);

GRANT SELECT ON public.storage_backup_objects TO authenticated;
GRANT ALL ON public.storage_backup_objects TO service_role;

ALTER TABLE public.storage_backup_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and admins can view the storage manifest" ON public.storage_backup_objects;
CREATE POLICY "Owners and admins can view the storage manifest"
ON public.storage_backup_objects FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE INDEX IF NOT EXISTS storage_backup_objects_status_idx
  ON public.storage_backup_objects (status, bucket_id);
CREATE INDEX IF NOT EXISTS storage_backup_objects_purge_idx
  ON public.storage_backup_objects (purge_after) WHERE purge_after IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storage_backup_objects_touch ON public.storage_backup_objects;
CREATE TRIGGER storage_backup_objects_touch
BEFORE UPDATE ON public.storage_backup_objects
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. backup_runs gains a kind and file counters ------------------------------
ALTER TABLE public.backup_runs
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'database',
  ADD COLUMN IF NOT EXISTS object_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_object_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_object_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS backup_runs_kind_started_idx
  ON public.backup_runs (kind, started_at DESC);

-- 3. Bucket list for the mirror job (schema driven, service role only) -------
CREATE OR REPLACE FUNCTION public.list_backup_buckets()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT b.id::text
  FROM storage.buckets b
  WHERE b.id NOT IN ('db-backups', 'storage-backups')
  ORDER BY b.id;
$$;

REVOKE ALL ON FUNCTION public.list_backup_buckets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_backup_buckets() TO service_role;

-- 4. Live inventory of source objects, so the mirror job can diff ------------
CREATE OR REPLACE FUNCTION public.list_storage_objects(_bucket text)
RETURNS TABLE (
  object_path text,
  size bigint,
  content_type text,
  etag text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT o.name::text,
         COALESCE((o.metadata->>'size')::bigint, 0),
         o.metadata->>'mimetype',
         o.metadata->>'eTag',
         o.updated_at
  FROM storage.objects o
  WHERE o.bucket_id = _bucket
  ORDER BY o.name;
$$;

REVOKE ALL ON FUNCTION public.list_storage_objects(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_storage_objects(text) TO service_role;

-- 5. Backup health, readable by owners and admins ----------------------------
CREATE OR REPLACE FUNCTION public.backup_health()
RETURNS TABLE (
  kind text,
  last_success_at timestamptz,
  hours_since numeric,
  table_count int,
  row_count bigint,
  object_count int,
  bytes bigint,
  stale boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH kinds AS (SELECT unnest(ARRAY['database','storage']) AS kind),
  latest AS (
    SELECT DISTINCT ON (r.kind)
      r.kind, r.finished_at, r.table_count, r.row_count, r.object_count, r.bytes
    FROM public.backup_runs r
    WHERE r.status IN ('success','partial') AND r.finished_at IS NOT NULL
    ORDER BY r.kind, r.finished_at DESC
  )
  SELECT k.kind,
         l.finished_at,
         ROUND(EXTRACT(EPOCH FROM (now() - l.finished_at)) / 3600.0, 1),
         COALESCE(l.table_count, 0),
         COALESCE(l.row_count, 0),
         COALESCE(l.object_count, 0),
         COALESCE(l.bytes, 0),
         (l.finished_at IS NULL OR l.finished_at < now() - interval '26 hours')
  FROM kinds k
  LEFT JOIN latest l ON l.kind = k.kind
  ORDER BY k.kind;
$$;

REVOKE ALL ON FUNCTION public.backup_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backup_health() TO authenticated, service_role;

-- 6. Database-side miss detector: records an owner notice even if the site is
--    down, so a silent miss cannot happen again without a trace.
CREATE OR REPLACE FUNCTION public.record_stale_backup_notices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h RECORD;
  key TEXT;
BEGIN
  FOR h IN SELECT * FROM public.backup_health() WHERE stale LOOP
    key := 'backup-stale-' || h.kind || '-' || to_char(now(), 'YYYY-MM-DD');
    BEGIN
      INSERT INTO public.owner_alert_log (dedupe_key, kind)
      VALUES (key, 'backup_stale');
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
    INSERT INTO public.admin_notifications (kind, title, body, link, metadata)
    VALUES (
      'backup_stale',
      CASE WHEN h.kind = 'storage' THEN 'File backup has not completed' ELSE 'Database backup has not completed' END,
      COALESCE(
        'Last successful run: ' || to_char(h.last_success_at, 'YYYY-MM-DD HH24:MI') || ' UTC (' || h.hours_since || ' hours ago).',
        'No successful run has ever been recorded.'
      ),
      '/owner?tab=backups',
      jsonb_build_object('kind', h.kind, 'last_success_at', h.last_success_at)
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.record_stale_backup_notices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stale_backup_notices() TO service_role;

-- 7. Schedules ---------------------------------------------------------------
SELECT cron.unschedule('storage-backup-nightly') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'storage-backup-nightly');
SELECT cron.schedule('storage-backup-nightly', '15 4 * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/storage-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
$cron$);

SELECT cron.unschedule('backup-watchdog-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'backup-watchdog-daily');
SELECT cron.schedule('backup-watchdog-daily', '0 6 * * *', $cron$
  SELECT public.record_stale_backup_notices();
  SELECT net.http_post(
    url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/backup-watchdog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$cron$);
