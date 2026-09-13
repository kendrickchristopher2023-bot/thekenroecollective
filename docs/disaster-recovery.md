# Disaster recovery

## What exists

| Asset | Where it lives | Recovery point |
| --- | --- | --- |
| Application code | Lovable + GitHub (`kendrickchristopher2023-bot/kenroescom`, `main`) | Every commit |
| Database schema | SQL migrations in `supabase/migrations/` (in GitHub) | Every commit |
| Database data | Managed Postgres, plus nightly export to the private `db-backups` bucket | Last night, 3:45 AM UTC |
| Uploaded files (songs, photos, card media, art) | Live bucket, plus a one-time copy in the private `storage-backups` bucket | Within 24 hours of upload |

Point-in-time recovery is not available on this managed plan, so the nightly export
is the database recovery point. Retention is 30 days.

## How the nightly database backup works

- Cron job `db-backup-nightly` (pg_cron, 3:45 AM UTC) posts to
  `/api/public/hooks/db-backup` with the shared cron secret.
- The endpoint enumerates every table in `public` via `list_backup_tables()`, so new
  tables are picked up automatically with no code change.
- Each table is written to `db-backups/<YYYY-MM-DD>/<table>.json.gz` as
  `{ table, exported_at, rows: [...] }`, plus a `manifest.json` for the run.
- Each run is logged in `public.backup_runs` with `kind = 'database'`.
- Folders older than 30 days are pruned at the end of each run.

## How the file backup works

Uploaded objects are write-once: a rendered song or an uploaded photo is never
edited in place. So files are NOT re-copied into daily folders. Instead:

- Cron job `storage-backup-nightly` (4:15 AM UTC) posts to
  `/api/public/hooks/storage-backup`.
- Buckets come from `list_backup_buckets()` and objects from
  `list_storage_objects(bucket)`, so a new bucket, or a song stored under
  `event-photos/<event>/music/`, is covered with no code change.
- Each object is copied exactly once to `storage-backups/<bucket>/<path>` and
  recorded in `public.storage_backup_objects` (size, type, etag, copied_at).
- When the source object disappears, the manifest row is marked `deleted` and the
  copy is kept for 30 more days, then pruned (`purged`).
- Per-run budget: 500 files / 256 MB. Anything left over is copied the next night.
- Owners can also run it on demand: Owner console → Backups → "Back up files now".

## Monitoring: a miss cannot be silent

- `public.backup_health()` returns the last successful run per kind and flags
  anything older than 26 hours.
- Cron job `backup-watchdog-daily` (6:00 AM UTC) does two things:
  1. `record_stale_backup_notices()` writes an owner notice straight into the
     database, so a miss is recorded even if the website is unreachable.
  2. Posts to `/api/public/hooks/backup-watchdog`, which routes a stale result to
     the existing owner alert channel (email + SMS), deduped once per day per kind.
- Owner console → Backups shows both figures at the top and turns red when stale.

## Manual run

```sql
select net.http_post(
  url := 'https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/db-backup',
  headers := jsonb_build_object('content-type','application/json','x-cron-secret', public.get_cron_shared_secret()),
  body := '{}'::jsonb
);
```

Swap `db-backup` for `storage-backup` or `backup-watchdog` for the other jobs.

## Restoring a table (verified drill, 2026-09-05)

Drill result: `events` from the `2026-09-04` export, restored into a scratch table
and compared row by row against live. 10 rows in the file, 6 live rows, all 6
byte-identical, 0 differences. The 4 extra rows in the file are the fake events
deleted after that export was taken, which is expected and shows deleted rows are
recoverable. Elapsed time: 3 seconds for one table.

Steps Christopher can follow:

1. Owner console → Backups → pick the date → Download the table file.
2. `gunzip <table>.json.gz` gives `{ table, exported_at, rows: [...] }`.
3. Restore order matters because of foreign keys: `profiles` and `user_roles`
   first, then `events`, then everything referencing `events`. Guests live inside
   `events.data`, so restoring `events` restores guests and RSVPs.
4. Never restore over a live table without first exporting its current state.
   Restore into a scratch copy, compare, then move rows across.
5. Insert with the service role, upserting on the primary key so an existing row is
   updated rather than duplicated.
6. Verify counts against `backup_runs.row_count` for that date.

## Restoring a file

1. Find the path in `storage_backup_objects` (`bucket_id`, `object_path`).
2. Download `storage-backups/<bucket>/<path>`.
3. Upload it back to the original bucket at the original path.

## Known gaps

- Both copies live inside the same cloud project. An off-platform copy is proposed
  but not built.
- What the platform itself retains behind the scenes, whether point-in-time
  recovery is enabled, and who can trigger a platform-side restore are not visible
  from inside the project. Treat the nightly export as the only recovery point until
  Lovable support confirms otherwise.
- 28 August 2026: pg_cron fired at 03:45 and succeeded, but no `backup_runs` row was
  ever written, so the request never reached the handler. pg_net keeps only ~6 hours
  of response history, so the cause cannot be established from the record. The
  watchdog above exists so this cannot pass unnoticed again.
- Browser `pendingPush` queue: a host's unsynced edits are lost if their device dies
  before the queue flushes. The sync indicator shows when writes are still pending.
