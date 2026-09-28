// Group eCards — delivery worker. Server-only.
//
// Sends the reveal link to the recipient once the reveal moment has passed,
// but ONLY for cards that have been paid for. Marks delivered_at so a card is
// never emailed twice, and notifies the organizer that it went out.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { enqueueTransactionalEmailServer } from "@/lib/email/server-enqueue.server";
import { ROOT_DOMAIN } from "@/lib/email/sender-domain";
import { formatDateTimeInZone } from "@/lib/ecards-time";
import { emailSafeImageUrl } from "@/lib/email/image-url";
import { resolveMedia, type MediaBearing } from "@/components/ecard-media";

/**
 * Emails have no live viewer, so a reveal time is always labelled with an
 * explicit zone: the organizer's stored zone when we have one, otherwise this
 * sensible US default.
 */
export const ECARD_EMAIL_FALLBACK_TZ = "America/New_York";

export const ECARD_SITE_ORIGIN = `https://${ROOT_DOMAIN}`;

export type DeliverableCard = {
  id: string;
  occasion: string;
  recipient_name: string;
  recipient_email: string | null;
  public_slug: string;
  organizer_user_id: string;
  theme: string;
  reveal_date?: string | null;
  organizer_timezone?: string | null;
};

function adminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function organizerEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Send one card. Assumes the caller already checked payment and timing.
 * Returns whether the recipient email was queued.
 */
export async function deliverEcard(
  admin: SupabaseClient,
  card: DeliverableCard,
): Promise<{ ok: boolean; reason?: string }> {
  if (!card.recipient_email) return { ok: false, reason: "no_recipient_email" };

  const revealUrl = `${ECARD_SITE_ORIGIN}/r/${card.public_slug}`;
  const count = await admin
    .from("ecard_contributions")
    .select("id", { count: "exact", head: true })
    .eq("ecard_id", card.id)
    .eq("is_hidden", false);
  const messageCount = count.count ?? 0;
  // Preview parity: the reveal page shows the media guests left, so the
  // delivery email carries the first few pictures instead of only a count.
  // Voice notes and video cannot play in an inbox, so they are named in words.
  const { data: mediaRows } = await admin
    .from("ecard_contributions")
    .select("gif_url,image_url,video_url,audio_url,media_type,media_url,position,created_at")
    .eq("ecard_id", card.id)
    .eq("is_hidden", false)
    .order("position", { ascending: true })
    .limit(60);
  const previewImages: string[] = [];
  let videoCount = 0;
  let audioCount = 0;
  for (const row of mediaRows ?? []) {
    const m = resolveMedia(row as MediaBearing);
    if (m.video) videoCount += 1;
    if (m.audio) audioCount += 1;
    for (const candidate of [m.image, m.gif]) {
      const safe = emailSafeImageUrl(candidate);
      if (safe && previewImages.length < 3 && !previewImages.includes(safe)) {
        previewImages.push(safe);
      }
    }
  }
  const extraParts: string[] = [];
  if (videoCount) extraParts.push(`${videoCount} ${videoCount === 1 ? "video" : "videos"}`);
  if (audioCount)
    extraParts.push(`${audioCount} ${audioCount === 1 ? "voice note" : "voice notes"}`);
  const extraMediaNote = extraParts.length
    ? `There ${extraParts.length === 1 && !/s$/.test(extraParts[0]!) ? "is" : "are"} also ${extraParts.join(" and ")} waiting for you on the page.`
    : "";

  const revealTimeLabel = card.reveal_date
    ? formatDateTimeInZone(card.reveal_date, card.organizer_timezone || ECARD_EMAIL_FALLBACK_TZ)
    : "";

  const sent = await enqueueTransactionalEmailServer({
    templateName: "ecard-delivery",
    recipientEmail: card.recipient_email,
    idempotencyKey: `ecard-delivery-${card.id}`,
    templateData: {
      recipientName: card.recipient_name,
      occasion: card.occasion,
      messageCount,
      revealUrl,
      revealTimeLabel,
      previewImages,
      extraMediaNote,
    },
    label: "ecard-delivery",
  });

  if (!sent.ok) return { ok: false, reason: sent.reason ?? "send_failed" };

  await admin
    .from("ecards")
    .update({ delivered_at: new Date().toISOString(), status: "revealed" })
    .eq("id", card.id);

  const organizer = await organizerEmail(admin, card.organizer_user_id);
  if (organizer) {
    await enqueueTransactionalEmailServer({
      templateName: "ecard-delivered",
      recipientEmail: organizer,
      idempotencyKey: `ecard-delivered-organizer-${card.id}`,
      templateData: {
        recipientName: card.recipient_name,
        occasion: card.occasion,
        messageCount,
        revealUrl,
        revealTimeLabel,
        dashboardUrl: `${ECARD_SITE_ORIGIN}/ecards/${card.id}`,
      },
      label: "ecard-delivered",
    });
  }

  return { ok: true };
}

/** Cron entry point: deliver every paid card whose reveal moment has passed. */
export async function deliverDueEcards(): Promise<{
  considered: number;
  delivered: number;
  skipped: number;
}> {
  const admin = adminClient();
  if (!admin) return { considered: 0, delivered: 0, skipped: 0 };

  const { getDemoUserIds } = await import("@/lib/demo-accounts.server");
  const demoUserIds = await getDemoUserIds();

  let query = admin
    .from("ecards")
    .select("id, occasion, recipient_name, recipient_email, public_slug, organizer_user_id, theme, reveal_date, organizer_timezone")
    .eq("is_paid", true)
    .is("delivered_at", null)
    .neq("status", "draft")
    .not("recipient_email", "is", null)
    .lte("reveal_date", new Date().toISOString())
    .limit(200);
  for (const id of demoUserIds) query = query.neq("organizer_user_id", id);

  const { data, error } = await query;

  if (error || !data) return { considered: 0, delivered: 0, skipped: 0 };

  let delivered = 0;
  let skipped = 0;
  for (const card of data as DeliverableCard[]) {
    const res = await deliverEcard(admin, card);
    if (res.ok) delivered += 1;
    else skipped += 1;
  }
  return { considered: data.length, delivered, skipped };
}

/** Deliver one specific card by id, re-checking payment and recipient. */
export async function deliverEcardById(
  ecardId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const admin = adminClient();
  if (!admin) return { ok: false, reason: "no_admin_client" };
  const { data } = await admin
    .from("ecards")
    .select("id, occasion, recipient_name, recipient_email, public_slug, organizer_user_id, theme, reveal_date, organizer_timezone, is_paid, delivered_at")
    .eq("id", ecardId)
    .maybeSingle();
  if (!data) return { ok: false, reason: "not_found" };
  const row = data as DeliverableCard & { is_paid: boolean; delivered_at: string | null };
  if (!row.is_paid) return { ok: false, reason: "unpaid" };
  if (row.delivered_at) return { ok: false, reason: "already_delivered" };
  return deliverEcard(admin, row);
}
