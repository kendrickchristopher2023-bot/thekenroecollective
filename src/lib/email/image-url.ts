/**
 * Email clients only render images from absolute, publicly reachable https
 * URLs. A `data:`, `blob:` or relative URL renders perfectly in the browser
 * preview and then silently disappears in the inbox, which is exactly how a
 * host ends up believing the recipient saw something they never got.
 *
 * Every template image prop is passed through here on the send path, so the
 * rule is enforced once instead of per template.
 */

/** Hosts we are willing to hotlink from inside a trusted-domain email. */
const ALLOWED_IMAGE_HOSTS = [
  "thekenroecollective.com",
  "kenroecollective.com",
  "kenroes.com",
  "lovable.app",
  "giphy.com",
  "supabase.co",
];

/** Template data keys that end up as an <img src> in a rendered email. */
export const EMAIL_IMAGE_KEYS = [
  "gif",
  "photo",
  "image",
  "coverImage",
  "logo",
  "heroImage",
  "imageUrl",
] as const;

export function isEmailSafeImageUrl(raw: string | undefined | null, extraHost?: string): boolean {
  const value = (raw ?? "").trim();
  if (!value) return false;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (extraHost && host === extraHost.toLowerCase()) return true;
    return ALLOWED_IMAGE_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Returns the URL when it will actually load in an inbox, else undefined. */
export function emailSafeImageUrl(raw: string | undefined | null, extraHost?: string): string | undefined {
  const value = (raw ?? "").trim();
  return isEmailSafeImageUrl(value, extraHost) ? value : undefined;
}

/**
 * Strips every unusable image URL out of template data and reports which keys
 * were dropped so the caller can tell the host instead of failing quietly.
 */
export function sanitizeEmailImageData<T extends Record<string, unknown>>(
  data: T,
  extraHost?: string,
): { data: T; dropped: string[] } {
  const next: Record<string, unknown> = { ...data };
  const dropped: string[] = [];
  for (const key of EMAIL_IMAGE_KEYS) {
    const val = next[key];
    if (typeof val !== "string" || !val.trim()) continue;
    if (!isEmailSafeImageUrl(val, extraHost)) {
      delete next[key];
      dropped.push(key);
    }
  }
  return { data: next as T, dropped };
}

/**
 * Outlook (desktop) shows the first frame of a GIF only, and large files get
 * stripped or load badly on mobile data. 1.5 MB is the practical ceiling.
 */
export const EMAIL_GIF_MAX_BYTES = 1_500_000;

export function isBrowserOnlyMediaUrl(raw: string | undefined | null): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v.startsWith("data:") || v.startsWith("blob:") || v.startsWith("/") || v.startsWith("./");
}
