/**
 * Print-at-home thank-you cards: the private per-guest link behind the QR
 * code printed on a card.
 *
 * We never print or mail anything. The host downloads the files and prints
 * them at home or at a print shop. When a card carries something a piece of
 * paper cannot (a song, a letter, a poem, a GIF), the printed card gets a
 * small QR code that opens that guest's own digital copy. Each link is a
 * random token bound to one event, one card and one guest, so a guest only
 * ever sees the card addressed to them.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseInput } from "@/lib/user-error";
import { isShowcaseEvent } from "@/lib/showcase";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
function randomToken(len = 20): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

type StoredCard = {
  id: string;
  message: string;
  design: string;
  photo?: string;
  gif?: string;
  pieceUrl?: string;
  pieceTitle?: string;
  pieceKind?: string;
  signOff?: string;
  recipientIds?: string[];
};
type StoredGuest = { id: string; name: string };
type StoredEvent = {
  title?: string;
  hosts?: { name?: string }[];
  guests?: StoredGuest[];
  thankYouCards?: StoredCard[];
};

/** True when a card carries something that only a digital copy can play. */
export function cardHasMedia(card: { pieceUrl?: string; gif?: string }): boolean {
  return !!card.pieceUrl || !!card.gif;
}

/**
 * Create (or reuse) the private link for each selected guest on a saved
 * card. Only the event's host or a collaborator (RLS on `events`) can mint.
 * The showcase never mints: it offers no print kit at all.
 */
export const mintThankYouLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(
      z.object({
        eventId: z.string().min(1).max(80),
        cardId: z.string().min(1).max(80),
        guestIds: z.array(z.string().min(1).max(80)).min(1).max(500),
      }),
      input,
      "thankyou-print.functions.ts:mint",
    ),
  )
  .handler(async ({ data, context }) => {
    if (isShowcaseEvent(data.eventId)) {
      throw new Error("The sample event does not offer print files.");
    }
    const { data: row, error } = await context.supabase
      .from("events")
      .select("id")
      .eq("id", data.eventId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("This event is not yours to print for.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("thank_you_links")
      .select("token, guest_id")
      .eq("event_id", data.eventId)
      .eq("card_id", data.cardId)
      .in("guest_id", data.guestIds);
    const tokens: Record<string, string> = {};
    for (const l of (existing ?? []) as { token: string; guest_id: string }[]) {
      tokens[l.guest_id] = l.token;
    }
    const missing = data.guestIds.filter((g) => !tokens[g]);
    if (missing.length) {
      const rows = missing.map((guestId) => ({
        token: randomToken(),
        event_id: data.eventId,
        card_id: data.cardId,
        guest_id: guestId,
        created_by: context.userId,
      }));
      const { error: insErr } = await supabaseAdmin.from("thank_you_links").insert(rows);
      if (insErr) throw new Error(insErr.message);
      for (const r of rows) tokens[r.guest_id] = r.token;
    }
    return { tokens };
  });

/**
 * Public read for one guest's digital copy. The token is the only key; the
 * response carries just what the card shows, never the guest list or the
 * host's account.
 */
export const getThankYouCopy = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    parseInput(z.object({ token: z.string().min(8).max(64) }), input, "thankyou-print.functions.ts:copy"),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link } = await supabaseAdmin
      .from("thank_you_links")
      .select("event_id, card_id, guest_id, open_count")
      .eq("token", data.token)
      .maybeSingle();
    const l = link as { event_id: string; card_id: string; guest_id: string; open_count: number } | null;
    if (!l) return { copy: null };

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("data, archived_at")
      .eq("id", l.event_id)
      .maybeSingle();
    const blob = (ev as { data?: StoredEvent; archived_at?: string | null } | null)?.data;
    if (!blob) return { copy: null };
    const card = (blob.thankYouCards ?? []).find((c) => c.id === l.card_id);
    const guest = (blob.guests ?? []).find((g) => g.id === l.guest_id);
    if (!card || !guest) return { copy: null };

    void supabaseAdmin
      .from("thank_you_links")
      .update({ open_count: (l.open_count ?? 0) + 1, opened_at: new Date().toISOString() })
      .eq("token", data.token)
      .then(() => undefined, () => undefined);

    return {
      copy: {
        eventTitle: blob.title ?? "",
        hostName: blob.hosts?.[0]?.name ?? null,
        guestName: guest.name,
        message: card.message,
        signOff: card.signOff ?? null,
        design: card.design,
        photo: card.photo ?? null,
        gif: card.gif ?? null,
        pieceUrl: card.pieceUrl ?? null,
        pieceTitle: card.pieceTitle ?? null,
        pieceKind: card.pieceKind ?? null,
      },
    };
  });
