import { createFileRoute } from "@tanstack/react-router";

// Google Places Photos (New) requires an authenticated request per image —
// there's no public CDN URL like Yelp's image_url. Proxying it server-side
// is the only way to show photos without putting our API key in a client
// <img src>, where anyone could lift it straight out of page source.
const PHOTO_NAME_RE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export const Route = createFileRoute("/api/public/vendor-discovery/photo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Photo media calls are billed too. The client fetches these with a
        // bearer token and renders them from a blob URL (see
        // vendor-discovery.tsx) — a bare <img src> can't send the header.
        const { requireBearerUser } = await import("@/lib/api-auth.server");
        const auth = await requireBearerUser(request);
        if (auth.response) return new Response("Unauthorized", { status: 401 });

        const url = new URL(request.url);
        const name = url.searchParams.get("name") ?? "";
        if (!PHOTO_NAME_RE.test(name)) {
          return new Response("Not found", { status: 404 });
        }

        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (!apiKey) return new Response("Not found", { status: 404 });

        const { enforceIpRateLimit } = await import("@/lib/rate-limit.server");
        // Higher ceiling than search/details — one results grid loads up to
        // 12 photos at once.
        const limited = enforceIpRateLimit(request, { scope: "vendor-discovery-photo", max: 120, windowMs: 60_000 });
        if (limited) return limited;

        try {
          const upstream = await fetch(
            `https://places.googleapis.com/v1/${name}/media?maxWidthPx=480&key=${encodeURIComponent(apiKey)}`,
          );
          if (!upstream.ok || !upstream.body) {
            return new Response("Not found", { status: 404 });
          }
          const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
          return new Response(upstream.body, {
            headers: {
              "content-type": contentType,
              // Photos are effectively immutable per place — cache hard so
              // repeat views never re-hit Google (or us) for the same image.
              "cache-control": "public, max-age=604800, immutable",
            },
          });
        } catch (error) {
          console.error("[vendor-discovery photo] request failed", error);
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
