import { createServerFn } from "@tanstack/react-start";

type GiphyImage = { url: string; width: string; height: string };
type GiphyItem = {
  id: string;
  title: string;
  images: {
    fixed_height_small?: GiphyImage;
    fixed_height?: GiphyImage;
    original?: GiphyImage;
    original_still?: GiphyImage;
    downsized_medium?: GiphyImage;
    downsized_still?: GiphyImage;
  };
};

export type GiphyResult = {
  id: string;
  title: string;
  preview: string;
  url: string;
  /**
   * Frozen frame of the same asset. Used where a moving backdrop would fight
   * the invitation type: the host can pick a real photographic still instead
   * of an animation.
   */
  still: string;
};

/**
 * Shown when the GIPHY key is missing, expired or rejected (401/403). The
 * owner fixes it by updating the GIPHY_API_KEY secret; until then people can
 * still paste a GIPHY link into the picker.
 */
const GIPHY_UNAVAILABLE =
  "GIF search is not available right now. You can still paste a GIPHY link below.";

async function callGiphy(path: string, params: Record<string, string>): Promise<GiphyResult[]> {
  const key = process.env.GIPHY_API_KEY?.trim();
  if (!key) {
    console.error("[giphy] GIPHY_API_KEY secret is not set");
    throw new Error(GIPHY_UNAVAILABLE);
  }
  const qs = new URLSearchParams({ api_key: key, rating: "pg-13", ...params });
  let res: Response;
  try {
    res = await fetch(`https://api.giphy.com/v1/gifs/${path}?${qs.toString()}`, {
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    console.error("[giphy] request failed", error);
    throw new Error("GIF search did not respond. Please try again in a moment.");
  }
  if (!res.ok) {
    // Logged in full for the owner; the sentence below is what people see.
    console.error(
      `[giphy] ${path} returned ${res.status}`,
      (await res.text().catch(() => "")).slice(0, 300),
    );
    if (res.status === 429) {
      throw new Error(
        "GIF search is busy right now. Please try again in a few minutes, or paste a GIPHY link.",
      );
    }
    throw new Error(GIPHY_UNAVAILABLE);
  }
  const json = (await res.json()) as { data: GiphyItem[] };
  return (json.data ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    preview: g.images.fixed_height_small?.url ?? g.images.fixed_height?.url ?? "",
    url: g.images.downsized_medium?.url ?? g.images.original?.url ?? "",
    still:
      g.images.original_still?.url ?? g.images.downsized_still?.url ?? g.images.original?.url ?? "",
  }));
}

export const searchGiphy = createServerFn({ method: "GET" })
  .inputValidator((data: { query: string; offset?: number; limit?: number }) => ({
    query: String(data.query ?? "").slice(0, 100),
    offset: Math.max(0, Math.min(Number(data.offset ?? 0), 500)),
    limit: Math.max(1, Math.min(Number(data.limit ?? 24), 50)),
  }))
  .handler(async ({ data }) => {
    if (!data.query.trim()) {
      return callGiphy("trending", { offset: String(data.offset), limit: String(data.limit) });
    }
    return callGiphy("search", {
      q: data.query,
      offset: String(data.offset),
      limit: String(data.limit),
    });
  });
