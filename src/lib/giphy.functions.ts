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

async function callGiphy(path: string, params: Record<string, string>): Promise<GiphyResult[]> {
  const key = process.env.GIPHY_API_KEY;
  if (!key) throw new Error("GIPHY_API_KEY not configured");
  const qs = new URLSearchParams({ api_key: key, rating: "pg-13", ...params });
  const res = await fetch(`https://api.giphy.com/v1/gifs/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`Giphy ${res.status}`);
  const json = (await res.json()) as { data: GiphyItem[] };
  return (json.data ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    preview: g.images.fixed_height_small?.url ?? g.images.fixed_height?.url ?? "",
    url: g.images.downsized_medium?.url ?? g.images.original?.url ?? "",
    still:
      g.images.original_still?.url ??
      g.images.downsized_still?.url ??
      g.images.original?.url ??
      "",
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
