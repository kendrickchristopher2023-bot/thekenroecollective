/**
 * The scan code for one person's card, drawn on request.
 *
 * Drawn rather than stored so that adding a third person needs nothing from a
 * developer: create their card in the owner console and their code exists.
 *
 * The code encodes the card address only, never the contact details
 * themselves. A code carrying the details is fixed forever, scans badly at
 * business-card size, and would mean reprinting after a changed number.
 */
import { createFileRoute } from "@tanstack/react-router";

/** Error correction H, quiet zone four modules wide: the printing rules on /brand. */
const QR_OPTIONS = { errorCorrectionLevel: "H" as const, margin: 4 };

export const Route = createFileRoute("/api/public/card-qr/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const slug = String(params.slug ?? "")
          .replace(/\.(svg|png)$/i, "")
          .toLowerCase();
        if (!/^[a-z0-9-]{2,40}$/.test(slug)) return new Response("Not found", { status: 404 });

        const url = new URL(request.url);
        const format = url.searchParams.get("format") === "png" ? "png" : "svg";
        const small = url.searchParams.get("size") === "small";
        const target = `https://thekenroecollective.com/card/${slug}`;

        const QRCode = (await import("qrcode")).default;

        if (format === "svg") {
          // A vector stays sharp at any size, so its declared size only sets how
          // big it opens on screen. 512px is comfortable there; printers scale it.
          const svg = await QRCode.toString(target, { ...QR_OPTIONS, type: "svg", width: 512 });
          return new Response(svg, {
            headers: {
              "content-type": "image/svg+xml; charset=utf-8",
              "content-disposition": `attachment; filename="kenroe-card-qr-${slug}.svg"`,
              "cache-control": "public, max-age=3600",
            },
          });
        }

        // 900 px square is 3 inches at 300 dots per inch, so it can be placed
        // at any printed size down to the 0.8 inch minimum. The small file is
        // for dropping into documents and messages, where 900 px is unwieldy.
        const size = small ? 480 : 900;
        const dataUrl = await QRCode.toDataURL(target, { ...QR_OPTIONS, width: size, margin: 4 });
        const bytes = Uint8Array.from(atob(dataUrl.split(",")[1] ?? ""), (c) => c.charCodeAt(0));
        const name = small ? `kenroe-card-qr-${slug}-small.png` : `kenroe-card-qr-${slug}-900px-300dpi.png`;
        return new Response(bytes, {
          headers: {
            "content-type": "image/png",
            "content-disposition": `attachment; filename="${name}"`,
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
