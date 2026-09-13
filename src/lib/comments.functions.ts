// Invitation comments.
//
// Guests have no account, so posting and reading go through SECURITY DEFINER
// RPCs that bind the comment to a real guest record on the host's list. That
// binding is what rate-limits drive-by spam from strangers who received a
// broadly shared invite link, and it means the host always knows who wrote
// what, even on a private comment.
//
// Visibility is chosen per comment by the person posting, defaulting to
// private. Public is only honoured when the host turned on
// `publicCommentsEnabled` for the event; otherwise the comment is quietly
// kept private rather than dropped.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { isAllProfanity, maskProfanity } from "@/lib/profanity";
import { isShowcaseEvent, showcaseRefusal } from "@/lib/showcase";
import { checkPublicWriteAllowed } from "@/lib/demo-write-guard.server";

export interface GuestComment {
  id: string;
  parentId: string | null;
  guestId: string | null;
  name: string | null;
  body: string;
  visibility: "public" | "private";
  authorRole: "guest" | "host";
  createdAt: string;
}

export interface HostComment extends GuestComment {
  hidden: boolean;
  removedAt: string | null;
  hostReadAt: string | null;
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

export const postEventComment = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    parseInput(z
      .object({
        eventId: z.string().min(1).max(120),
        guestId: z.string().min(1).max(120),
        guestName: z.string().trim().max(120).optional(),
        body: z.string().trim().min(1).max(1200),
        visibility: z.enum(["public", "private"]).default("private"),
      }), input, "comments.functions.ts:66"),
  )
  .handler(async ({ data }) => {
    await rateLimitOrThrow("post-event-comment", 10, 60 * 1000);
    if (isShowcaseEvent(data.eventId)) return showcaseRefusal();
    const guard = await checkPublicWriteAllowed(data.eventId);
    if (!guard.ok) return { ok: false as const, error: guard.error };
    // Profanity is not rejected outright — it is held for host review, so a
    // guest never loses a message to a false positive on a name or nickname.
    const flagged = isAllProfanity(data.body);
    const body = maskProfanity(data.body).clean;
    const sb = publicClient();
    const { data: row, error } = await sb.rpc("post_event_comment", {
      _event_id: data.eventId,
      _guest_id: data.guestId,
      _guest_name: data.guestName ?? "",
      _body: body,
      _visibility: data.visibility,
      _flagged: flagged,
    });
    if (error) throw new Error(error.message);
    const res = (row ?? {}) as {
      ok?: boolean;
      error?: string;
      visibility?: string;
      held?: boolean;
    };
    if (!res.ok) return { ok: false as const, error: res.error || "Could not post that comment." };
    return {
      ok: true as const,
      visibility: (res.visibility as "public" | "private") ?? "private",
      held: res.held === true,
    };
  });

export const fetchEventComments = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    parseInput(z
      .object({
        eventId: z.string().min(1).max(120),
        guestId: z.string().max(120).optional(),
      }), input, "comments.functions.ts:105"),
  )
  .handler(async ({ data }): Promise<GuestComment[]> => {
    await rateLimitOrThrow("fetch-event-comments", 60, 60 * 1000);
    const sb = publicClient();
    const { data: rows, error } = await sb.rpc("get_event_comments_for_guest", {
      _event_id: data.eventId,
      _guest_id: data.guestId ?? "",
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as GuestComment[];
  });

/* ---------- Host / co-host (RLS scoped through can_edit_event) ---------- */

export const listEventComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(z.object({ eventId: z.string().min(1).max(120) }), input, "comments.functions.ts:122"))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("event_comments")
      .select(
        "id,parent_id,guest_id,guest_name,body,visibility,author_role,hidden,removed_at,host_read_at,created_at",
      )
      .eq("event_id", data.eventId)
      .is("removed_at", null)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const comments: HostComment[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      parentId: r.parent_id,
      guestId: r.guest_id,
      name: r.guest_name,
      body: r.body,
      visibility: r.visibility,
      authorRole: r.author_role,
      hidden: r.hidden,
      removedAt: r.removed_at,
      hostReadAt: r.host_read_at,
      createdAt: r.created_at,
    }));
    const unread = comments.filter((c) => c.authorRole === "guest" && !c.hostReadAt).length;
    return { comments, unread };
  });

export const replyToComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(z
      .object({
        eventId: z.string().min(1).max(120),
        parentId: z.string().uuid(),
        hostName: z.string().trim().max(120).optional(),
        body: z.string().trim().min(1).max(1200),
      }), input, "comments.functions.ts:160"),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("event_comments").insert({
      event_id: data.eventId,
      parent_id: data.parentId,
      guest_name: data.hostName || "Host",
      author_role: "host",
      body: data.body,
      visibility: "private",
      host_read_at: new Date().toISOString(),
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const moderateComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(z
      .object({
        id: z.string().uuid(),
        hidden: z.boolean().optional(),
        visibility: z.enum(["public", "private"]).optional(),
        remove: z.boolean().optional(),
      }), input, "comments.functions.ts:186"),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (typeof data.hidden === "boolean") patch.hidden = data.hidden;
    if (data.visibility) patch.visibility = data.visibility;
    if (data.remove) patch.removed_at = new Date().toISOString();
    if (Object.keys(patch).length === 0) return { ok: true as const };
    const { error } = await context.supabase
      .from("event_comments")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const markCommentsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(z.object({ eventId: z.string().min(1).max(120) }), input, "comments.functions.ts:204"))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("event_comments")
      .update({ host_read_at: new Date().toISOString() } as any)
      .eq("event_id", data.eventId)
      .is("host_read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
