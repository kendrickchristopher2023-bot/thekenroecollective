// Incremental mirror of every uploaded file (songs, photos, card media, art)
// into the private `storage-backups` bucket.
//
// Why it is built this way: uploaded objects here are write-once. A rendered
// song or an uploaded photo is never edited in place. Copying 50+ MB into 30
// daily folders would burn 1.5 GB to protect 50 MB, and would get worse every
// day. So each object is copied exactly ONCE, a manifest row records it, and a
// deleted source keeps its copy for RETENTION_DAYS before the mirror is pruned.
//
// The bucket list comes from public.list_backup_buckets() and the object list
// from public.list_storage_objects(), so a new bucket or a song that lives
// under event-photos/<event>/music/ is picked up with no code change.

const MIRROR_BUCKET = "storage-backups";
const RETENTION_DAYS = 30;
// Per-run budgets so one worker invocation cannot time out. Anything left over
// is picked up by the next nightly run.
const MAX_BYTES_PER_RUN = 256 * 1024 * 1024;
const MAX_FILES_PER_RUN = 500;

type ManifestRow = {
  id: string;
  bucket_id: string;
  object_path: string;
  etag: string | null;
  size: number;
  status: string;
};

type LiveObject = {
  object_path: string;
  size: number;
  content_type: string | null;
  etag: string | null;
  updated_at: string | null;
};

export type StorageBackupResult = {
  ok: boolean;
  prefix: string;
  buckets: number;
  live_objects: number;
  copied: number;
  copied_bytes: number;
  already_present: number;
  marked_deleted: number;
  purged: number;
  budget_reached: boolean;
  errors: { table: string; message: string }[];
  per_bucket: { bucket: string; live: number; copied: number; mirrored_total: number }[];
};

