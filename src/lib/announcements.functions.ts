import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotDemo } from "@/lib/demo-mode.server";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";

const TYPES = ["venue_change", "cancellation", "date_change", "general"] as const;
const STATUSES = ["draft", "scheduled", "sent"] as const;
const AUDIENCES = ["all_users", "event"] as const;
const CHANNELS = ["in_app", "email", "sms"] as const;

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

async function isOwner(ctx: { supabase: any; userId: string }): Promise<boolean> {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "owner" });
  return !!data;
}

/**
 * Returns true when the user is on a paid app tier (Whisper / Host / Atelier),
 * either via an active Stripe subscription OR the whisper-one-time flag on
 * profiles.tier. Owners always pass.
 */
async function hasPaidTier(ctx: { supabase: any; userId: string }): Promise<boolean> {
  if (await isOwner(ctx)) return true;
  const { data: prof } = await ctx.supabase
    .from("profiles")
    .select("tier")
    .eq("id", ctx.userId)
    .maybeSingle();
  const t = (prof?.tier ?? "").toLowerCase();
  if (t === "whisper" || t === "host" || t === "atelier") return true;
  const { data: subs } = await ctx.supabase
    .from("subscriptions")
    .select("price_id,status,current_period_end")
    .eq("user_id", ctx.userId)
    .in("status", ["active", "trialing", "past_due"]);
  const now = Date.now();
  return (subs ?? []).some((s: any) => {
    const active = !s.current_period_end || new Date(s.current_period_end).getTime() > now;
    const p = (s.price_id ?? "").toLowerCase();
    return active && (p.startsWith("whisper") || p.startsWith("host") || p.startsWith("atelier") || p.startsWith("studio_collective"));
  });
}

/**
 * Announcement authorization:
 *  - audience="all_users" broadcasts → owners only (Adrian & Chris).
 *  - audience="event" → paid tier (whisper/host/atelier) OR owner, AND the
 *    caller must own the event (or be an owner).
 */
async function assertCanPublish(
  ctx: { supabase: any; userId: string },
  audience: "all_users" | "event",
  eventId: string | null | undefined,
  channels: readonly ("in_app" | "email" | "sms")[] = ["in_app"],
) {
  const owner = await isOwner(ctx);
  if (audience === "all_users") {
    if (!owner) throw new Error("Only Kenroe owners can broadcast to all customers.");
    return;
  }
  // event audience
  if (owner) return;
  const wantsEmailOrSms = channels.some((c) => c === "email" || c === "sms");
  // Postcard free-tier lockdown: in-app-only announcements are zero-cost and
  // allowed on any tier. Email/SMS channels require Whisper+.
  if (wantsEmailOrSms) {
    const paid = await hasPaidTier(ctx);
    if (!paid) {
      throw new Error(
        JSON.stringify({
          code: "upgrade_required",
          requiredTier: "whisper",
          message:
            "Upgrade to Whisper to send announcements by email or SMS. In-app announcements remain free.",
        }),
      );
    }
  }
  if (!eventId) throw new Error("Choose which event this announcement is for.");
  const { data: ev } = await ctx.supabase
    .from("events")
    .select("user_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev || ev.user_id !== ctx.userId) throw new Error("You can only announce on events you host.");
  // Rate limit: max 3 published announcements per event per 24 hours to
  // prevent guest fatigue.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await ctx.supabase
    .from("announcements")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "sent")
    .gte("sent_at", since);
  if ((count ?? 0) >= 3) {
    throw new Error("You've already sent 3 announcements for this event in the last 24 hours. Please wait before sending another.");
  }
}


