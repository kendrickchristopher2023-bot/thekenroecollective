import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { TIER_LIMITS, isUnlimited } from "@/lib/tier-limits";
import {
  POSTCARD_ROLLING_CREATE_LIMIT,
  rollingCapMessage,
  rollingWindowStart,
} from "@/lib/rolling-event-cap";
import { SHIRT_SIZES } from "@/lib/tshirt-sizes";
import { isShowcaseEvent } from "@/lib/showcase";
import { checkPublicWriteAllowed, assertPublicWriteAllowed } from "@/lib/demo-write-guard.server";
import { checkEventMediaOwnership } from "@/lib/event-media-theft-guard.server";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

// Event/guest IDs are short Math.random() strings (~41 bits) — guessable by
// a scripted brute force given enough requests. These four fns are the only
// unauthenticated paths that read or write by that ID, so throttle each per
// IP. Best-effort only (in-memory, resets per Worker instance); real
// abuse-hardening would layer Cloudflare-level rate limiting on top.
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

const ATELIER_TRIAL_PRICE_ID = "atelier_trial_30d";
const ATELIER_TRIAL_GUEST_LIMIT = 20;

// Public: anyone can fetch a single event (invite/gift/checkin links) via a
// SECURITY DEFINER RPC that returns ONLY the public event JSON + share_token
// (never user_id or internal columns), and skips archived events. The base
// events table SELECT policy is restricted to owners/admins.
//
// The RPC hands back the host's whole working blob, so every response is run
// through sanitizePublicEvent first: guest contact details, dietary and
// accessibility notes, payment records, host-only drafts and the check-in log
// never leave the server. `g` is the guest the link was addressed to; only that
// one guest's own record comes back complete, so the RSVP form can pre-fill.
export const fetchEventById = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    parseInput(z
      .object({
        id: z.string().min(1),
        g: z.string().max(60).optional(),
        t: z.string().max(200).optional(),
      }), input, "events-sync.functions.ts:59"),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any> => {
    await rateLimitOrThrow("fetch-event-by-id", 60, 60 * 1000);
    const sb = publicClient();
    let { data: row, error } = await sb.rpc("get_public_event_by_id", { _id: data.id });
    if (error) throw new Error(error.message);
    // The showcase is printed on business cards. If it is ever missing, put it
    // back before answering rather than sending a scanned card to nothing.
    if (!row && isShowcaseEvent(data.id)) {
      const { ensureShowcaseEvent } = await import("@/lib/showcase-seed.server");
      const healed = await ensureShowcaseEvent();
      if (healed.ok) {
        ({ data: row, error } = await sb.rpc("get_public_event_by_id", { _id: data.id }));
        if (error) throw new Error(error.message);
      }
    }
    if (!row) return null;
    // The entrance plan gate is enforced here, not only in the picker: this
    // payload is what a guest's browser actually plays.
    const { applyEntranceGate } = await import("@/lib/invite-entrances.server");
    const gated = await applyEntranceGate(row as Record<string, unknown>);
    const { sanitizePublicEvent } = await import("@/lib/public-event-sanitize");
    return sanitizePublicEvent(gated, data.g ?? null, data.t ?? null);
  });

export const fetchEventBySlug = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    parseInput(z
      .object({
        slug: z.string().min(1),
        g: z.string().max(60).optional(),
        t: z.string().max(200).optional(),
      }), input, "events-sync.functions.ts:80"),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any> => {
    await rateLimitOrThrow("fetch-event-by-slug", 60, 60 * 1000);
    const sb = publicClient();
    const { data: row, error } = await sb.rpc("get_public_event_by_slug", { _slug: data.slug.toLowerCase() });
    if (error) throw new Error(error.message);
    if (!row) return null;
    // The entrance plan gate is enforced here, not only in the picker: this
    // payload is what a guest's browser actually plays.
    const { applyEntranceGate } = await import("@/lib/invite-entrances.server");
    const gated = await applyEntranceGate(row as Record<string, unknown>);
    const { sanitizePublicEvent } = await import("@/lib/public-event-sanitize");
    return sanitizePublicEvent(gated, data.g ?? null, data.t ?? null);
  });


