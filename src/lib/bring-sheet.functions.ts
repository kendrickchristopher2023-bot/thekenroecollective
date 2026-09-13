import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { isAllProfanity, maskProfanity } from "@/lib/profanity";
import { matchGuestRsvp } from "@/lib/bring-sheet";
import type { BringItem, BringSheet } from "@/lib/bring-sheet";
import { isShowcaseEvent, showcaseRefusal } from "@/lib/showcase";
import { checkPublicWriteAllowed } from "@/lib/demo-write-guard.server";


/**
 * Potluck sign-up sheet server surface.
 *
 * Guests never touch the base tables: every anonymous read/write goes through
 * a security-definer RPC (slot counting, event-open checks and token-based
 * edit rights all live in the database). Hosts read and write through their
 * own authenticated client, so RLS scopes them to events they can edit.
 */

function publicClient() {
  return createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
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

const eventIdSchema = z.string().min(1).max(120);

/* ---------------- Guests (no account needed) ---------------- */

export const fetchBringSheet = createServerFn({ method: "GET" })
  .inputValidator((input) => parseInput(z.object({ eventId: eventIdSchema }), input, "bring-sheet.functions.ts:42"))
  .handler(async ({ data }): Promise<BringSheet> => {
    await rateLimitOrThrow("bring-sheet-read", 120, 60 * 1000);
    const sb = publicClient();
    const { data: row, error } = await sb.rpc("get_public_bring_sheet", { _event_id: data.eventId });
    if (error) throw new Error(error.message);
    const res = (row ?? {}) as Partial<BringSheet>;
    return {
      found: !!res.found,
      eventTitle: res.eventTitle,
      enabled: !!res.enabled,
      allowSuggestions: res.allowSuggestions !== false,
      showNames: res.showNames !== false,
      dietaryCount: res.dietaryCount ?? 0,
      accessibilityCount: res.accessibilityCount ?? 0,
      items: (res.items ?? []) as BringItem[],
    };
  });

export const claimBringItem = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    parseInput(z
      .object({
        itemId: z.string().uuid(),
        name: z.string().trim().max(120).optional(),
        dish: z.string().trim().max(200).optional(),
        note: z.string().trim().max(300).optional(),
      }), input, "bring-sheet.functions.ts:70"),
  )
  .handler(async ({ data }) => {
    await rateLimitOrThrow("bring-claim", 20, 60 * 1000);
    {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: itemRow } = await supabaseAdmin
        .from("event_bring_items")
        .select("event_id")
        .eq("id", data.itemId)
        .maybeSingle();
      const guard = await checkPublicWriteAllowed((itemRow as { event_id?: string } | null)?.event_id);
      if (!guard.ok) return { ok: false as const, error: guard.error };
    }
    const dish = data.dish ? maskProfanity(data.dish).clean : "";
    const note = data.note ? maskProfanity(data.note).clean : "";
    const name = data.name ? maskProfanity(data.name).clean : "";
    const sb = publicClient();
    const { data: row, error } = await sb.rpc("claim_bring_item", {
      _item_id: data.itemId,
      _name: name,
      _dish: dish,
      _note: note,
    });
    if (error) throw new Error(error.message);
    const res = (row ?? {}) as { ok?: boolean; error?: string; id?: string; token?: string };
    if (!res.ok) return { ok: false as const, error: res.error || "Could not sign you up." };
    return { ok: true as const, id: res.id!, token: res.token! };
  });

export const suggestBringItem = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    parseInput(z
      .object({
        eventId: eventIdSchema,
        itemName: z.string().trim().min(1).max(120),
        category: z.string().trim().max(40).optional(),
        serves: z.number().int().min(1).max(500).optional(),
        guestName: z.string().trim().max(120).optional(),
        note: z.string().trim().max(300).optional(),
      }), input, "bring-sheet.functions.ts:101"),
  )
  .handler(async ({ data }) => {
    await rateLimitOrThrow("bring-suggest", 12, 60 * 1000);
    if (isShowcaseEvent(data.eventId)) return showcaseRefusal();
    const guard = await checkPublicWriteAllowed(data.eventId);
    if (!guard.ok) return { ok: false as const, error: guard.error };
    if (isAllProfanity(data.itemName)) {
      return { ok: false as const, error: "Please describe that in kinder words." };
    }
    const sb = publicClient();
    const { data: row, error } = await sb.rpc("suggest_bring_item", {
      _event_id: data.eventId,
      _item_name: maskProfanity(data.itemName).clean,
      _category: data.category ?? "other",
      _serves: data.serves ?? (null as unknown as number),
      _guest_name: data.guestName ? maskProfanity(data.guestName).clean : "",
      _note: data.note ? maskProfanity(data.note).clean : "",
    });
    if (error) throw new Error(error.message);
    const res = (row ?? {}) as { ok?: boolean; error?: string; id?: string; token?: string; itemId?: string };
    if (!res.ok) return { ok: false as const, error: res.error || "Could not add that." };
    return { ok: true as const, id: res.id!, token: res.token!, itemId: res.itemId! };
  });