const UpsertInput = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(TYPES),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  link_url: z.string().url().max(500).optional().nullable(),
  link_label: z.string().max(120).optional().nullable(),
  audience: z.enum(AUDIENCES),
  event_id: z.string().max(200).optional().nullable(),
  event_title: z.string().max(200).optional().nullable(),
  channels: z.array(z.enum(CHANNELS)).min(1),
  status: z.enum(STATUSES),
  scheduled_for: z.string().datetime().optional().nullable(),
  email_subject: z.string().max(200).optional().nullable(),
  email_body: z.string().max(8000).optional().nullable(),
  sms_text: z.string().max(480).optional().nullable(),
  image_url: z.string().url().max(1000).optional().nullable(),
});

export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Event-scoped list for the event host (or owner). Returns [] if the caller
// doesn't own the event. Used by the per-event announcements composer.
export const listEventAnnouncements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ event_id: z.string().min(1) }), i, "announcements.functions.ts:142"))
  .handler(async ({ data, context }) => {
    const owner = await isOwner(context);
    if (!owner) {
      const { data: ev } = await context.supabase
        .from("events")
        .select("user_id")
        .eq("id", data.event_id)
        .maybeSingle();
      if (!ev || ev.user_id !== context.userId) return [];
    }
    const { data: rows, error } = await context.supabase
      .from("announcements")
      .select("*")
      .eq("audience", "event")
      .eq("event_id", data.event_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return [];
    return rows ?? [];
  });

export const upsertAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(UpsertInput, i, "announcements.functions.ts:166"))
  .handler(async ({ data, context }) => {
    // Anyone can save a draft, but publishing is gated per audience.
    if (data.status === "sent" || data.status === "scheduled") {
      await assertCanPublish(context, data.audience, data.event_id ?? null, data.channels);
    }

    const now = new Date().toISOString();
    const sendNow = data.status === "sent";
    const row = {
      type: data.type,
      title: data.title,
      body: data.body,
      link_url: data.link_url || null,
      link_label: data.link_label || null,
      audience: data.audience,
      event_id: data.audience === "event" ? data.event_id || null : null,
      event_title: data.audience === "event" ? data.event_title || null : null,
      channels: data.channels,
      status: data.status,
      scheduled_for: data.status === "scheduled" ? data.scheduled_for : null,
      sent_at: sendNow ? now : null,
      email_subject: data.email_subject || null,
      email_body: data.email_body || null,
      sms_text: data.sms_text || null,
      image_url: data.image_url || null,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("announcements").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      if (sendNow && row.event_id) {
        const { markMaterialUse } = await import("@/lib/pass-material-use");
        await markMaterialUse(context.supabase, row.event_id, "announcement_sent", context.userId);
      }
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("announcements")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (sendNow && row.event_id) {
      const { markMaterialUse } = await import("@/lib/pass-material-use");
      await markMaterialUse(context.supabase, row.event_id, "announcement_sent", context.userId);
    }
    return { ok: true, id: inserted.id };
  });

export const sendAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ id: z.string().uuid() }), i, "announcements.functions.ts:218"))
  .handler(async ({ data, context }) => {
    const { data: existing, error: fetchErr } = await context.supabase
      .from("announcements")
      .select("audience,event_id,channels")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr || !existing) throw new Error("Announcement not found");
    await assertCanPublish(
      context,
      existing.audience,
      existing.event_id ?? null,
      (existing.channels as any) ?? ["in_app"],
    );

    const { error } = await context.supabase
      .from("announcements")
      .update({ status: "sent", sent_at: new Date().toISOString(), scheduled_for: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (existing.event_id) {
      const { markMaterialUse } = await import("@/lib/pass-material-use");
      await markMaterialUse(context.supabase, existing.event_id, "announcement_sent", context.userId);
    }
    return { ok: true };
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ id: z.string().uuid() }), i, "announcements.functions.ts:247"))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("announcements")
      .select("event_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Announcement not found");
    if (existing.event_id) {
      // Event-scoped announcement: the host who owns the event may delete
      // their own, in addition to owners/admins. This mirrors the ownership
      // bypass in assertCanPublish/listEventAnnouncements — without it, the
      // delete button in the per-event composer 403'd for every real
      // customer, since this previously required the site admin role
      // unconditionally.
      const owner = await isOwner(context);
      if (!owner) {
        const { data: isAdmin } = await context.supabase.rpc("has_role", {
          _user_id: context.userId,
          _role: "admin",
        });
        if (!isAdmin) {
          const { data: ev } = await context.supabase
            .from("events")
            .select("user_id")
            .eq("id", existing.event_id)
            .maybeSingle();
          if (!ev || ev.user_id !== context.userId) {
            throw new Error("You can only delete announcements for events you host.");
          }
        }
      }
    } else {
      // No event_id means this is (or was meant to be) an all_users broadcast
      // — only site admins/owners can touch those.
      await assertAdmin(context);
    }
    const { error } = await context.supabase.from("announcements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Permissions probe for the UI: tells the client what the current user is
// allowed to publish so composers can hide/lock appropriately.
export const getAnnouncementPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const owner = await isOwner(context);
    const paid = owner ? true : await hasPaidTier(context);
    return {
      canBroadcastAll: owner,
      canPublishEvent: paid, // owner OR whisper/host/atelier
      isOwner: owner,
    };
  });