/**
 * Host-side single-event read. Same shape as the public fetch but unsanitized,
 * for the owner (or an admin) looking at their own dashboard, run-of-show, QR
 * cards or check-in screen. RLS on `events` decides: a signed-in visitor who
 * does not own the event simply gets nothing back and the caller falls through
 * to the sanitized public payload.
 */
export const fetchOwnedEventById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(z.object({ id: z.string().min(1) }), input, "events-sync.functions.ts:103"))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data, context }): Promise<any> => {
    const { data: row } = await context.supabase
      .from("events")
      .select("data,share_token")
      .eq("id", data.id)
      .maybeSingle();
    const owned = row as { data?: unknown; share_token?: string | null } | null;
    const blob = owned?.data;
    return blob && typeof blob === "object"
      ? { ...(blob as Record<string, unknown>), shareToken: owned?.share_token ?? undefined }
      : null;
  });

/**
 * Server-side guest self-lookup for the shared-link case.
 *
 * The guest list never reaches an unauthenticated browser now, so matching runs
 * here. A single confident match returns that guest's id; an ambiguous one
 * returns already-masked picker rows ("T*** M.", "w***n@gmail.com"), so no
 * contact detail is exposed to someone guessing names.
 */
export const lookupGuestOnEvent = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    parseInput(z.object({ eventId: z.string().min(1).max(120), query: z.string().max(200) }), input, "events-sync.functions.ts:128"),
  )
  .handler(async ({ data }) => {
    await rateLimitOrThrow("lookup-guest", 30, 60 * 1000);
    const sb = publicClient();
    const { data: row } = await sb.rpc("get_public_event_by_id", { _id: data.eventId });
    const guests = (row as { guests?: unknown } | null)?.guests;
    if (!Array.isArray(guests)) return { kind: "none" as const };
    const { lookupGuest, describeCandidates } = await import("@/lib/guest-lookup");
    const result = lookupGuest(guests as never[], data.query);
    if (result.kind === "match") {
      return { kind: "match" as const, guestId: String((result.guest as { id: string }).id) };
    }
    if (result.kind === "candidates") {
      return { kind: "candidates" as const, rows: describeCandidates(result.guests as never[]) };
    }
    return { kind: result.kind };
  });


