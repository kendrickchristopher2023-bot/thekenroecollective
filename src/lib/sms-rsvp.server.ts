import type { SupabaseClient } from "@supabase/supabase-js";
import { formatEventDate } from "@/lib/datetime";
import type { QuickRsvpAnswer } from "@/lib/invite-links";

/**
 * Reply-based RSVP over SMS.
 *
 * For a guest who is not comfortable opening links, "reply YES" is the lowest
 * friction answer there is. The inbound webhook matches the sending phone
 * number against guests on the host's upcoming events and records the answer
 * through the same authoritative RPC the invitation page uses.
 */

const YES = new Set(["yes", "y", "yes!", "yep", "yeah", "attending", "si", "sí"]);
const NO = new Set(["no", "n", "nope", "can't", "cant", "cannot", "no thanks"]);
const MAYBE = new Set(["maybe", "m", "not sure", "unsure", "tal vez", "quizas", "quizás"]);

/** Map an inbound text body to an answer, or null when it isn't one. */
export function parseSmsAnswer(body: string): QuickRsvpAnswer | null {
  const cleaned = body.trim().toLowerCase().replace(/[.!,]+$/, "");
  if (YES.has(cleaned)) return "yes";
  if (NO.has(cleaned)) return "no";
  if (MAYBE.has(cleaned)) return "maybe";
  return null;
}

/** Last 10 digits — enough to match US numbers stored in any format. */
export function phoneKey(value: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.slice(-10);
}

export interface SmsRsvpResult {
  matched: boolean;
  reply?: string;
}

export interface EventCandidate { eventId: string; guestId: string; title: string; when: string; sort: number }

/** The soonest upcoming event where this number is a guest, or null. Reads only. */
export async function findEventCandidate(admin: SupabaseClient, fromPhone: string): Promise<EventCandidate | null> {
  const key = phoneKey(fromPhone);
  if (key.length < 10) return null;

  const { data: rows } = await admin
    .from("events")
    .select("id, data")
    .is("archived_at", null)
    .limit(500);
  if (!rows?.length) return null;

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const candidates: EventCandidate[] = [];

  for (const row of rows as { id: string; data: Record<string, unknown> | null }[]) {
    const data = row.data ?? {};
    const dateRaw = typeof data.date === "string" ? data.date : "";
    if (!dateRaw) continue;
    const parts = formatEventDate(dateRaw, (data.timezone as string) ?? null);
    const at = parts.instant ? parts.instant.getTime() : NaN;
    if (!isFinite(at) || at < cutoff) continue;
    const guests = Array.isArray(data.guests) ? (data.guests as Record<string, unknown>[]) : [];
    const guest = guests.find((g) => phoneKey(String(g.phone || "")) === key);
    if (!guest?.id) continue;
    candidates.push({
      eventId: row.id,
      guestId: String(guest.id),
      title: String(data.title || "the event"),
      when: parts.full,
      sort: at,
    });
  }

  if (!candidates.length) return null;
  // Soonest upcoming event wins, that is the one they were just texted about.
  candidates.sort((a, b) => a.sort - b.sort);
  return candidates[0]!;
}

export async function recordSmsRsvp(
  admin: SupabaseClient,
  fromPhone: string,
  answer: QuickRsvpAnswer,
  known?: EventCandidate | null,
): Promise<SmsRsvpResult> {
  const pick = known ?? (await findEventCandidate(admin, fromPhone));
  if (!pick) return { matched: false };

  const { data: result, error } = await admin.rpc("public_update_guest", {
    _event_id: pick.eventId,
    _guest_id: pick.guestId,
    _patch: { status: answer } as never,
  });
  if (error) return { matched: false };
  const r = (result ?? {}) as { ok?: boolean; status?: string };
  if (r.ok === false) return { matched: false };

  const status = r.status ?? answer;
  const reply =
    status === "waitlisted"
      ? `${pick.title} is full, so you are on the waiting list. We will text you if a place opens up.`
      : answer === "yes"
        ? `You're confirmed for ${pick.title}${pick.when ? ` on ${pick.when}` : ""}. Thank you!`
        : answer === "maybe"
          ? `Thank you. You are marked as a maybe for ${pick.title}. Reply YES or NO any time.`
          : `Thank you for letting us know you can't make ${pick.title}. Your answer is saved.`;

  return { matched: true, reply };
}