export async function runStorageBackup(): Promise<StorageBackupResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const startedAt = new Date();
  const prefix = startedAt.toISOString().slice(0, 10);
  const errors: { table: string; message: string }[] = [];
  const perBucket: StorageBackupResult["per_bucket"] = [];

  let liveTotal = 0;
  let copied = 0;
  let copiedBytes = 0;
  let alreadyPresent = 0;
  let markedDeleted = 0;
  let purged = 0;
  let budgetReached = false;

  const { data: runRow } = await supabaseAdmin
    .from("backup_runs" as never)
    .insert({ prefix, status: "running", kind: "storage" } as never)
    .select("id")
    .maybeSingle();
  const runId = (runRow as { id?: string } | null)?.id ?? null;

  const finish = async (status: string, extra: Record<string, unknown>) => {
    if (!runId) return;
    await supabaseAdmin
      .from("backup_runs" as never)
      .update({
        status,
        finished_at: new Date().toISOString(),
        errors,
        ...extra,
      } as never)
      .eq("id", runId);
  };

  const { data: bucketList, error: bucketErr } = await supabaseAdmin.rpc(
    "list_backup_buckets" as never,
  );
  if (bucketErr || !Array.isArray(bucketList)) {
    const message = bucketErr?.message ?? "could not list buckets";
    errors.push({ table: "*", message });
    await finish("failed", {});
    return {
      ok: false,
      prefix,
      buckets: 0,
      live_objects: 0,
      copied: 0,
      copied_bytes: 0,
      already_present: 0,
      marked_deleted: 0,
      purged: 0,
      budget_reached: false,
      errors,
      per_bucket: [],
    };
  }

  const buckets = (bucketList as unknown[])
    .map((b) => (typeof b === "string" ? b : String((b as { id?: string }).id ?? "")))
    .filter((b) => b && b !== MIRROR_BUCKET);

  for (const bucket of buckets) {
    try {
      const { data: liveRaw, error: liveErr } = await supabaseAdmin.rpc(
        "list_storage_objects" as never,
        { _bucket: bucket } as never,
      );
      if (liveErr) throw new Error(liveErr.message);
      const live = ((liveRaw ?? []) as LiveObject[]).filter(
        // Supabase writes a zero-byte placeholder row for folder prefixes.
        (o) => o.object_path && !o.object_path.endsWith("/") && !o.object_path.endsWith(".emptyFolderPlaceholder"),
      );
      liveTotal += live.length;

      const { data: manifestRaw, error: manErr } = await supabaseAdmin
        .from("storage_backup_objects" as never)
        .select("id, bucket_id, object_path, etag, size, status")
        .eq("bucket_id", bucket);
      if (manErr) throw new Error(manErr.message);
      const manifest = (manifestRaw ?? []) as unknown as ManifestRow[];
      const byPath = new Map(manifest.map((m) => [m.object_path, m]));

      let bucketCopied = 0;

      for (const obj of live) {
        const existing = byPath.get(obj.object_path);
        const upToDate =
          existing &&
          existing.status === "mirrored" &&
          Number(existing.size) === Number(obj.size) &&
          (existing.etag ?? "") === (obj.etag ?? "");
        if (upToDate) {
          alreadyPresent += 1;
          continue;
        }
        if (copied >= MAX_FILES_PER_RUN || copiedBytes + obj.size > MAX_BYTES_PER_RUN) {
          budgetReached = true;
          continue;
        }

        const mirrorPath = `${bucket}/${obj.object_path}`;
        try {
          const { data: blob, error: dlErr } = await supabaseAdmin.storage
            .from(bucket)
            .download(obj.object_path);
          if (dlErr || !blob) throw new Error(dlErr?.message ?? "download failed");
          const bytes = new Uint8Array(await blob.arrayBuffer());

          const { error: upErr } = await supabaseAdmin.storage
            .from(MIRROR_BUCKET)
            .upload(mirrorPath, bytes as unknown as ArrayBuffer, {
              contentType: obj.content_type ?? "application/octet-stream",
              upsert: true,
            });
          if (upErr) throw new Error(upErr.message);

          const { error: manUpErr } = await supabaseAdmin
            .from("storage_backup_objects" as never)
            .upsert(
              {
                bucket_id: bucket,
                object_path: obj.object_path,
                mirror_path: mirrorPath,
                size: obj.size,
                content_type: obj.content_type,
                etag: obj.etag,
                source_updated_at: obj.updated_at,
                copied_at: new Date().toISOString(),
                deleted_at: null,
                purge_after: null,
                status: "mirrored",
                error: null,
              } as never,
              { onConflict: "bucket_id,object_path" } as never,
            );
          if (manUpErr) throw new Error(manUpErr.message);

          copied += 1;
          bucketCopied += 1;
          copiedBytes += Number(obj.size) || bytes.byteLength;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          errors.push({ table: `${bucket}/${obj.object_path}`, message });
          await supabaseAdmin
            .from("storage_backup_objects" as never)
            .upsert(
              {
                bucket_id: bucket,
                object_path: obj.object_path,
                mirror_path: mirrorPath,
                size: obj.size,
                content_type: obj.content_type,
                etag: obj.etag,
                source_updated_at: obj.updated_at,
                status: "failed",
                error: message.slice(0, 500),
              } as never,
              { onConflict: "bucket_id,object_path" } as never,
            );
        }
      }

      // Source object gone: keep the copy for the retention window.
      const livePaths = new Set(live.map((o) => o.object_path));
      const nowIso = new Date().toISOString();
      const purgeAfter = new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString();
      for (const row of manifest) {
        if (row.status !== "mirrored" || livePaths.has(row.object_path)) continue;
        const { error } = await supabaseAdmin
          .from("storage_backup_objects" as never)
          .update({ status: "deleted", deleted_at: nowIso, purge_after: purgeAfter } as never)
          .eq("id", row.id);
        if (!error) markedDeleted += 1;
      }

      const mirroredTotal = manifest.filter((m) => m.status === "mirrored").length + bucketCopied;
      perBucket.push({
        bucket,
        live: live.length,
        copied: bucketCopied,
        mirrored_total: mirroredTotal,
      });
    } catch (e) {
      errors.push({ table: bucket, message: e instanceof Error ? e.message : String(e) });
    }
  }

  // Retention prune of copies whose source was deleted more than 30 days ago.
  try {
    const { data: expired } = await supabaseAdmin
      .from("storage_backup_objects" as never)
      .select("id, mirror_path")
      .eq("status", "deleted")
      .lt("purge_after", new Date().toISOString())
      .limit(500);
    const rows = (expired ?? []) as unknown as { id: string; mirror_path: string }[];
    if (rows.length) {
      await supabaseAdmin.storage.from(MIRROR_BUCKET).remove(rows.map((r) => r.mirror_path));
      for (const r of rows) {
        await supabaseAdmin
          .from("storage_backup_objects" as never)
          .update({ status: "purged" } as never)
          .eq("id", r.id);
        purged += 1;
      }
    }
  } catch {
    /* pruning must never fail the mirror */
  }

  const { count: mirroredCount } = await supabaseAdmin
    .from("storage_backup_objects" as never)
    .select("id", { count: "exact", head: true })
    .eq("status", "mirrored");

  const status = errors.length ? "partial" : "success";
  await finish(status, {
    table_count: buckets.length,
    object_count: mirroredCount ?? 0,
    new_object_count: copied,
    deleted_object_count: markedDeleted,
    bytes: copiedBytes,
    tables: perBucket,
  });

  return {
    ok: errors.length === 0,
    prefix,
    buckets: buckets.length,
    live_objects: liveTotal,
    copied,
    copied_bytes: copiedBytes,
    already_present: alreadyPresent,
    marked_deleted: markedDeleted,
    purged,
    budget_reached: budgetReached,
    errors,
    per_bucket: perBucket,
  };
}