// Auth: is this vanity slug free across EVERY host's events? The old check was
// client-side only (localStorage), so two hosts on different accounts could
// both "claim" /e/same-slug and the second save just failed at the DB unique
// index. This asks the server via a security-definer RPC, so it never exposes
// anyone else's event row.
export const checkBrandedSlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(z.object({ slug: z.string().min(1).max(120), eventId: z.string().min(1).optional() }), input, "events-sync.functions.ts:156"),
  )
  .handler(async ({ data, context }) => {
    const { data: available, error } = await context.supabase.rpc("branded_slug_available", {
      _slug: data.slug.toLowerCase(),
      _except_event_id: data.eventId ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { available: !!available };
  });


// Public, no auth: guests submitting an RSVP have no Supabase session, so the
// client-side events-store.ts local-cache/upsertEvent path (owner-auth-only)
// silently no-ops for them. This RPC-backed function is the actual write path
// for guest RSVP/details — merges ONLY the whitelisted RSVP-shaped fields into
// the matching guest, never touching other guests or event fields.
const ShirtSizeEnum = z.enum(SHIRT_SIZES);

const GuestPatch = z.object({
  status: z.enum(["yes", "no", "maybe", "pending", "waitlisted"]).optional(),
  adults: z.number().int().min(0).max(50).optional(),
  children: z.number().int().min(0).max(50).optional(),
  pets: z.number().int().min(0).max(5).optional(),
  category: z.string().max(60).optional(),
  dietary: z.string().max(500).optional(),
  accessibilityNotes: z.string().max(500).optional(),
  preferredLanguage: z.string().max(10).optional(),
  // Enum-only: never a free-text field, so the public RPC cannot be used to
  // stash arbitrary strings inside the event blob.
  shirtSize: ShirtSizeEnum.optional(),
  plusOnes: z.array(z.object({
    name: z.string().max(120),
    dietary: z.string().max(300).optional(),
    accessibility: z.string().max(300).optional(),
    shirtSize: ShirtSizeEnum.optional(),
    isChild: z.boolean().optional(),
  })).max(20).optional(),
  // Merchandise, not people: quantities are bounded here and re-clamped by
  // public_update_guest against the host's own per-RSVP ceiling.
  extraShirts: z.array(z.object({
    size: ShirtSizeEnum,
    qty: z.number().int().min(0).max(10),
  })).max(10).optional(),
});

export const submitGuestRsvp = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    parseInput(z.object({ eventId: z.string().min(1).max(120), guestId: z.string().min(1).max(60), patch: GuestPatch }), input, "events-sync.functions.ts:204"),
  )
  .handler(async ({ data }) => {
    await rateLimitOrThrow("submit-guest-rsvp", 20, 60 * 1000);
    // Showcase: the confirmation is shown client-side so the flow feels real,
    // and nothing is written. Refused here as well as by the database trigger.
    if (isShowcaseEvent(data.eventId)) {
      return {
        ok: true, reason: "showcase" as string | null, outcome: "showcase" as string | null,
        status: (data.patch as { status?: string }).status ?? null,
        capacity: null, remaining: null, maxParty: null, plusOnesAllowed: null,
      };
    }
    const guard = await checkPublicWriteAllowed(data.eventId);
    if (!guard.ok) {
      return {
        ok: false, reason: "demo" as string | null, outcome: guard.error as string | null,
        status: null, capacity: null, remaining: null, maxParty: null, plusOnesAllowed: null,
      };
    }
    const sb = publicClient();
    // Shirt sizes are a Host+ per-event opt-in and can be locked once the host
    // places the order. Strip them server-side so a crafted request cannot
    // write sizes to an event that never collected them, or change a size
    // after the order was locked.
    let patch = data.patch as Record<string, unknown>;
    const { data: eventRow } = await sb.rpc("get_public_event_by_id", { _id: data.eventId });
    const ev = (eventRow ?? {}) as Record<string, unknown>;
    const sizesWritable = !!ev.tshirtSizesEnabled && !ev.tshirtSizesLocked;
    if (!sizesWritable) {
      const { shirtSize: _drop, extraShirts: _dropExtras, ...rest } = patch;
      patch = rest;
      if (Array.isArray(patch.plusOnes)) {
        patch = {
          ...patch,
          plusOnes: (patch.plusOnes as Record<string, unknown>[]).map(({ shirtSize: _s, ...p }) => p),
        };
      }
    }
    // Extras are a separate host opt-in: strip them when the host never
    // enabled them, so nobody can bill themselves for shirts on an event
    // that does not offer spares.
    if (!ev.extraShirtsEnabled) {
      const { extraShirts: _noExtras, ...rest } = patch;
      patch = rest;
    }
    // public_update_guest is authoritative: it row-locks the event, clamps
    // plus-ones to the host's allowance, and enforces the capacity cap
    // (routing overflow to the waitlist when enabled). Its verdict is
    // returned so the RSVP form can correct itself when the server disagrees
    // with the optimistic client-side check.
    const { data: result, error } = await sb.rpc("public_update_guest", {
      _event_id: data.eventId,
      _guest_id: data.guestId,
      _patch: patch as never,
    });
    if (error) throw new Error(error.message);
    const r = (result ?? {}) as {
      ok?: boolean;
      reason?: string;
      outcome?: string;
      status?: string;
      capacity?: number;
      remaining?: number;
      maxParty?: number;
      plusOnesAllowed?: number;
    };
    return {
      ok: r.ok !== false,
      reason: r.reason ?? null,
      outcome: r.outcome ?? null,
      status: r.status ?? null,
      capacity: typeof r.capacity === "number" ? r.capacity : null,
      remaining: typeof r.remaining === "number" ? r.remaining : null,
      // Plus-ones allowance verdict: the guest's own RSVP may never represent
      // more than 1 + allowance heads, however those heads were entered.
      maxParty: typeof r.maxParty === "number" ? r.maxParty : null,
      plusOnesAllowed: typeof r.plusOnesAllowed === "number" ? r.plusOnesAllowed : null,
    };
  });


// Public, no auth: door check-in staff reach this page via a share-token
// link and are never signed in as the owner — same gap as guest RSVP above.
// The token is verified SERVER-SIDE by public_set_checkin; the route-level
// token check is UX only and is not a security boundary.
export const submitGuestCheckin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    parseInput(z.object({
      eventId: z.string().min(1).max(120),
      guestId: z.string().min(1).max(60),
      checkedIn: z.boolean(),
      note: z.string().max(200).optional(),
      shareToken: z.string().max(200).optional(),
      /** People arriving under this check-in (guest + party). Clamped server-side. */
      heads: z.number().int().min(1).max(60).optional(),
    }), input, "events-sync.functions.ts:276"),
  )
  .handler(async ({ data }) => {
    await rateLimitOrThrow("submit-guest-checkin", 20, 60 * 1000);
    await assertPublicWriteAllowed(data.eventId);
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const auth = getRequestHeader("authorization") ?? getRequestHeader("Authorization");
    const token = auth?.replace(/^Bearer\s+/i, "");
    const sb = token
      ? createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        })
      : publicClient();
    const { data: result, error } = await sb.rpc("public_set_checkin", {
      _event_id: data.eventId,
      _guest_id: data.guestId,
      _checked_in: data.checkedIn,
      _note: data.note,
      _share_token: data.shareToken ?? undefined,
      _heads: data.heads ?? undefined,
    });
    if (error) throw new Error(error.message);
    const r = (result ?? {}) as { ok?: boolean; reason?: string };
    if (r.ok === false) {
      throw new Error(
        r.reason === "forbidden"
          ? "This door check-in link is no longer valid. Ask the host for a fresh link."
          : "That guest could not be checked in.",
      );
    }
    return { ok: true };
  });