export const updateBringClaim = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    parseInput(z
      .object({
        id: z.string().uuid(),
        token: z.string().min(8).max(200),
        name: z.string().trim().max(120).optional(),
        dish: z.string().trim().max(200).optional(),
        note: z.string().trim().max(300).optional(),
      }), input, "bring-sheet.functions.ts:133"),
  )
  .handler(async ({ data }) => {
    await rateLimitOrThrow("bring-claim-update", 30, 60 * 1000);
    {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: claimRow } = await supabaseAdmin
        .from("event_bring_claims")
        .select("item_id")
        .eq("id", data.id)
        .maybeSingle();
      const itemId = (claimRow as { item_id?: string } | null)?.item_id;
      let eventId: string | undefined;
      if (itemId) {
        const { data: itemRow } = await supabaseAdmin
          .from("event_bring_items")
          .select("event_id")
          .eq("id", itemId)
          .maybeSingle();
        eventId = (itemRow as { event_id?: string } | null)?.event_id;
      }
      const guard = await checkPublicWriteAllowed(eventId);
      if (!guard.ok) return { ok: false as const, error: guard.error };
    }
    const sb = publicClient();
    const { data: row, error } = await sb.rpc("update_bring_claim_by_token", {
      _id: data.id,
      _token: data.token,
      _name: data.name ? maskProfanity(data.name).clean : "",
      _dish: data.dish ? maskProfanity(data.dish).clean : "",
      _note: data.note ? maskProfanity(data.note).clean : "",
    });
    if (error) throw new Error(error.message);
    const res = (row ?? {}) as { ok?: boolean; error?: string };
    if (!res.ok) return { ok: false as const, error: res.error || "Could not update that sign-up." };
    return { ok: true as const };
  });

export const releaseBringClaim = createServerFn({ method: "POST" })
  .inputValidator((input) => parseInput(z.object({ id: z.string().uuid(), token: z.string().min(8).max(200) }), input, "bring-sheet.functions.ts:152"))
  .handler(async ({ data }) => {
    await rateLimitOrThrow("bring-claim-release", 30, 60 * 1000);
    const sb = publicClient();
    const { data: row, error } = await sb.rpc("release_bring_claim_by_token", {
      _id: data.id,
      _token: data.token,
    });
    if (error) throw new Error(error.message);
    const res = (row ?? {}) as { ok?: boolean; error?: string };
    if (!res.ok) return { ok: false as const, error: res.error || "Could not release that sign-up." };
    return { ok: true as const };
  });

/* ---------------- Host / organizer (RLS scoped) ---------------- */

