// Owner download of a complete backup archive.
//
// Under /api/public/* so the browser can fetch it as a plain file download, but
// every request must carry a short-lived HMAC ticket that only the owner-gated
// server function `createBackupArchiveLink` can mint. No ticket, no data.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/backup-archive")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const kind = url.searchParams.get("kind") ?? "";
        const prefix = url.searchParams.get("prefix") ?? "";
        const exp = url.searchParams.get("exp") ?? "";
        const sig = url.searchParams.get("sig") ?? "";

        const { verifyArchiveTicket, databaseArchive, filesArchive } = await import(
          "@/lib/backup-archive.server"
        );
        if (!(await verifyArchiveTicket(kind, prefix, exp, sig))) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const stream =
            kind === "database" ? await databaseArchive(prefix) : await filesArchive(prefix);
          const filename =
            kind === "database"
              ? `kenroe-database-${prefix}.zip`
              : `kenroe-files-${prefix}.zip`;
          return new Response(stream, {
            headers: {
              "content-type": "application/zip",
              "content-disposition": `attachment; filename="${filename}"`,
              "cache-control": "no-store",
            },
          });
        } catch (e) {
          return new Response(e instanceof Error ? e.message : "Archive failed", { status: 500 });
        }
      },
    },
  },
});
