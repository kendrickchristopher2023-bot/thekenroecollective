// Pure and client safe, so the GIF picker and tests share one parser.

/**
 * Turns a link copied from GIPHY into a direct GIF URL, or null when it is not
 * a GIPHY link. Accepts page links (giphy.com/gifs/some-title-ID) and media
 * links (media.giphy.com/media/ID/giphy.gif, i.giphy.com/ID.gif).
 */
export function giphyUrlFromLink(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  if (host !== "giphy.com" && !host.endsWith(".giphy.com")) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  // media0.giphy.com/media/<id>/giphy.gif, i.giphy.com/<id>.gif, and friends.
  const mediaAt = parts.indexOf("media");
  let id: string | undefined;
  if (mediaAt !== -1) {
    // Newer media links carry a version segment first: /media/v1.Y2lk.../<id>/giphy.gif
    const rest = parts.slice(mediaAt + 1).filter((p) => !p.startsWith("v1."));
    id = rest[0];
  } else if (parts[0] === "gifs" || parts[0] === "stickers" || parts[0] === "embed") {
    const last = parts[parts.length - 1] ?? "";
    id = last.includes("-") ? last.slice(last.lastIndexOf("-") + 1) : last;
  } else if (host === "i.giphy.com" && parts.length === 1) {
    id = parts[0]!.replace(/\.(gif|webp)$/i, "");
  }
  if (!id || !/^[A-Za-z0-9]+$/.test(id)) return null;
  return `https://media.giphy.com/media/${id}/giphy.gif`;
}
