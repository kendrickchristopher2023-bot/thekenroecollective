import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BackupRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  prefix: string;
  table_count: number;
  row_count: number;
  bytes: number;
  errors: { table: string; message: string }[];
  kind?: string;
  object_count?: number;
  new_object_count?: number;
  deleted_object_count?: number;
};

export type BackupHealth = {
  kind: string;
  last_success_at: string | null;
  hours_since: number | null;
  table_count: number;
  row_count: number;
  object_count: number;
  bytes: number;
  stale: boolean;
};

export type StorageMirrorSummary = {
  buckets: { bucket: string; mirrored: number; bytes: number; retained: number; failed: number }[];
  mirrored: number;
  retained: number;
  failed: number;
  bytes: number;
};

async function assertOwner(context: { supabase: any; userId: string }) {
  const [owner, superAdmin] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
  ]);
  if (!owner.data && !superAdmin.data) throw new Error("Forbidden");
}

/** Recent nightly backup runs, newest first. Owner-only. */
export const listBackupRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BackupRun[]> => {
    await assertOwner(context as never);
    const { data, error } = await (context as never as { supabase: any }).supabase
      .from("backup_runs")
      .select(
        "id, started_at, finished_at, status, prefix, kind, table_count, row_count, bytes, errors, object_count, new_object_count, deleted_object_count",
      )
      .order("started_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (data ?? []) as BackupRun[];
  });

/**
 * Short-lived signed download link for a file inside one backup folder.
 * Owner-only; the bucket itself stays private with no public policy.
 */
export const getBackupFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(z
      .object({
        prefix: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        file: z.string().regex(/^[a-z0-9_.-]+$/i).max(120),
      }), i, "backups.functions.ts:76"),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("db-backups")
      .createSignedUrl(`${data.prefix}/${data.file}`, 300);
    if (error || !signed) throw new Error(error?.message ?? "Could not sign that file");
    return { url: signed.signedUrl };
  });

/** File listing for one backup folder. Owner-only. */
export const listBackupFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(z.object({ prefix: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), i, "backups.functions.ts:92"),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: files, error } = await supabaseAdmin.storage
      .from("db-backups")
      .list(data.prefix, { limit: 500, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(error.message);
    return (files ?? []).map((f) => ({
      name: f.name,
      size: (f.metadata as { size?: number } | null)?.size ?? 0,
    }));
  });

/** Last successful database run and last successful file run. Owner-only. */
export const getBackupHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BackupHealth[]> => {
    await assertOwner(context as never);
    const { data, error } = await (context as never as { supabase: any }).supabase.rpc(
      "backup_health",
    );
    if (error) throw new Error(error.message);
    return (data ?? []) as BackupHealth[];
  });

/**
 * Counts from the storage mirror manifest, per bucket, so the live counts can be
 * compared against what has actually been copied. Owner-only.
 */
export const getStorageMirrorSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StorageMirrorSummary> => {
    await assertOwner(context as never);
    const { data, error } = await (context as never as { supabase: any }).supabase
      .from("storage_backup_objects")
      .select("bucket_id, size, status")
      .in("status", ["mirrored", "deleted", "failed"])
      .limit(5000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { bucket_id: string; size: number; status: string }[];
    const map = new Map<string, StorageMirrorSummary["buckets"][number]>();
    let mirrored = 0;
    let retained = 0;
    let failed = 0;
    let bytes = 0;
    for (const r of rows) {
      const entry =
        map.get(r.bucket_id) ??
        { bucket: r.bucket_id, mirrored: 0, bytes: 0, retained: 0, failed: 0 };
      if (r.status === "mirrored") {
        entry.mirrored += 1;
        entry.bytes += Number(r.size) || 0;
        mirrored += 1;
        bytes += Number(r.size) || 0;
      } else if (r.status === "deleted") {
        entry.retained += 1;
        retained += 1;
      } else {
        entry.failed += 1;
        failed += 1;
      }
      map.set(r.bucket_id, entry);
    }
    return {
      buckets: [...map.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)),
      mirrored,
      retained,
      failed,
      bytes,
    };
  });

/**
 * Signed, 10-minute download link for a complete archive: either the newest
 * nightly database export (every table plus its manifest) or the uploaded-file
 * mirror. Owner-only; the link itself carries no session.
 */
export const createBackupArchiveLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(z
      .object({
        kind: z.enum(["database", "files"]),
        prefix: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }), i, "backups.functions.ts:179"),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context as never);
    const { mintArchiveTicket } = await import("@/lib/backup-archive.server");
    const t = await mintArchiveTicket(data.kind, data.prefix);
    const params = new URLSearchParams({
      kind: t.kind,
      prefix: t.prefix,
      exp: String(t.exp),
      sig: t.sig,
    });
    return { url: `/api/public/backup-archive?${params.toString()}` };
  });

/** Run the file mirror on demand. Owner-only; the nightly job does the same work. */

export const runStorageBackupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context as never);
    const { runStorageBackup } = await import("@/lib/storage-backup.server");
    const result = await runStorageBackup();
    return {
      ok: result.ok,
      copied: result.copied,
      alreadyPresent: result.already_present,
      liveObjects: result.live_objects,
      markedDeleted: result.marked_deleted,
      budgetReached: result.budget_reached,
      errorCount: result.errors.length,
    };
  });
