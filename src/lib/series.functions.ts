/**
 * Occasion (multi-event series) stage 2 — one guest link for a whole weekend.
 *
 * Stage 1 gave hosts an occasion name plus roster copy-forward. This adds the
 * guest-facing half: a single link (`/o/<eventId>`) that lists every gathering
 * in the occasion, finds the guest once, and answers all of them in one tap.
 *
 * Everything here is unauthenticated, so it follows the same rules as the
 * single-event invite path: reads go through SECURITY DEFINER RPCs, writes go
 * through `public_update_guest` (which stays authoritative for capacity and
 * waitlist routing), and no guest contact detail is ever returned to the
 * browser beyond the masked candidate labels the picker needs.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseInput } from "@/lib/user-error";
import { nullSafe } from "@/lib/zod-nullsafe";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

async function rateLimitOrThrow(scope: string, max: number, windowMs: number) {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { enforceIpRateLimit } = await import("@/lib/rate-limit.server");
  try {
    const limited = enforceIpRateLimit(getRequest(), { scope, max, windowMs });
    if (limited) throw limited;
  } catch (e) {
    if (e instanceof Response) throw e;
  }
}

export interface OccasionGathering {
  id: string;
  title: string;
  date?: string | null;
  time?: string | null;
  timezone?: string | null;
  venue?: string | null;
}

interface RawGuest {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
}

async function seriesGatherings(eventId: string): Promise<{ seriesName: string; gatherings: OccasionGathering[] }> {
  const sb = publicClient();
  const { data, error } = await sb.rpc("get_public_series_events", { _event_id: eventId });
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const gatherings = rows
    .filter((r) => typeof r?.id === "string")
    .map((r) => ({
      id: String(r.id),
      title: String(r.title ?? "Untitled gathering"),
      date: (r.date as string) ?? null,
      time: (r.time as string) ?? null,
      timezone: (r.timezone as string) ?? null,
      venue: (r.venue as string) ?? null,
    }));
  const seriesName = String(rows[0]?.seriesName ?? "").trim();
  return { seriesName, gatherings };
}

/** Public: the gatherings that make up this occasion. Empty when standalone. */
export const fetchOccasion = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z.object({ eventId: z.string().min(1).max(120) })), input, "input"),
  )
  .handler(async ({ data }) => {
    await rateLimitOrThrow("fetch-occasion", 60, 60 * 1000);
    return seriesGatherings(data.eventId);
  });

async function guestsOf(eventId: string): Promise<RawGuest[]> {
  const sb = publicClient();
  const { data } = await sb.rpc("get_public_event_by_id", { _id: eventId });
  const guests = (data as { guests?: unknown } | null)?.guests;
  return Array.isArray(guests) ? (guests as RawGuest[]) : [];
}

/**
 * Match one person across every gathering in the occasion.
 *
 * `g` is the guest id from a personal link on the anchor event; `query` is the
 * typed name/email fallback. Either way the identity is resolved once and then
 * re-matched per sibling gathering, because each event carries its own guest
 * ids (stage 1 copies rosters, it does not share them).
 */
export const resolveOccasionGuest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z
      .object({
        eventId: z.string().min(1).max(120),
        g: z.string().max(60).optional(),
        query: z.string().max(200).optional(),
      })), input, "input"),
  )
  .handler(async ({ data }) => {
    await rateLimitOrThrow("resolve-occasion-guest", 30, 60 * 1000);
    const { lookupGuest, describeCandidates, normalizeText } = await import("@/lib/guest-lookup");
    const anchorGuests = await guestsOf(data.eventId);

    let me: RawGuest | undefined;
    if (data.g) {
      me = anchorGuests.find((x) => String(x.id) === data.g);
    }
    if (!me && data.query && data.query.trim()) {
      const result = lookupGuest(anchorGuests as never[], data.query);
      if (result.kind === "match") me = result.guest as RawGuest;
      else if (result.kind === "candidates") {
        return {
          kind: "candidates" as const,
          rows: describeCandidates(result.guests as never[]),
        };
      } else return { kind: result.kind };
    }
    if (!me) return { kind: "none" as const };

    const { gatherings, seriesName } = await seriesGatherings(data.eventId);
    const targetName = normalizeText(me.name);
    const targetEmail = normalizeText(me.email);
    const targetPhone = String(me.phone ?? "").replace(/\D+/g, "");

    const invited: { eventId: string; guestId: string; status: string }[] = [];
    for (const g of gatherings) {
      const guests = g.id === data.eventId ? anchorGuests : await guestsOf(g.id);
      const hit = guests.find((x) => {
        if (targetEmail && normalizeText(x.email) === targetEmail) return true;
        if (targetPhone && String(x.phone ?? "").replace(/\D+/g, "") === targetPhone) return true;
        return !!targetName && normalizeText(x.name) === targetName;
      });
      if (hit?.id) invited.push({ eventId: g.id, guestId: String(hit.id), status: String(hit.status ?? "pending") });
    }

    return {
      kind: "match" as const,
      seriesName,
      guestName: String(me.name ?? ""),
      invited,
    };
  });

/**
 * Cascading RSVP: answer one gathering, or all of them at once.
 *
 * The guest ids are re-resolved server-side from the anchor link, so a crafted
 * request cannot answer on behalf of someone else or reach an event outside
 * this occasion.
 */
export const submitOccasionRsvp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z
      .object({
        eventId: z.string().min(1).max(120),
        guestId: z.string().min(1).max(60),
        answer: z.enum(["yes", "no", "maybe"]),
        /** Limit the cascade to these gathering ids; omit for every gathering. */
        only: z.array(z.string().min(1).max(120)).max(30).optional(),
      })), input, "input"),
  )
  .handler(async ({ data }) => {
    await rateLimitOrThrow("submit-occasion-rsvp", 20, 60 * 1000);
    const { normalizeText } = await import("@/lib/guest-lookup");
    const sb = publicClient();

    const anchorGuests = await guestsOf(data.eventId);
    const me = anchorGuests.find((x) => String(x.id) === data.guestId);
    if (!me) throw new Error("We couldn't find your invitation. Ask the host for a fresh link.");

    const { gatherings } = await seriesGatherings(data.eventId);
    const wanted = data.only?.length ? new Set(data.only) : null;
    const targetName = normalizeText(me.name);
    const targetEmail = normalizeText(me.email);
    const targetPhone = String(me.phone ?? "").replace(/\D+/g, "");

    const results: { eventId: string; status: string }[] = [];
    for (const g of gatherings) {
      if (wanted && !wanted.has(g.id)) continue;
      const guests = g.id === data.eventId ? anchorGuests : await guestsOf(g.id);
      const hit = guests.find((x) => {
        if (targetEmail && normalizeText(x.email) === targetEmail) return true;
        if (targetPhone && String(x.phone ?? "").replace(/\D+/g, "") === targetPhone) return true;
        return !!targetName && normalizeText(x.name) === targetName;
      });
      if (!hit?.id) continue;
      const { data: res } = await sb.rpc("public_update_guest", {
        _event_id: g.id,
        _guest_id: String(hit.id),
        _patch: { status: data.answer } as never,
      });
      const r = (res ?? {}) as { ok?: boolean; status?: string };
      results.push({ eventId: g.id, status: r.status ?? data.answer });
    }

    return { ok: true, results };
  });
