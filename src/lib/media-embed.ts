import type { MediaKind } from "@/lib/events-store";

export function normalizeExternalMediaUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
}

export function getMediaEmbedUrl(input: string): string | null {
  const normalized = normalizeExternalMediaUrl(input);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);

    if (host === "youtu.be") {
      const id = parts[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host.endsWith("youtube.com")) {
      const id =
        url.searchParams.get("v") ||
        ((parts[0] === "shorts" || parts[0] === "live" || parts[0] === "embed") ? parts[1] : null);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host.endsWith("vimeo.com")) {
      const id = parts.find((part) => /^\d+$/.test(part));
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }

  return null;
}

export function inferMediaKindFromUrl(input: string, fallback: MediaKind): MediaKind {
  const normalized = normalizeExternalMediaUrl(input);
  if (getMediaEmbedUrl(normalized)) return "embed";
  if (/\.gif($|[?#])/i.test(normalized)) return "gif";
  if (/\.(mp4|webm|mov)($|[?#])/i.test(normalized)) return "video";
  if (/\.(png|jpe?g|webp|avif)($|[?#])/i.test(normalized)) return "image";
  return fallback;
}