async function loadItems(supabase: any, eventId: string): Promise<BringItem[]> {
  const { data: items, error } = await supabase
    .from("event_bring_items")
    .select("id,name,note,category,slots_needed,serves,suggested_by_guest,position,created_at")
    .eq("event_id", eventId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const ids = (items ?? []).map((i: any) => i.id);
  let claims: any[] = [];
  if (ids.length) {
    const { data: rows, error: cErr } = await supabase
      .from("event_bring_claims")
      .select("id,item_id,name,dish,note,created_at")
      .in("item_id", ids)
      .order("created_at", { ascending: true });
    if (cErr) throw new Error(cErr.message);
    claims = rows ?? [];
  }
  // Host view only: link each sign-up back to the RSVP list so the host can see
  // who is actually coming with the dish they promised.
  let guests: { name?: string | null; status?: string | null }[] = [];
  if (claims.length) {
    const { data: ev } = await supabase.from("events").select("data").eq("id", eventId).maybeSingle();
    const raw = (ev?.data as any)?.guests;
    if (Array.isArray(raw)) guests = raw;
  }
  return (items ?? []).map((i: any) => ({
    id: i.id,
    name: i.name,
    note: i.note,
    category: i.category,
    slotsNeeded: i.slots_needed,
    serves: i.serves,
    suggested: i.suggested_by_guest,
    claims: claims
      .filter((c) => c.item_id === i.id)
      .map((c) => ({
        id: c.id,
        name: c.name,
        dish: c.dish,
        note: c.note,
        createdAt: c.created_at,
        rsvp: matchGuestRsvp(c.name, guests),
      })),
  }));

}

export const listBringItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(z.object({ eventId: eventIdSchema }), input, "bring-sheet.functions.ts:219"))
  .handler(async ({ data, context }) => {
    const items = await loadItems(context.supabase, data.eventId);
    return { items };
  });

export const addBringItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(z
      .object({
        eventId: eventIdSchema,
        name: z.string().trim().min(1).max(120),
        note: z.string().trim().max(300).optional(),
        category: z.string().trim().max(40).default("other"),
        slotsNeeded: z.number().int().min(1).max(20).default(1),
        serves: z.number().int().min(1).max(500).optional(),
      }), input, "bring-sheet.functions.ts:237"),
  )
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("event_bring_items")
      .select("id", { count: "exact", head: true })
      .eq("event_id", data.eventId);
    if ((count ?? 0) >= 200) return { ok: false as const, error: "This list is full (200 items)." };
    const { data: last } = await context.supabase
      .from("event_bring_items")
      .select("position")
      .eq("event_id", data.eventId)
      .order("position", { ascending: false })
      .limit(1);
    const nextPos = ((last?.[0]?.position as number | undefined) ?? 0) + 1;
    const { error } = await context.supabase.from("event_bring_items").insert({
      event_id: data.eventId,
      name: data.name,
      note: data.note || null,
      category: data.category || "other",
      slots_needed: data.slotsNeeded,
      serves: data.serves ?? null,
      position: nextPos,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, items: await loadItems(context.supabase, data.eventId) };
  });

export const addBringTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(z
      .object({
        eventId: eventIdSchema,
        items: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(120),
              category: z.string().trim().max(40).default("other"),
              slotsNeeded: z.number().int().min(1).max(20).default(1),
              serves: z.number().int().min(1).max(500).optional(),
              note: z.string().trim().max(300).optional(),
            }),
          )
          .min(1)
          .max(60),
      }), input, "bring-sheet.functions.ts:284"),
  )
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("event_bring_items")
      .select("id", { count: "exact", head: true })
      .eq("event_id", data.eventId);
    const room = 200 - (count ?? 0);
    if (room <= 0) return { ok: false as const, error: "This list is full (200 items)." };
    const incoming = data.items.slice(0, room);
    const { data: last } = await context.supabase
      .from("event_bring_items")
      .select("position")
      .eq("event_id", data.eventId)
      .order("position", { ascending: false })
      .limit(1);
    let pos = ((last?.[0]?.position as number | undefined) ?? 0) + 1;
    const rows = incoming.map((i) => ({
      event_id: data.eventId,
      name: i.name,
      note: i.note || null,
      category: i.category || "other",
      slots_needed: i.slotsNeeded,
      serves: i.serves ?? null,
      position: pos++,
    }));
    const { error } = await context.supabase.from("event_bring_items").insert(rows);
    if (error) throw new Error(error.message);
    return {
      ok: true as const,
      added: rows.length,
      skipped: data.items.length - rows.length,
      items: await loadItems(context.supabase, data.eventId),
    };
  });