// Public (door-token gated): register someone who showed up but was never on
// the invite list, and check them in in the same write. The RPC verifies the
// share token, clamps the party counts, and stamps source:"walkin" so the host
// panel can report invited arrivals and walk-ins separately.
export const submitWalkIn = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    parseInput(z.object({
      eventId: z.string().min(1).max(120),
      name: z.string().trim().min(1).max(80),
      adults: z.number().int().min(1).max(20).default(1),
      children: z.number().int().min(0).max(20).default(0),
      note: z.string().max(200).optional(),
      shareToken: z.string().max(200).optional(),
    }), input, "events-sync.functions.ts:323"),
  )
  .handler(async ({ data }) => {
    await rateLimitOrThrow("submit-walkin", 20, 60 * 1000);
    await assertPublicWriteAllowed(data.eventId);
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const auth = getRequestHeader("authorization") ?? getRequestHeader("Authorization");
    const token = auth?.replace(/^Bearer\s+/i, "");
    const sb = token
      ? createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        })
      : publicClient();
    const { data: result, error } = await sb.rpc("public_add_walkin", {
      _event_id: data.eventId,
      _name: data.name,
      _share_token: data.shareToken ?? undefined,
      _adults: data.adults,
      _children: data.children,
      _note: data.note,
    });
    if (error) throw new Error(error.message);
    const r = (result ?? {}) as { ok?: boolean; reason?: string; guestId?: string; heads?: number };
    if (r.ok === false) {
      throw new Error(
        r.reason === "forbidden"
          ? "This door check-in link is no longer valid. Ask the host for a fresh link."
          : r.reason === "invalid_name"
            ? "Add a name for the walk-in guest."
            : "That walk-in could not be saved.",
      );
    }
    return { ok: true, guestId: r.guestId!, heads: r.heads ?? 1 };
  });





// Auth: list my events. Returns [] if the caller has no session, so callers can
// invoke this on public pages without risking an Unauthorized error.
export const listMyEvents = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const auth = getRequestHeader("authorization") ?? getRequestHeader("Authorization");
  if (!auth) return [];
  const token = auth.replace(/^Bearer\s+/i, "");
  const sb = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData.user) return [];
  const { data, error } = await sb
    .from("events")
    .select("data,share_token")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []).map((r) => ({
    ...(r.data as Record<string, unknown>),
    shareToken: r.share_token ?? undefined,
  }));
});

