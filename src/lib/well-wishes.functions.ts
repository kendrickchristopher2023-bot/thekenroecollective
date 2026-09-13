import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { isAllProfanity, maskProfanity } from "@/lib/profanity";
import { isShowcaseEvent, showcaseRefusal } from "@/lib/showcase";
import { checkPublicWriteAllowed } from "@/lib/demo-write-guard.server";

export interface WellWish {
  id: string;
  name: string | null;
  message: string;
  createdAt: string;
  hidden?: boolean;
}

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
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

/* ---------- Guests (no account needed) ---------- */

export const postWellWish = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    parseInput(z
      .object({
        eventId: z.string().min(1).max(120),
        name: z.string().trim().max(120).optional(),
        message: z.string().trim().min(1).max(2000),
      }), input, "well-wishes.functions.ts:43"),
  )
  .handler(async ({ data }) => {
    await rateLimitOrThrow("post-well-wish", 12, 60 * 1000);
    // The public showcase is read-only on every surface a stranger could put
    // words in front of the next visitor. See src/lib/showcase.ts.
    if (isShowcaseEvent(data.eventId)) return showcaseRefusal();
    const guard = await checkPublicWriteAllowed(data.eventId);
    if (!guard.ok) return { ok: false as const, error: guard.error };
    if (isAllProfanity(data.message)) {
      return { ok: false as const, error: "Please rewrite that message in kinder words." };
    }
    const message = maskProfanity(data.message).clean;
    const name = data.name ? maskProfanity(data.name).clean : undefined;
    const sb = publicClient();
    const { data: row, error } = await sb.rpc("add_well_wish", {
      _event_id: data.eventId,
      _name: name ?? "",
      _message: message,
    });
    if (error) throw new Error(error.message);
    const res = (row ?? {}) as { ok?: boolean; error?: string };
    if (!res.ok) return { ok: false as const, error: res.error || "Could not post that message." };
    return { ok: true as const };
  });

export const fetchPublicWellWishes = createServerFn({ method: "GET" })
  .inputValidator((input) => parseInput(z.object({ eventId: z.string().min(1).max(120) }), input, "well-wishes.functions.ts:65"))
  .handler(async ({ data }): Promise<WellWish[]> => {
    await rateLimitOrThrow("fetch-well-wishes", 60, 60 * 1000);
    const sb = publicClient();
    const { data: rows, error } = await sb.rpc("get_public_well_wishes", {
      _event_id: data.eventId,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as WellWish[];
  });

/* ---------- Organizer only (RLS scoped to the event owner) ---------- */

export const listWellWishes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(z.object({ eventId: z.string().min(1).max(120) }), input, "well-wishes.functions.ts:80"))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("event_well_wishes")
      .select("id,name,message,hidden,created_at")
      .eq("event_id", data.eventId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const wishes: WellWish[] = (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      message: r.message,
      hidden: r.hidden,
      createdAt: r.created_at,
    }));
    const { data: ev } = await context.supabase
      .from("events")
      .select("honoree_email,wishes_sent_at")
      .eq("id", data.eventId)
      .maybeSingle();
    return {
      wishes,
      honoreeEmail: ev?.honoree_email ?? null,
      wishesSentAt: ev?.wishes_sent_at ?? null,
    };
  });

export const setHonoreeEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(z
      .object({
        eventId: z.string().min(1).max(120),
        email: z.union([z.string().trim().email().max(320), z.literal("")]),
      }), input, "well-wishes.functions.ts:115"),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("events")
      .update({ honoree_email: data.email === "" ? null : data.email.toLowerCase() })
      .eq("id", data.eventId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setWellWishHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(z.object({ id: z.string().uuid(), hidden: z.boolean() }), input, "well-wishes.functions.ts:128"))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("event_well_wishes")
      .update({ hidden: data.hidden })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteWellWish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(z.object({ id: z.string().uuid() }), input, "well-wishes.functions.ts:140"))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("event_well_wishes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Emails every visible well wish to the organizer-set honoree address as one
 * digest, using the app's existing verified email pipeline (the transactional
 * queue). Guests are never emailed here.
 */
export const sendWellWishesDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(z.object({ eventId: z.string().min(1).max(120) }), input, "well-wishes.functions.ts:154"))
  .handler(async ({ data, context }) => {
    const { data: ev, error: evErr } = await context.supabase
      .from("events")
      .select("id,honoree_email,data")
      .eq("id", data.eventId)
      .maybeSingle();
    if (evErr) throw new Error(evErr.message);
    if (!ev) return { ok: false as const, error: "Event not found." };
    if (!ev.honoree_email) {
      return { ok: false as const, error: "Add an honoree email first." };
    }
    const { data: rows, error } = await context.supabase
      .from("event_well_wishes")
      .select("name,message,created_at")
      .eq("event_id", data.eventId)
      .eq("hidden", false)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) {
      return { ok: false as const, error: "There are no well wishes to send yet." };
    }

    const eventData = (ev.data ?? {}) as { title?: string; image?: string };
    // Server-side enqueue, NOT the /lovable send route: that route only allows a
    // short caller-sendable template allow-list (thank-you-card, announcements,
    // admin-notification) and returned 403 "Template not available" for this
    // digest. Ownership is already proven above by the RLS-scoped event read.
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
    const res = await enqueueTransactionalEmailServer({
      templateName: "well-wishes-digest",
      recipientEmail: ev.honoree_email,
      idempotencyKey: `well-wishes-${data.eventId}-${rows.length}-${Date.now()}`,
      eventId: data.eventId,
      label: "well-wishes-digest",
      templateData: {
        eventTitle: eventData.title || "your celebration",
        // Stripped automatically unless it is an inbox-safe absolute https URL.
        coverImage: eventData.image || "",
        wishes: rows.map((r) => ({ name: r.name || "A guest", message: r.message })),
      },
    });
    if (!res.ok) {
      return {
        ok: false as const,
        error:
          res.reason === "suppressed" || res.reason === "already_unsubscribed"
            ? "That honoree address has unsubscribed from our emails."
            : "Could not send the well wishes just now. Please try again.",
      };
    }

    await context.supabase
      .from("events")
      .update({ wishes_sent_at: new Date().toISOString() })
      .eq("id", data.eventId);

    return { ok: true as const, count: rows.length };
  });
