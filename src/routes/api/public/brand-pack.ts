// Owner download of the whole logo pack as one zip.
//
// Under /api/public/* only so the browser can fetch it as a plain file
// download. Every request must carry a short-lived HMAC ticket that only the
// allowlisted server function `getBrandKit` can mint. No ticket, no bytes.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/brand-pack")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const uid = url.searchParams.get("uid") ?? "";
        const exp = url.searchParams.get("exp") ?? "";
        const sig = url.searchParams.get("sig") ?? "";

        const { verifyBrandKitTicket, brandKitZip } = await import("@/lib/brand-kit.server");
        if (!(await verifyBrandKitTicket(uid, exp, sig))) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { stream, filename } = await brandKitZip();
          return new Response(stream, {
            headers: {
              "content-type": "application/zip",
              "content-disposition": `attachment; filename="${filename}"`,
              "cache-control": "no-store",
              "x-robots-tag": "noindex",
            },
          });
        } catch (e) {
          return new Response(e instanceof Error ? e.message : "Pack failed", { status: 500 });
        }
      },
    },
  },
});
