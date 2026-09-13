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
  WITH allowed AS (
    SELECT (
      public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'admin')
      OR auth.role() = 'service_role'
    ) AS ok
  ),
  kinds AS (SELECT unnest(ARRAY['database','storage']) AS kind),
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
  WHERE (SELECT ok FROM allowed)
  ORDER BY k.kind;
$$;

REVOKE ALL ON FUNCTION public.backup_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backup_health() TO authenticated, service_role;
