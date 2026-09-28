// Group eCards — shared helpers for the four independent attachment slots.
// Pure and client safe, so the contribution forms, the organizer dashboard and
// the server functions all agree on labels and on storage paths.

export type EcardMediaSlot = "gif" | "image" | "video" | "audio";

export const ECARD_MEDIA_SLOT_LABEL: Record<EcardMediaSlot, string> = {
  gif: "GIF",
  image: "photo",
  video: "video",
  audio: "voice note",
};

/** Button copy, for example "Remove voice note". */
export function removeMediaLabel(slot: EcardMediaSlot): string {
  return `Remove ${ECARD_MEDIA_SLOT_LABEL[slot]}`;
}

/**
 * Quick confirmation before a removal. Only the one attachment goes, the
 * message text and every other attachment stay exactly as they are.
 */
export async function confirmRemoveMedia(slot: EcardMediaSlot): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const label = ECARD_MEDIA_SLOT_LABEL[slot];
  // Loaded lazily so this module stays pure and server safe.
  const { confirmDialog } = await import("@/lib/confirm-dialog");
  return confirmDialog({
    title: `Remove this ${label}?`,
    body: "The message text and any other attachments stay exactly as they are.",
    confirmLabel: "Yes, remove it",
  });
}

const BUCKET = "ecard-media";

/**
 * Storage object path inside the ecard-media bucket, or null when the URL
 * points somewhere else, for example a Giphy URL. Used so a removal deletes
 * only that one uploaded file.
 */
export function ecardMediaPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const raw = url.slice(at + marker.length).split("?")[0] ?? "";
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
