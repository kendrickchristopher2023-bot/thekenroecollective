import { uploadAndRecord } from "@/lib/media-uploads.functions";
import type { KEvent } from "@/lib/events-store";

type UploadResult = { url?: string };

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 32_768;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

type UploadSource = "converter" | "invite" | "announcement" | "wall" | "design" | "rfq" | "other";

/**
 * Uploads a device file straight to cloud storage and returns its public URL.
 * Never keep the bytes in app state as a data URL: inline base64 blew past the
 * row-size limit on saved events before.
 */
export async function uploadMediaFile(
  file: File,
  options: { source?: UploadSource; filename?: string; altText?: string } = {},
): Promise<string> {
  const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  const result = (await uploadAndRecord({
    data: {
      filename: options.filename || file.name || `media-${Date.now()}`,
      originalFilename: file.name || undefined,
      contentType: file.type || "application/octet-stream",
      base64,
      source: options.source ?? "other",
      visibility: "public",
      ...(options.altText ? { altText: options.altText.slice(0, 280) } : {}),
    },
  })) as UploadResult;
  if (!result.url) throw new Error("Upload did not return a URL.");
  return result.url;
}

export async function uploadEventMedia(file: File, filename = file.name): Promise<string> {
  return uploadMediaFile(file, { source: "invite", filename });
}


function dataUrlFile(value: string, stem: string): File | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(value);
  if (!match) return null;
  const contentType = match[1] || "application/octet-stream";
  const base64 = match[2];
  if (!base64) return null;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const extension = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
  return new File([bytes], `${stem}.${extension}`, { type: contentType });
}

async function uploadInline(value: string | undefined, stem: string): Promise<string | undefined> {
  if (!value?.startsWith("data:")) return value;
  const file = dataUrlFile(value, stem);
  if (!file) throw new Error(`The saved ${stem} could not be prepared for upload.`);
  return uploadEventMedia(file, file.name);
}

/**
 * Removes legacy data URLs before an event is sent to the cloud. Older event
 * editors stored photos/audio inside the JSON document, making every small
 * edit re-send several megabytes. The local event is only replaced after all
 * uploads succeed, so an interrupted migration cannot lose the original.
 */
export async function externalizeInlineEventMedia(
  event: KEvent,
  uploader: (file: File, filename?: string) => Promise<string> = uploadEventMedia,
): Promise<KEvent> {
  let changed = false;
  const replace = async (value: string | undefined, stem: string) => {
    if (!value?.startsWith("data:")) return value;
    const file = dataUrlFile(value, stem);
    if (!file) throw new Error(`The saved ${stem} could not be prepared for upload.`);
    const next = await uploader(file, file.name);
    if (next !== value) changed = true;
    return next;
  };

  const [image, logo, themeArt, voiceMessage] = await Promise.all([
    replace(event.image, `event-${event.id}-hero`),
    replace(event.logo, `event-${event.id}-logo`),
    replace(event.themeArt, `event-${event.id}-theme-art`),
    replace(event.voiceMessage, `event-${event.id}-voice`),
  ]);
  const hosts = await Promise.all(
    (event.hosts ?? []).map(async (host, index) => ({
      ...host,
      photo: await replace(host.photo, `event-${event.id}-host-${index + 1}`),
    })),
  );
  const inviteMedia = await Promise.all(
    (event.inviteMedia ?? []).map(async (item, index) => ({
      ...item,
      url: (await replace(item.url, `event-${event.id}-gallery-${index + 1}`)) ?? item.url,
    })),
  );
  const thankYouCards = await Promise.all(
    (event.thankYouCards ?? []).map(async (card, index) => ({
      ...card,
      photo: await replace(card.photo, `event-${event.id}-thank-you-${index + 1}`),
    })),
  );

  return changed
    ? { ...event, image, logo, themeArt, voiceMessage, hosts, inviteMedia, thankYouCards }
    : event;
}