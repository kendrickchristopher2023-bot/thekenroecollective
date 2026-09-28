// Nightly full-database export to private cloud storage (bucket: db-backups).
//
// Why this exists: GitHub holds the code, but every row of live data (events,
// guests, RSVPs, vendors, payments) exists only in the managed Postgres. This
// job is the only owner-controlled, restorable copy of that data.
//
// Design notes:
// - Schema-driven: the table list comes from public.list_backup_tables(), so a
//   table added later is backed up automatically instead of being silently
//   missed by a hand-written list.
// - One gzipped JSON file per table at db-backups/<YYYY-MM-DD>/<table>.json.gz
//   plus a manifest.json describing the run.
// - Retention: folders older than RETENTION_DAYS are pruned each run.
// - Every run is logged to public.backup_runs so owners can see the last
//   successful backup without shell access.
import { createFileRoute } from "@tanstack/react-router";

const BUCKET = "db-backups";
const PAGE_SIZE = 1000;
const MAX_ROWS_PER_TABLE = 200_000;
const RETENTION_DAYS = 30;

type TableResult = {
  table: string;
  rows: number;
  bytes: number;
  truncated: boolean;
  path: string;
};

async function gzip(text: string): Promise<{ body: BodyInit; ext: string; type: string }> {
  const bytes = new TextEncoder().encode(text);
  try {
    const CS = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream;
    if (!CS) throw new Error("no CompressionStream");
    const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new CS("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    return { body: buf, ext: "json.gz", type: "application/gzip" };
  } catch {
    return { body: bytes as unknown as BodyInit, ext: "json", type: "application/json" };
  }
}

export const Route = createFileRoute("/api/public/hooks/db-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronSecret(request))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const startedAt = new Date();
        const prefix = startedAt.toISOString().slice(0, 10);
        const errors: { table: string; message: string }[] = [];
        const results: TableResult[] = [];

        const { data: runRow } = await supabaseAdmin
          .from("backup_runs" as never)
          .insert({ prefix, status: "running" } as never)
          .select("id")
          .maybeSingle();
        const runId = (runRow as { id?: string } | null)?.id ?? null;

        // ---- table list (schema-driven) ---------------------------------
        const { data: tableList, error: listErr } = await supabaseAdmin.rpc(
          "list_backup_tables" as never,
        );
        if (listErr || !Array.isArray(tableList)) {
          const message = listErr?.message ?? "could not list tables";
          if (runId) {
            await supabaseAdmin
              .from("backup_runs" as never)
              .update({
                status: "failed",
                finished_at: new Date().toISOString(),
                errors: [{ table: "*", message }],
              } as never)
              .eq("id", runId);
          }
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
        const tables = (tableList as unknown[]).map((t) =>
          typeof t === "string" ? t : String((t as { relname?: string }).relname ?? ""),
        ).filter(Boolean);

        // ---- export each table ------------------------------------------
        for (const table of tables) {
          try {
            const rows: unknown[] = [];
            let truncated = false;
            for (let from = 0; from < MAX_ROWS_PER_TABLE; from += PAGE_SIZE) {
              const { data, error } = await supabaseAdmin
                .from(table as never)
                .select("*")
                .range(from, from + PAGE_SIZE - 1);
              if (error) throw new Error(error.message);
              const page = (data ?? []) as unknown[];
              rows.push(...page);
              if (page.length < PAGE_SIZE) break;
              if (rows.length >= MAX_ROWS_PER_TABLE) {
                truncated = true;
                break;
              }
            }

            const json = JSON.stringify({ table, exported_at: startedAt.toISOString(), rows });
            const { body, ext, type } = await gzip(json);
            const path = `${prefix}/${table}.${ext}`;
            const size =
              body instanceof ArrayBuffer ? body.byteLength : (body as Uint8Array).byteLength;

            const { error: upErr } = await supabaseAdmin.storage
              .from(BUCKET)
              .upload(path, body as ArrayBuffer, { contentType: type, upsert: true });
            if (upErr) throw new Error(upErr.message);

            results.push({ table, rows: rows.length, bytes: size, truncated, path });
          } catch (e) {
            errors.push({ table, message: (e instanceof Error ? e.message : String(e)) });
          }
        }

        // ---- manifest ----------------------------------------------------
        const totalRows = results.reduce((a, r) => a + r.rows, 0);
        const totalBytes = results.reduce((a, r) => a + r.bytes, 0);
        const manifest = {
          prefix,
          started_at: startedAt.toISOString(),
          finished_at: new Date().toISOString(),
          table_count: results.length,
          row_count: totalRows,
          bytes: totalBytes,
          tables: results,
          errors,
          format: "one gzipped JSON file per table: { table, exported_at, rows: [...] }",
        };
        try {
          await supabaseAdmin.storage
            .from(BUCKET)
            .upload(`${prefix}/manifest.json`, new TextEncoder().encode(
              JSON.stringify(manifest, null, 2),
            ) as unknown as ArrayBuffer, {
              contentType: "application/json",
              upsert: true,
            });
        } catch {
          /* manifest is a convenience, not the backup itself */
        }

        // ---- retention prune ---------------------------------------------
        try {
          const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000)
            .toISOString()
            .slice(0, 10);
          const { data: folders } = await supabaseAdmin.storage.from(BUCKET).list("", { limit: 400 });
          for (const folder of folders ?? []) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(folder.name) || folder.name >= cutoff) continue;
            const { data: files } = await supabaseAdmin.storage
              .from(BUCKET)
              .list(folder.name, { limit: 500 });
            const paths = (files ?? []).map((f) => `${folder.name}/${f.name}`);
            if (paths.length) await supabaseAdmin.storage.from(BUCKET).remove(paths);
          }
        } catch {
          /* pruning failure must not fail the backup */
        }

        if (runId) {
          await supabaseAdmin
            .from("backup_runs" as never)
            .update({
              status: errors.length ? "partial" : "success",
              finished_at: manifest.finished_at,
              table_count: results.length,
              row_count: totalRows,
              bytes: totalBytes,
              tables: results,
              errors,
            } as never)
            .eq("id", runId);
        }

        return Response.json({ ok: errors.length === 0, ...manifest });
      },
    },
  },
});
