// Nightly incremental mirror of uploaded files into the private
// `storage-backups` bucket. See src/lib/storage-backup.server.ts for the design.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/storage-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronSecret(request))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { runStorageBackup } = await import("@/lib/storage-backup.server");
        try {
          const result = await runStorageBackup();
          return Response.json(result, { status: result.ok ? 200 : 207 });
        } catch (e) {
          console.error("[storage-backup] run failed", e);
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
