import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const DetailsInput = z.object({
  placeId: z.string().min(2).max(160),
});

// "Enterprise" tier fields — deliberately kept OUT of the search field mask
// (see search.ts) and only ever requested here, for one place at a time,
// when a host actually opens a card. Most searches never reach this route.
const DETAILS_FIELD_MASK =
  "id,nationalPhoneNumber,internationalPhoneNumber,websiteUri,rating,userRatingCount,regularOpeningHours.openNow";

export type PlaceDetails = {
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  openNow: boolean | null;
};

async function readCache(key: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("vendor_search_cache")
      .select("payload, fetched_at")
      .eq("query_hash", key)
      .maybeSingle();
    return data as { payload: PlaceDetails; fetched_at: string } | null;
  } catch {
    return null;
  }
}

async function writeCache(key: string, payload: PlaceDetails) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("vendor_search_cache")
      .upsert({ query_hash: key, payload: payload as any, fetched_at: new Date().toISOString() });
  } catch {
    // Cache failures should never block the details view.
  }
}

// Phone numbers and ratings change rarely — cache far longer than the
// search results themselves to keep this on-demand, per-business call cheap.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const Route = createFileRoute("/api/public/vendor-discovery/details")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireBearerUser } = await import("@/lib/api-auth.server");
        const auth = await requireBearerUser(request);
        if (auth.response) return auth.response;

        const { enforceIpRateLimit } = await import("@/lib/rate-limit.server");
        const limited = enforceIpRateLimit(request, { scope: "vendor-discovery-details", max: 40, windowMs: 60_000 });
        if (limited) return limited;

        const parsed = DetailsInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: "Missing place id." }, { status: 400 });
        }

        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "Vendor search is not configured yet." });
        }

        const placeId = parsed.data.placeId;
        const key = `details:v1:${placeId}`;
        const cached = await readCache(key);
        if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
          return Response.json({ ...cached.payload, cached: true });
        }

        try {
          const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
            headers: {
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": DETAILS_FIELD_MASK,
            },
          });
          if (!res.ok) {
            const text = await res.text();
            console.error(`[vendor-discovery details] upstream ${res.status}: ${text.slice(0, 500)}`);
            return Response.json({ error: "Details are temporarily unavailable." });
          }
          const json = (await res.json()) as {
            nationalPhoneNumber?: string;
            internationalPhoneNumber?: string;
            websiteUri?: string;
            rating?: number;
            userRatingCount?: number;
            regularOpeningHours?: { openNow?: boolean };
          };
          const payload: PlaceDetails = {
            phone: json.nationalPhoneNumber ?? json.internationalPhoneNumber ?? null,
            website: json.websiteUri ?? null,
            rating: typeof json.rating === "number" ? json.rating : null,
            reviewCount: typeof json.userRatingCount === "number" ? json.userRatingCount : null,
            openNow: typeof json.regularOpeningHours?.openNow === "boolean" ? json.regularOpeningHours.openNow : null,
          };
          await writeCache(key, payload);
          return Response.json({ ...payload, cached: false });
        } catch (error) {
          console.error("[vendor-discovery details] request failed", error);
          return Response.json({ error: "Details are temporarily unavailable." });
        }
      },
    },
  },
});
