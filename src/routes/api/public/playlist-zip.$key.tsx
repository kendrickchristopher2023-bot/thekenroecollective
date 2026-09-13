/**
 * Download a whole playlist as a zip.
 *
 * The share key is the credential, exactly as it is for the listen page, so a
 * family member with the link can save the collection. Files inside the zip are
 * named from the piece titles and numbered in playing order, never by their
 * storage UUID.
 */
import { createFileRoute } from "@tanstack/react-router";
import JSZip from "jszip";
import { readSharedPlaylist } from "@/lib/sound-playlists.functions";
import { playlistFileNames, playlistZipName } from "@/lib/sound-download-name";

/** Sane ceilings so one link cannot ask the worker for an unbounded download. */
const MAX_FILES = 24;
const MAX_TOTAL_BYTES = 120 * 1024 * 1024;

export const Route = createFileRoute("/api/public/playlist-zip/$key")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = String(params.key ?? "").slice(0, 80);
        if (key.length < 6) return new Response("Not found", { status: 404 });

        const found = await readSharedPlaylist(key);
        if (!found || !found.rows.length) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rows = found.rows.slice(0, MAX_FILES);
        const names = playlistFileNames(rows.map((r) => r.title ?? "Untitled"));

        const zip = new JSZip();
        let total = 0;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const bucket = row.storage_bucket || "sound-pieces";
          const { data, error } = await supabaseAdmin.storage
            .from(bucket)
            .download(row.storage_path as string);
          if (error || !data) continue;
          const bytes = new Uint8Array(await data.arrayBuffer());
          total += bytes.byteLength;
          if (total > MAX_TOTAL_BYTES) break;
          zip.file(names[i], bytes);
        }

        const body = await zip.generateAsync({ type: "arraybuffer", compression: "STORE" });
        return new Response(body, {
          headers: {
            "content-type": "application/zip",
            "content-disposition": `attachment; filename="${playlistZipName(found.name)}"`,
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