export const updateBringItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(z
      .object({
        eventId: eventIdSchema,
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        note: z.string().trim().max(300).nullable().optional(),
        category: z.string().trim().max(40).optional(),
        slotsNeeded: z.number().int().min(1).max(20).optional(),
        serves: z.number().int().min(1).max(500).nullable().optional(),
        position: z.number().int().min(0).max(1000).optional(),
      }), input, "bring-sheet.functions.ts:335"),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      name?: string;
      note?: string | null;
      category?: string;
      slots_needed?: number;
      serves?: number | null;
      position?: number;
    } = {};
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.note !== undefined) patch["note"] = data.note || null;
    if (data.category !== undefined) patch["category"] = data.category;
    if (data.slotsNeeded !== undefined) patch["slots_needed"] = data.slotsNeeded;
    if (data.serves !== undefined) patch["serves"] = data.serves;
    if (data.position !== undefined) patch["position"] = data.position;
    if (Object.keys(patch).length) {
      const { error } = await context.supabase
        .from("event_bring_items")
        .update(patch)
        .eq("id", data.id)
        .eq("event_id", data.eventId);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const, items: await loadItems(context.supabase, data.eventId) };
  });

export const deleteBringItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(z.object({ eventId: eventIdSchema, id: z.string().uuid() }), input, "bring-sheet.functions.ts:365"))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("event_bring_items")
      .delete()
      .eq("id", data.id)
      .eq("event_id", data.eventId);
    if (error) throw new Error(error.message);
    return { ok: true as const, items: await loadItems(context.supabase, data.eventId) };
  });

export const removeBringClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(z.object({ eventId: eventIdSchema, id: z.string().uuid() }), input, "bring-sheet.functions.ts:378"))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("event_bring_claims")
      .delete()
      .eq("id", data.id)
      .eq("event_id", data.eventId);
    if (error) throw new Error(error.message);
    return { ok: true as const, items: await loadItems(context.supabase, data.eventId) };
  });

/**
 * One-tap nudge: emails guests who replied yes but have not signed up for
 * anything yet, listing what is still needed. Matching is by name, which is
 * all we have for anonymous sign-ups, so it is deliberately forgiving.
 */
export const nudgeBringSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(z.object({ eventId: eventIdSchema }), input, "bring-sheet.functions.ts:396"))
  .handler(async ({ data, context }) => {
    const { data: ev, error: evErr } = await context.supabase
      .from("events")
      .select("id,data")
      .eq("id", data.eventId)
      .maybeSingle();
    if (evErr) throw new Error(evErr.message);
    if (!ev) return { ok: false as const, error: "Event not found." };

    const eventData = (ev.data ?? {}) as {
      title?: string;
      hosts?: { name?: string }[];
      guests?: { name?: string; email?: string; rsvp?: string }[];
    };
    const items = await loadItems(context.supabase, data.eventId);
    const { openItems, stillNeededSummary } = await import("@/lib/bring-sheet");
    const open = openItems(items);
    if (open.length === 0) {
      return { ok: false as const, error: "Nothing is outstanding — the list is fully covered." };
    }

    const signedUp = new Set<string>();
    for (const i of items) {
      for (const c of i.claims) {
        const key = (c.name ?? "").trim().toLowerCase();
        if (key) signedUp.add(key);
      }
    }

    const recipients = (eventData.guests ?? []).filter((g) => {
      const email = (g.email ?? "").trim();
      if (!email || !email.includes("@")) return false;
      if ((g.rsvp ?? "") !== "yes") return false;
      const name = (g.name ?? "").trim().toLowerCase();
      return !(name && signedUp.has(name));
    });
    if (recipients.length === 0) {
      return { ok: false as const, error: "Everyone who replied yes has already signed up." };
    }

    const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
    const summary = stillNeededSummary(items);
    const stamp = Date.now();
    let sent = 0;
    for (const g of recipients) {
      try {
        const r = await enqueueTransactionalEmailServer({
            templateName: "bring-sheet-nudge",
            recipientEmail: (g.email ?? "").trim(),
            idempotencyKey: `bring-nudge-${data.eventId}-${(g.email ?? "").trim()}-${stamp}`,
            templateData: {
              guestName: g.name || "there",
              hostName: eventData.hosts?.[0]?.name || "",
              eventTitle: eventData.title || "the event",
              neededList: open.map((i) => i.name),
              summary,
              sheetUrl: `https://thekenroecollective.com/bring/${data.eventId}`,
            },
            eventId: data.eventId,
            label: "bring-sheet-nudge",
        });
        if (r.ok) sent += 1;
      } catch {
        // Keep going: one bad address should not stop the rest.
      }
    }
    return { ok: true as const, sent, skipped: recipients.length - sent };
  });