const DraftInput = z.object({
  type: z.enum(TYPES),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  event_title: z.string().max(200).optional().nullable(),
  link_url: z.string().max(500).optional().nullable(),
  event_id: z.string().max(200).optional().nullable(),
});

export const draftCommunication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(DraftInput, i, "announcements.functions.ts:314"))
  .handler(async ({ data, context }) => {
    await assertNotDemo("generate");
    // Reused by two callers: the site owner drafting an all-customers
    // broadcast (no event_id — requires the admin role), and a host drafting
    // their own per-event announcement (event_id present — requires owning
    // that event). It was previously hard-coded to assertAdmin() only, which
    // meant the "AI polish" button on a regular customer's own event
    // announcement panel threw "Forbidden" for every real customer — nobody
    // but an internal admin account could ever use it.
    if (data.event_id) {
      const owner = await isOwner(context);
      if (!owner) {
        const { data: ev } = await context.supabase
          .from("events")
          .select("user_id")
          .eq("id", data.event_id)
          .maybeSingle();
        if (!ev || ev.user_id !== context.userId) throw new Error("You can only draft announcements for events you host.");
      }
    } else {
      await assertAdmin(context);
    }
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI not configured");
    const gateway = createLovableAiGatewayProvider(key);

    const typeLabel: Record<(typeof TYPES)[number], string> = {
      venue_change: "VENUE CHANGE",
      cancellation: "CANCELLATION",
      date_change: "DATE CHANGE",
      general: "UPDATE",
    };

    const context_str = [
      `Announcement type: ${typeLabel[data.type]}`,
      data.event_title ? `Event: ${data.event_title}` : null,
      `Headline: ${data.title}`,
      `Details from admin: ${data.body}`,
      data.link_url ? `Link to include: ${data.link_url}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const system = `You write warm, clear announcement copy for The Kenroe Collective, an elegant event-planning brand. Tone: refined, considerate, never anxious. Sign off as "— The Kenroe Collective".`;

    const prompt = `Based on the following, return STRICT JSON with three fields:
{
  "email_subject": "<short, specific subject line, max 80 chars>",
  "email_body": "<3-5 short paragraphs of plain text suitable for email body. Open with the news, give the key change(s), close with next-step or thank-you. No markdown.>",
  "sms_text": "<one SMS-sized message, max 300 chars, plain text, includes the most critical change>"
}

${context_str}

Return ONLY the JSON, no prose.`;

    const { text } = await generateText({
      model: gateway("google/gemini-3.6-flash"),
      system,
      prompt,
    });

    let parsed: { email_subject?: string; email_body?: string; sms_text?: string } = {};
    try {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : text);
    } catch {
      parsed = { email_subject: data.title, email_body: data.body, sms_text: data.body.slice(0, 300) };
    }
    return {
      email_subject: (parsed.email_subject || data.title).slice(0, 200),
      email_body: (parsed.email_body || data.body).slice(0, 8000),
      sms_text: (parsed.sms_text || data.body).slice(0, 300),
    };
  });

// --- Public: active sent announcements for banner ---
// Scoped server-side: every caller gets all_users announcements, and
// event-scoped rows ONLY for the one event they're currently viewing (by id,
// or by branded slug for /e/<slug> pages). Unrelated visitors never receive
// another host's event announcement content in the payload.
export const listActiveAnnouncements = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) =>
    parseInput(z
      .object({ eventId: z.string().optional(), slug: z.string().optional() })
      .partial(), i ?? {}, "announcements.functions.ts:400"),
  )
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    let eventId = data?.eventId?.trim() || null;
    if (!eventId && data?.slug) {
      const { data: row } = await sb.rpc("get_public_event_by_slug", { _slug: data.slug.toLowerCase() });
      const resolved = (row as { id?: string } | null)?.id;
      if (resolved) eventId = resolved;
    }

    const select = "id,type,title,body,link_url,link_label,audience,event_id,event_title,sent_at";
    const { data: globals, error } = await sb
      .from("announcements")
      .select(select)
      .eq("status", "sent")
      .eq("audience", "all_users")
      .order("sent_at", { ascending: false })
      .limit(10);
    if (error) return [];
    if (!eventId) return globals ?? [];

    // Event-scoped rows are no longer publicly readable through RLS; a
    // definer RPC returns only the banner-safe columns for this one event.
    const { data: scoped } = await sb.rpc("get_public_event_announcements", { _event_id: eventId });
    return [...((scoped as any[]) ?? []), ...(globals ?? [])].sort((a, b) =>
      String(b.sent_at ?? "").localeCompare(String(a.sent_at ?? "")),
    );
  });


// Admin/owner preview: drafts + scheduled, so they can see what they composed
// at the top of the site before publishing. Non-admins receive [].
export const listAdminPreviewAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: adminFlag }, { data: ownerFlag }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" }),
    ]);
    if (!adminFlag && !ownerFlag) return [];
    const { data, error } = await context.supabase
      .from("announcements")
      .select("id,type,title,body,link_url,link_label,audience,event_id,event_title,status,scheduled_for,sent_at")
      .in("status", ["draft", "scheduled"])
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) return [];
    return data ?? [];
  });

export const dismissAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ announcement_id: z.string().uuid() }), i, "announcements.functions.ts:457"))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("announcement_dismissals")
      .insert({ announcement_id: data.announcement_id, user_id: context.userId });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

export const listMyDismissals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("announcement_dismissals")
      .select("announcement_id")
      .eq("user_id", context.userId);
    return (data ?? []).map((d: { announcement_id: string }) => d.announcement_id);
  });

// Bell inbox feed: published announcements + this user's dismissal state.
// Used by the header notification bell alongside product updates.
export const listMyInboxAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: rows }, { data: dismissed }] = await Promise.all([
      context.supabase
        .from("announcements")
        .select(
          "id,type,title,body,link_url,link_label,image_url,audience,event_id,event_title,sent_at",
        )
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("announcement_dismissals")
        .select("announcement_id")
        .eq("user_id", context.userId),
    ]);
    const dset = new Set((dismissed ?? []).map((d: any) => d.announcement_id as string));
    return (rows ?? []).map((r: any) => ({ ...r, dismissed: dset.has(r.id) }));
  });

// Profile phone / SMS opt-in
const ProfilePhoneInput = z.object({
  phone: z.string().max(40).optional().nullable(),
  sms_opt_in: z.boolean(),
});
export const updateProfilePhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(ProfilePhoneInput, i, "announcements.functions.ts:506"))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ phone: data.phone || null, sms_opt_in: data.sms_opt_in })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("display_name,phone,sms_opt_in")
      .eq("id", context.userId)
      .maybeSingle();
    return data ?? { display_name: null, phone: null, sms_opt_in: false };
  });
