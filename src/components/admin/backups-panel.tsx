import { toUserMessage } from "@/lib/user-error";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createBackupArchiveLink,
  getBackupFileUrl,
  getBackupHealth,
  getStorageMirrorSummary,
  listBackupFiles,
  listBackupRuns,
  runStorageBackupNow,
  type BackupHealth,
  type BackupRun,
  type StorageMirrorSummary,
} from "@/lib/backups.functions";
import { formatTimestamp } from "@/lib/datetime";

function humanBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupsPanel() {
  const loadRuns = useServerFn(listBackupRuns);
  const loadFiles = useServerFn(listBackupFiles);
  const signFile = useServerFn(getBackupFileUrl);
  const loadHealth = useServerFn(getBackupHealth);
  const loadMirror = useServerFn(getStorageMirrorSummary);
  const runMirror = useServerFn(runStorageBackupNow);
  const archiveLink = useServerFn(createBackupArchiveLink);
  const [archiving, setArchiving] = useState<"database" | "files" | null>(null);


  const [runs, setRuns] = useState<BackupRun[] | null>(null);
  const [health, setHealth] = useState<BackupHealth[] | null>(null);
  const [mirror, setMirror] = useState<StorageMirrorSummary | null>(null);
  const [mirroring, setMirroring] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const refresh = useCallback(() => {
    loadRuns()
      .then(setRuns)
      .catch((e) => {
        setRuns([]);
        toast.error(toUserMessage(e, "Could not load backup history"));
      });
    loadHealth()
      .then(setHealth)
      .catch(() => setHealth([]));
    loadMirror()
      .then(setMirror)
      .catch(() => setMirror(null));
  }, [loadRuns, loadHealth, loadMirror]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function mirrorNow() {
    setMirroring(true);
    try {
      const r = await runMirror();
      toast.success(
        r.copied > 0
          ? `Copied ${r.copied} new file${r.copied === 1 ? "" : "s"}. ${r.alreadyPresent} were already backed up.`
          : `Nothing new to copy. All ${r.alreadyPresent} files already have a second copy.`,
      );
      refresh();
    } catch (e) {
      toast.error(toUserMessage(e, "Could not run the file backup"));
    } finally {
      setMirroring(false);
    }
  }

  async function downloadArchive(kind: "database" | "files") {
    const prefix = kind === "database" ? latest?.prefix : new Date().toISOString().slice(0, 10);
    if (!prefix) return;
    setArchiving(kind);
    try {
      const { url } = await archiveLink({ data: { kind, prefix } });
      // A plain navigation lets the browser stream the archive straight to disk.
      window.location.href = url;
      toast.success("Your download is starting. Keep this tab open until it finishes.");
    } catch (e) {
      toast.error(toUserMessage(e, "Could not prepare that download"));
    } finally {
      setArchiving(null);
    }
  }

  async function toggle(prefix: string) {
    if (open === prefix) {
      setOpen(null);
      return;
    }
    setOpen(prefix);
    setLoadingFiles(true);
    try {
      setFiles(await loadFiles({ data: { prefix } }));
    } catch (e) {
      setFiles([]);
      toast.error(toUserMessage(e, "Could not list backup files"));
    } finally {
      setLoadingFiles(false);
    }
  }

  async function download(prefix: string, file: string) {
    try {
      const { url } = await signFile({ data: { prefix, file } });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(toUserMessage(e, "Could not create a download link"));
    }
  }

  const dbRuns = (runs ?? []).filter((r) => (r.kind ?? "database") === "database");
  const latest = dbRuns[0] ?? null;
  const dbHealth = health?.find((h) => h.kind === "database") ?? null;
  const fileHealth = health?.find((h) => h.kind === "storage") ?? null;
  const staleAny = (dbHealth?.stale ?? false) || (fileHealth?.stale ?? false);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl">Backups</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The database is exported table by table every night at 3:45 AM UTC, and every uploaded
          song, photo and image is copied to a private second location at 4:15 AM UTC. Files are
          copied once and kept for 30 days after they are deleted. Code lives in GitHub, this covers
          the data.
        </p>
      </div>

      {health && (
        <div
          className={`rounded-2xl p-5 ring-1 ${
            staleAny ? "bg-rose-50 ring-rose-200" : "bg-card ring-ink/5"
          }`}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { h: dbHealth, label: "Database", detail: dbHealth ? `${dbHealth.table_count} tables · ${Number(dbHealth.row_count).toLocaleString()} rows` : "" },
              { h: fileHealth, label: "Uploaded files", detail: fileHealth ? `${fileHealth.object_count} files with a second copy` : "" },
            ].map(({ h, label, detail }) => (
              <div key={label}>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
                {!h || !h.last_success_at ? (
                  <p className="mt-1 text-sm font-medium text-rose-700">
                    No successful run recorded yet
                  </p>
                ) : (
                  <>
                    <p
                      className={`mt-1 text-sm font-medium ${h.stale ? "text-rose-700" : ""}`}
                    >
                      {h.stale ? "Overdue: last ran " : "Last ran "}
                      {formatTimestamp(h.last_success_at)}
                      {h.hours_since != null ? ` (${h.hours_since}h ago)` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">{detail}</p>
                  </>
                )}
              </div>
            ))}
          </div>
          {staleAny && (
            <p className="mt-4 text-xs text-rose-700">
              A scheduled backup has not completed in over 26 hours. You are emailed and texted once
              a day while this is true.
            </p>
          )}
        </div>
      )}

      <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Uploaded files</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {mirror
                ? `${mirror.mirrored} files copied (${humanBytes(mirror.bytes)}), ${mirror.retained} kept after deletion, ${mirror.failed} failed.`
                : "Loading file backup counts…"}
            </p>
          </div>
          <button
            onClick={mirrorNow}
            disabled={mirroring}
            className="min-h-[44px] rounded-full bg-ink px-4 text-sm font-medium text-paper disabled:opacity-60"
          >
            {mirroring ? "Copying…" : "Back up files now"}
          </button>
        </div>
        {mirror && mirror.buckets.length > 0 && (
          <ul className="mt-4 grid gap-1 text-xs sm:grid-cols-2">
            {mirror.buckets.map((b) => (
              <li key={b.bucket} className="flex justify-between gap-3">
                <span className="truncate text-muted-foreground">{b.bucket}</span>
                <span>
                  {b.mirrored} files · {humanBytes(b.bytes)}
                  {b.retained ? ` · ${b.retained} retained` : ""}
                  {b.failed ? ` · ${b.failed} failed` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
        <h3 className="text-sm font-medium">Keep your own copy</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Two downloads, and you have everything. The first is all{" "}
          {latest ? latest.table_count : ""} tables from the most recent nightly export in one
          archive. The second is every uploaded photo, image and song
          {mirror ? ` (${humanBytes(mirror.bytes)})` : ""}, which is the part with no other copy.
          A complete off-platform copy means taking both.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => downloadArchive("database")}
            disabled={!latest || archiving !== null}
            className="min-h-[44px] rounded-full bg-ink px-4 text-sm font-medium text-paper disabled:opacity-60"
          >
            {archiving === "database" ? "Preparing…" : "Download all tables"}
          </button>
          <button
            onClick={() => downloadArchive("files")}
            disabled={!mirror || mirror.mirrored === 0 || archiving !== null}
            className="min-h-[44px] rounded-full bg-secondary px-4 text-sm font-medium text-ink ring-1 ring-ink/10 disabled:opacity-60"
          >
            {archiving === "files" ? "Preparing…" : "Download all files"}
          </button>
        </div>
        <div className="mt-4 rounded-xl bg-secondary/40 p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-ink">What to do with them</p>
          <p className="mt-1">
            Do this once a week, on the same day, so you always have a recent copy. Each file is
            named by date, so you can tell at a glance which week you have. Save both to your own
            computer and, if you can, to one place that is not this computer either, such as an
            external drive or a cloud drive. Keep the last four weeks and delete anything older.
            You do not need to open them, only to keep them somewhere safe. Large downloads can
            take a few minutes, so leave the tab open until the file finishes.
          </p>
        </div>
      </div>


      <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
        <h3 className="mb-3 text-sm font-medium">Latest database export</h3>


        {runs === null ? (
          <p className="text-sm text-muted-foreground">Loading backup history…</p>
        ) : !latest ? (
          <p className="text-sm text-muted-foreground">
            No backup has run yet. The first one runs tonight at 3:45 AM UTC.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
            <span>
              <span className="text-muted-foreground">Last backup: </span>
              {formatTimestamp(latest.finished_at ?? latest.started_at)}
            </span>
            <span>
              <span className="text-muted-foreground">Tables: </span>
              {latest.table_count}
            </span>
            <span>
              <span className="text-muted-foreground">Rows: </span>
              {latest.row_count.toLocaleString()}
            </span>
            <span>
              <span className="text-muted-foreground">Size: </span>
              {humanBytes(latest.bytes)}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${
                latest.status === "success"
                  ? "bg-emerald-100 text-emerald-700"
                  : latest.status === "running"
                    ? "bg-secondary text-muted-foreground"
                    : "bg-rose-100 text-rose-700"
              }`}
            >
              {latest.status}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {dbRuns.map((r) => (
          <div key={r.id} className="rounded-2xl bg-card ring-1 ring-ink/5">
            <button
              onClick={() => toggle(r.prefix)}
              className="flex min-h-[44px] w-full flex-wrap items-center justify-between gap-3 px-5 py-3 text-left text-sm"
            >
              <span className="font-medium">{r.prefix}</span>
              <span className="text-muted-foreground">
                {r.table_count} tables · {r.row_count.toLocaleString()} rows ·{" "}
                {humanBytes(r.bytes)}
                {r.errors?.length ? ` · ${r.errors.length} table error(s)` : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {open === r.prefix ? "Hide files" : "View files"}
              </span>
            </button>
            {open === r.prefix && (
              <div className="border-t border-ink/5 px-5 py-3">
                {loadingFiles ? (
                  <p className="text-xs text-muted-foreground">Loading files…</p>
                ) : files.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No files found for this date (it may have been pruned).
                  </p>
                ) : (
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {files.map((f) => (
                      <li key={f.name} className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate">{f.name}</span>
                        <button
                          onClick={() => download(r.prefix, f.name)}
                          className="min-h-[44px] shrink-0 px-2 font-medium text-velvet hover:underline"
                        >
                          Download
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {r.errors?.length ? (
                  <ul className="mt-3 space-y-1 text-xs text-rose-700">
                    {r.errors.map((e) => (
                      <li key={e.table}>
                        {e.table}: {e.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Each file is a gzipped JSON export shaped as {"{"} table, exported_at, rows: [...] {"}"}. To
        restore one table, download the file, unzip it, and insert the rows back with the service
        role. See docs/disaster-recovery.md for the full restore steps.
      </p>
    </section>
  );
}
