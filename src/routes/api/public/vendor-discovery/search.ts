import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const SearchInput = z.object({
  categoryQuery: z.string().trim().min(2).max(120),
  // A whitespace-only location previously passed min(2) untrimmed, silently
  // burning a billed Google call on an effectively empty location filter.
  location: z.string().trim().min(2).max(120),
  term: z.string().trim().max(120).optional(),
});

// Cheap "Pro" tier field mask — deliberately excludes rating, review count,
// phone, and website: requesting any of those bumps the ENTIRE Text Search
// call from Pro ($32/1k) to the pricier Enterprise SKU. Those fields are
// fetched on-demand for a single business via /vendor-discovery/details,
// which only fires when a host actually opens a card, not on every search.
// photos.authorAttributions stays in the Pro tier and is required whenever
// a photo with a named author is displayed — see Google's Places API
// attribution policy.
const SEARCH_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.photos,places.photos.authorAttributions,places.primaryTypeDisplayName,places.googleMapsUri";

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string }[] }[];
  primaryTypeDisplayName?: { text?: string };
  googleMapsUri?: string;
};

export type DiscoveredBusiness = {
  id: string;
  name: string;
  address: string | null;
  categoryLabel: string | null;
  mapsUrl: string | null;
  photoName: string | null;
  photoAuthor: { name: string; uri: string | null } | null;
};

async function hashQuery(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

// Search results (name/address/photos) are stable for days at a time, so a
// long cache directly cuts paid API calls — the whole point of moving off a
// flat monthly Yelp bill was to stop paying for traffic that never happens.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

async function readCache(key: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("vendor_search_cache")
      .select("payload, fetched_at")
      .eq("query_hash", key)
      .maybeSingle();
    return data as { payload: { businesses?: DiscoveredBusiness[] }; fetched_at: string } | null;
  } catch {
    return null;
  }
}

async function writeCache(key: string, payload: { businesses: DiscoveredBusiness[] }) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("vendor_search_cache")
      .upsert({ query_hash: key, payload, fetched_at: new Date().toISOString() });
  } catch {
    // Cache failures should never interrupt vendor discovery.
  }
}

export const Route = createFileRoute("/api/public/vendor-discovery/search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Signed-in callers only: every uncached search is a billed Google
        // Places call, so anonymous traffic must not be able to reach it.
        const { requireBearerUser } = await import("@/lib/api-auth.server");
        const auth = await requireBearerUser(request);
        if (auth.response) return auth.response;

        const { enforceIpRateLimit } = await import("@/lib/rate-limit.server");
        // Every uncached call is billed by Google — this is the guardrail
        // against a scripted loop quietly running up the bill the way the
        // flat-fee Yelp plan never forced anyone to think about.
        const limited = enforceIpRateLimit(request, { scope: "vendor-discovery-search", max: 30, windowMs: 60_000 });
        if (limited) return limited;

        const parsed = SearchInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ businesses: [], cached: false, error: "Enter a valid location and search." }, { status: 400 });
        }

        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (!apiKey) {
          return Response.json({ businesses: [], cached: false, error: "Vendor search is not configured yet." });
        }

        const data = parsed.data;
        const textQuery = [data.categoryQuery, data.term, `in ${data.location}`].filter(Boolean).join(" ");
        const key = await hashQuery(`v2:${textQuery.toLowerCase()}`);

        const cached = await readCache(key);
        if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
          return Response.json({ businesses: cached.payload?.businesses ?? [], cached: true });
        }

        try {
          const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": SEARCH_FIELD_MASK,
            },
            // Text Search bills per request, not per result — pageSize is a
            // free lever, so ask for the API max rather than under-fetching.
            body: JSON.stringify({ textQuery, pageSize: 20 }),
          });
          if (!res.ok) {
            const text = await res.text();
            console.error(`[vendor-discovery search] upstream ${res.status}: ${text.slice(0, 500)}`);
            return Response.json({
              businesses: [],
              cached: false,
              error: "Vendor search is temporarily unavailable. Try again shortly.",
            });
          }
          const json = (await res.json()) as { places?: GooglePlace[] };
          const businesses: DiscoveredBusiness[] = (json.places ?? []).map((p) => {
            const author = p.photos?.[0]?.authorAttributions?.[0];
            return {
              id: p.id,
              name: p.displayName?.text ?? "Unnamed business",
              address: p.formattedAddress ?? null,
              categoryLabel: p.primaryTypeDisplayName?.text ?? null,
              mapsUrl: p.googleMapsUri ?? null,
              photoName: p.photos?.[0]?.name ?? null,
              // Google requires crediting a photo's author wherever it's shown.
              photoAuthor: author?.displayName ? { name: author.displayName, uri: author.uri ?? null } : null,
            };
          });
          await writeCache(key, { businesses });
          return Response.json({ businesses, cached: false });
        } catch (error) {
          console.error("[vendor-discovery search] request failed", error);
          return Response.json({
            businesses: [],
            cached: false,
            error: "Vendor search is temporarily unavailable. Try again shortly.",
          });
        }
      },
    },
  },
});