// Auth: creation timestamps inside the Postcard rolling window. The wizard's
// local event cache can't answer this on its own (archived events still count
// toward the rolling cap), so the preflight asks the server.
export const myRecentEventCreations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rollingWindowStart } = await import("@/lib/rolling-event-cap");
    const { data, error } = await context.supabase
      .from("events")
      .select("created_at")
      .eq("user_id", context.userId)
      .gte("created_at", rollingWindowStart().toISOString());
    if (error) return { createdAts: [] as string[] };
    return { createdAts: ((data as { created_at: string }[]) ?? []).map((r) => r.created_at) };
  });


// Auth: upsert one event (claims unowned row to current user)
export const upsertEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(z
      .object({
        id: z.string().min(1),
        data: z.record(z.string(), z.unknown()),
        brandedSlug: z.string().nullable().optional(),
      }), input, "events-sync.functions.ts:426"),
  )
  .handler(async ({ data, context }) => {
    const slug = data.brandedSlug ? data.brandedSlug.toLowerCase() : null;
    // T-shirt sizing and priced shirt line items are Host/Atelier only.
    const SHIRT_KEYS = [
      "tshirtSizesEnabled",
      "tshirtSizesLocked",
      "tshirtSizesLockedAt",
      "shirtPricingEnabled",
      "shirtPriceCents",
      "extraShirtsEnabled",
    ];
    const stripShirtKeys = () => {
      const d = data.data as Record<string, unknown>;
      for (const key of SHIRT_KEYS) delete d[key];
    };


    // Server-side Whisper 1-event cap. Owners exempt. Updates to an existing
    // row (same id) are always allowed; only NEW events trigger the count check.
    // Authoritative — the client check can be bypassed via cleared localStorage
    // or a second device.
    const [{ data: isOwner }, { data: existingRow }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" }),
      context.supabase.from("events").select("id,user_id,data").eq("id", data.id).maybeSingle(),
    ]);
    const isUpdate = !!existingRow;
    // A co-host saving someone else's event must not re-home the row to their
    // own account, and their save must not be billed against their own tier
    // caps — the host who owns the event already paid for it.
    const rowOwnerId = ((existingRow as { user_id?: string } | null)?.user_id ?? context.userId) as string;
    const isCollaboratorSave = isUpdate && rowOwnerId !== context.userId;
    if (isCollaboratorSave) {
      const { data: membership } = await context.supabase
        .from("event_members")
        .select("role,status")
        .eq("event_id", data.id)
        .eq("user_id", context.userId)
        .eq("status", "active")
        .maybeSingle();
      if ((membership as { role?: string } | null)?.role !== "cohost") {
        throw new Error("You can only save events you own or co-host.");
      }
    }

    // The importer is gated on the server before it reads a row
    // (assertEventAddonAccess). The generic save only refuses what no one
    // types by hand: a jump of 50+ guests in one save, or a thank-you card
    // added, edited or sent. Both messages are matched by the client so a
    // refused save is explained once and never retried in a loop.
    if (isUpdate) {
      const oldData = ((existingRow as any)?.data ?? {}) as Record<string, unknown>;
      const nextData = data.data as Record<string, unknown>;
      const { accountAddonAccess } = await import("@/lib/addon-access.server");
      const { guestJumpNeedsImport, thankYouMeaningfullyChanged } = await import("@/lib/save-gates");
      const oldGuests = Array.isArray(oldData.guests) ? oldData.guests : [];
      const nextGuests = Array.isArray(nextData.guests) ? nextData.guests : [];
      if (guestJumpNeedsImport(oldGuests.length, nextGuests.length)
        && !(await accountAddonAccess(context.supabase, rowOwnerId, "guest_import"))) {
        throw new Error(
          `This save adds ${nextGuests.length - oldGuests.length} guests at once, which needs the bulk guest import add-on.`,
        );
      }
      if (thankYouMeaningfullyChanged(oldData.thankYouCards, nextData.thankYouCards)
        && !(await accountAddonAccess(context.supabase, rowOwnerId, "thank_you_cards"))) {
        throw new Error("Thank-you cards need the thank-you card studio, which is not unlocked for this account.");
      }
    }
    if (!isOwner && !isCollaboratorSave) {
      const [{ data: profile }, { data: sub }] = await Promise.all([
        context.supabase.from("profiles").select("tier").eq("id", context.userId).maybeSingle(),
        context.supabase
          .from("subscriptions")
          .select("price_id,status,current_period_end")
          .eq("user_id", context.userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const subActive = !!sub && (
        (["active", "trialing", "past_due"].includes((sub as any).status) &&
          (!(sub as any).current_period_end || new Date((sub as any).current_period_end) > new Date())) ||
        ((sub as any).status === "canceled" && !!(sub as any).current_period_end &&
          new Date((sub as any).current_period_end) > new Date())
      );
      const activePriceId = String((subActive ? (sub as any).price_id : "") ?? "").toLowerCase();
      const raw = String((subActive ? (sub as any).price_id : (profile as any)?.tier) ?? "").toLowerCase();
      const tier = raw.includes("atelier") ? "atelier"
        : raw.includes("host") ? "host"
        : (raw.includes("whisper") || raw === "whisper_onetime") ? "whisper"
        : "postcard";

      if (activePriceId === ATELIER_TRIAL_PRICE_ID) {
        const guestCount = Array.isArray((data.data as any).guests) ? (data.data as any).guests.length : 0;
        if (guestCount > ATELIER_TRIAL_GUEST_LIMIT) {
          throw new Error("The Atelier trial supports up to 20 guests. Upgrade to Atelier to invite more guests.");
        }
      }

      // Enforce per-tier active event count + per-event guest cap.
      // Sourced from tier-config.ts (single source of truth).
      const limits = TIER_LIMITS[tier];
      const guestCount = Array.isArray((data.data as any).guests) ? (data.data as any).guests.length : 0;

      if (!isUnlimited(limits.activeEvents) && !isUpdate) {
        const { count, error: countErr } = await context.supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("user_id", context.userId)
          .is("archived_at", null);
        if (countErr) throw new Error(countErr.message);
        if ((count ?? 0) >= limits.activeEvents) {
          const label = tier.charAt(0).toUpperCase() + tier.slice(1);
          throw new Error(
            `${label} supports up to ${limits.activeEvents} active event${limits.activeEvents === 1 ? "" : "s"}. Archive an event or upgrade to create another.`,
          );
        }
      }

      // Postcard rolling creation cap: 3 new events per rolling 12 months.
      // Deliberately counts ARCHIVED events too — the active-event cap above
      // is the only one archiving frees.
      if (tier === "postcard" && !isUpdate) {
        const since = rollingWindowStart().toISOString();
        const { data: recent, error: recentErr } = await context.supabase
          .from("events")
          .select("created_at")
          .eq("user_id", context.userId)
          .gte("created_at", since);
        if (recentErr) throw new Error(recentErr.message);
        const createdAts = ((recent as { created_at: string }[]) ?? []).map((r) => r.created_at);
        if (createdAts.length >= POSTCARD_ROLLING_CREATE_LIMIT) {
          throw new Error(rollingCapMessage(createdAts));
        }
      }


      if (!isUnlimited(limits.guestsPerEvent) && guestCount > limits.guestsPerEvent) {
        const label = tier.charAt(0).toUpperCase() + tier.slice(1);
        throw new Error(
          `${label} supports up to ${limits.guestsPerEvent} guests per event. Upgrade to invite more.`,
        );
      }

      // T-shirt sizes (and priced shirt line items) are a Host/Atelier
      // feature. The UI hides the toggle below Host, but this save path is
      // the real boundary: without this strip a Postcard host could enable
      // shirt pricing by writing event.data directly and start billing
      // guests for shirts. Silently drop the keys rather than erroring so an
      // unrelated save on a downgraded account still succeeds.
      if (tier !== "host" && tier !== "atelier") stripShirtKeys();
    }

    // Same guard on the co-host save path. A collaborator's own plan is
    // irrelevant here — what matters is the plan of the host who owns the
    // event. Without this, a Whisper host's single co-host seat could switch
    // on priced shirt line items the host never paid for.
    if (isCollaboratorSave) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { resolveUserTier } = await import("@/lib/tier-guards.server");
      const { tier: ownerTier } = await resolveUserTier(supabaseAdmin, rowOwnerId);
      if (ownerTier !== "host" && ownerTier !== "atelier") stripShirtKeys();
    }


    // Authoritative slug uniqueness: the DB has a unique index on
    // branded_slug, but a raw 23505 reads as gibberish to a host, so check
    // first and translate the race-loser error into plain language.
    if (slug) {
      const { data: available } = await context.supabase.rpc("branded_slug_available", {
        _slug: slug,
        _except_event_id: data.id,
      });
      if (available === false) {
        throw new Error(`The link /e/${slug} is already taken by another event. Try a different one.`);
      }
    }

    // Existing rows go through UPDATE, not upsert. PostgREST's upsert compiles
    // to INSERT ... ON CONFLICT DO UPDATE, and Postgres evaluates the INSERT
    // policy's WITH CHECK on the proposed row even when the statement ends up
    // updating. The events INSERT policy is `user_id = auth.uid()`, so every
    // co-host save was failing with "new row violates row-level security
    // policy" before it could ever reach the co-host UPDATE policy.
    const { shareToken: _serverManagedToken, ...safeEventData } = data.data;

    // Freeloading guard: every field on the event (hero, vibe gallery, theme
    // art, logos, voice note, soundtrack, anything else) is scanned for
    // storage references that don't belong here. "Own people" = the row owner
    // plus every active collaborator (co-hosts upload under their own user
    // id); event-id folders belong to this event only; the showcase is never
    // reusable; anything the cloud row already referenced is grandfathered so
    // a stale reference can never wedge saves. Refused references are dropped
    // and the rest of the edit is saved, and the caller is told exactly what
    // was refused so its local copy can drop the same links.
    const { supabaseAdmin: ownershipAdmin } = await import("@/integrations/supabase/client.server");
    const { data: activeMembers } = await ownershipAdmin
      .from("event_members")
      .select("user_id")
      .eq("event_id", data.id)
      .eq("status", "active");
    const ownershipScope = {
      allowedOwnerIds: [
        rowOwnerId,
        context.userId,
        ...(((activeMembers ?? []) as { user_id: string | null }[]).map((m) => m.user_id ?? "")),
      ],
      eventId: data.id,
      previousData: ((existingRow as { data?: Record<string, unknown> } | null)?.data ?? null),
    };
    const { checkEventSoundPieceOwnership } = await import("@/lib/event-media-theft-guard.server");
    const { stripRefusedMedia } = await import("@/lib/event-media-strip");
    const mediaCheck = checkEventMediaOwnership(safeEventData as Record<string, unknown>, ownershipScope);
    // Service client on purpose: sound_pieces RLS hides the host's pieces from
    // a co-host, which refused every co-host save of an event with a song.
    const pieceCheck = await checkEventSoundPieceOwnership(
      ownershipAdmin,
      safeEventData as Record<string, unknown>,
      ownershipScope,
    );
    const refusedMedia = [...mediaCheck.refused, ...pieceCheck.refused];
    let dataToSave: Record<string, unknown> = safeEventData as Record<string, unknown>;
    if (refusedMedia.length) {
      const { logDemoGuard } = await import("@/lib/demo-mode.server");
      const refusedForLog = refusedMedia.map((r) => ({ reason: r.reason, value: r.value.slice(0, 200) }));
      await logDemoGuard("copy_blocked", { eventId: data.id, refused: refusedForLog }, context.userId);
      dataToSave = stripRefusedMedia(dataToSave, refusedMedia.map((r) => r.value));
    }

    const row = {
      id: data.id,
      user_id: rowOwnerId,
      branded_slug: slug,
      data: dataToSave as never,
      updated_at: new Date().toISOString(),
    };
    const { error } = isUpdate
      ? await context.supabase.from("events").update(row).eq("id", data.id)
      : await context.supabase.from("events").insert(row);
    if (error) {
      if ((error as { code?: string }).code === "23505" && slug) {
        throw new Error(`The link /e/${slug} was just claimed by another event. Try a different one.`);
      }
      throw new Error(error.message);
    }


    const { data: saved } = await context.supabase
      .from("events")
      .select("share_token")
      .eq("id", data.id)
      .maybeSingle();
    return {
      ok: true,
      shareToken: saved?.share_token ?? null,
      // Plain reasons + the exact strings that were dropped; empty on a clean save.
      refusedMedia: refusedMedia.map((r) => ({ value: r.value, reason: r.reason })),
    };
  });

export const deleteEventRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(z.object({ id: z.string().min(1) }), input, "events-sync.functions.ts:616"))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("events")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
