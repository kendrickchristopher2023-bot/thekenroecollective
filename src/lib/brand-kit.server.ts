// The Kenroe Collective logo pack, private side.
//
// The full pack lives in the private `brand-kit` storage bucket (never in
// public/). Only two logo files stay public because the public site itself
// uses them: the horizontal logo on /card/<name> pages and in email
// signatures, and the link-preview picture for those card pages.
//
// Owners reach the rest through short-lived signed links minted by the
// allowlisted server function in brand-kit.functions.ts, and through a zip
// route that demands a short-lived HMAC ticket only that function can mint.
import { createHmac, timingSafeEqual } from "crypto";
import { BRAND_ASSETS, BRAND_FILMS, BRAND_VOICE_PREVIEWS, brandGuidelinesText } from "@/lib/brand-assets";

export const BRAND_KIT_BUCKET = "brand-kit";

/** How long a signed file link or zip ticket stays valid. */
export const BRAND_LINK_TTL_SECONDS = 15 * 60;

async function ticketSecret(): Promise<string> {
  const { getCronSharedSecret } = await import("@/lib/cron-auth.server");
  const s = await getCronSharedSecret();
  if (!s) throw new Error("Download links are unavailable right now");
  return s;
}

function sign(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Mint a signed, short-lived ticket for the whole-pack zip. */
export async function mintBrandKitTicket(userId: string) {
  const exp = Date.now() + BRAND_LINK_TTL_SECONDS * 1000;
  const sig = sign(await ticketSecret(), `brand-kit:${userId}:${exp}`);
  return { uid: userId, exp, sig };
}

export async function verifyBrandKitTicket(uid: string, exp: string, sig: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(uid)) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false;
  try {
    const expected = sign(await ticketSecret(), `brand-kit:${uid}:${expNum}`);
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** One short-lived signed link per file in the pack, keyed by file name. */
export async function signedBrandAssetUrls(): Promise<Record<string, string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const paths = BRAND_ASSETS.map((a) => a.file);
  const { data, error } = await supabaseAdmin.storage
    .from(BRAND_KIT_BUCKET)
    .createSignedUrls(paths, BRAND_LINK_TTL_SECONDS, { download: true });
  if (error) throw new Error(error.message);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl && !row.error) out[row.path] = row.signedUrl;
  }
  return out;
}

/** Signed links for the owner listening samples; a missing file is left out. */
export async function signedBrandPreviewUrls(): Promise<Record<string, string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage
    .from(BRAND_KIT_BUCKET)
    .createSignedUrls(BRAND_VOICE_PREVIEWS.map((a) => a.file), BRAND_LINK_TTL_SECONDS);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl && !row.error) out[row.path] = row.signedUrl;
  }
  return out;
}

/**
 * Signed links for the rough cut films and their contact sheets. Same private
 * bucket, same short life as everything else on the Brand page: a link that
 * escapes the page dies within the quarter hour. A missing file is left out so
 * one unfinished cut cannot blank the section.
 */
export async function signedBrandFilmUrls(): Promise<Record<string, string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const paths = BRAND_FILMS.flatMap((f) => [f.file, f.sheet]);
  const { data } = await supabaseAdmin.storage
    .from(BRAND_KIT_BUCKET)
    .createSignedUrls(paths, BRAND_LINK_TTL_SECONDS);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl && !row.error) out[row.path] = row.signedUrl;
  }
  return out;
}

/** The whole pack as one zip, built file by file from private storage. */
export async function brandKitZip(): Promise<{ stream: ReadableStream<Uint8Array>; filename: string }> {
  const { zipStream } = await import("@/lib/backup-archive.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const stamp = new Date().toISOString().slice(0, 10);
  const folder = `kenroe-logo-pack-${stamp}`;

  const entries = async function* () {
    yield {
      name: `${folder}/READ ME (logo use).txt`,
      bytes: new TextEncoder().encode(brandGuidelinesText()),
    };
    for (const asset of BRAND_ASSETS) {
      const { data, error } = await supabaseAdmin.storage.from(BRAND_KIT_BUCKET).download(asset.file);
      const bytes = data && !error ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array();
      // A pack that quietly leaves a file out is worse than a pack that
      // fails: the gap is only found at the printer. Break instead.
      if (bytes.length === 0) throw new Error(`Missing brand file: ${asset.file}`);
      yield { name: `${folder}/${asset.file}`, bytes };
    }
  };

  return { stream: zipStream(entries), filename: `${folder}.zip` };
}
