import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Cross-event messaging report for owners: what emails and texts actually went
 * out to guests, platform-wide. Read-only — no send actions here.
 *
 * Auth follows the existing owner convention exactly: owner/super_admin role +
 * satisfied MFA via assertOwnerAccess. Reads use the service-role client
 * because email_send_log / sms_outbox are deliberately not readable by hosts.
 */

export type MessagingChannel = "email" | "sms";

export type MessagingRow = {
  id: string;
  channel: MessagingChannel;
  recipient: string;
  eventId: string | null;
  eventTitle: string | null;
  kind: string;
  status: string;
  error: string | null;
  createdAt: string;
};

export type MessagingReport = {
  rows: MessagingRow[];
  events: { id: string; title: string }[];
  counts: Record<string, number>;
  truncated: boolean;
};

type Input = {
  since?: string;
  until?: string;
  channel?: "all" | MessagingChannel;
  eventId?: string;
  status?: string;
  search?: string;
  limit?: number;
};

async function assertOwner(supabase: any, userId: string) {
  const { assertOwnerAccess } = await import("@/lib/owner-guard.server");
  await assertOwnerAccess(supabase, userId);
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export const listOwnerMessagingLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<MessagingReport> => {
    await assertOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const until = data.until ?? new Date().toISOString();
    const since = data.since ?? new Date(Date.now() - 7 * 864e5).toISOString();
    const limit = Math.min(Math.max(data.limit ?? 300, 1), 1000);
    const channel = data.channel ?? "all";

    const rows: MessagingRow[] = [];

    // ---- Email (deduplicated by message_id: latest status per message wins) --
    if (channel !== "sms") {
      const { data: emails, error } = await supabaseAdmin
        .from("email_send_log")
        .select("id, message_id, template_name, recipient_email, status, error_message, metadata, created_at")
        .gte("created_at", since)
        .lte("created_at", until)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw new Error(error.message);

      const seen = new Set<string>();
      for (const r of (emails ?? []) as any[]) {
        const key = r.message_id ?? r.id;
        if (seen.has(key)) continue; // newest row per message_id already taken
        seen.add(key);
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        rows.push({
          id: String(r.id),
          channel: "email",
          recipient: r.recipient_email ?? "—",
          eventId: asString(meta["event_id"]),
          eventTitle: null,
          kind: r.template_name ?? "email",
          status: r.status ?? "unknown",
          error: r.error_message ?? asString(meta["severity"]),
          createdAt: r.created_at,
        });
      }
    }

    // ---- SMS ---------------------------------------------------------------
    if (channel !== "email") {
      const { data: sms, error } = await supabaseAdmin
        .from("sms_outbox")
        .select("id, event_id, to_phone, guest_name, status, error, provider, created_at, sent_at")
        .gte("created_at", since)
        .lte("created_at", until)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw new Error(error.message);

      for (const r of (sms ?? []) as any[]) {
        rows.push({
          id: String(r.id),
          channel: "sms",
          recipient: r.guest_name ? `${r.guest_name} · ${r.to_phone}` : r.to_phone,
          eventId: r.event_id ?? null,
          eventTitle: null,
          kind: r.provider === "demo" ? "sms (demo)" : "sms reminder",
          status: r.status ?? "unknown",
          error: r.error ?? null,
          createdAt: r.created_at,
        });
      }
    }

    // ---- Event titles -------------------------------------------------------
    const eventIds = Array.from(new Set(rows.map((r) => r.eventId).filter((v): v is string => !!v)));
    const titles = new Map<string, string>();
    if (eventIds.length) {
      const { data: evs } = await supabaseAdmin
        .from("events")
        .select("id, data")
        .in("id", eventIds);
      for (const e of (evs ?? []) as any[]) {
        titles.set(e.id, asString(e.data?.title) ?? e.id);
      }
    }
    for (const r of rows) if (r.eventId) r.eventTitle = titles.get(r.eventId) ?? null;

    // ---- Filters ------------------------------------------------------------
    let filtered = rows;
    if (data.eventId) filtered = filtered.filter((r) => r.eventId === data.eventId);
    if (data.status && data.status !== "all") filtered = filtered.filter((r) => r.status === data.status);
    const q = (data.search ?? "").trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (r) =>
          r.recipient.toLowerCase().includes(q) ||
          r.kind.toLowerCase().includes(q) ||
          (r.eventTitle ?? "").toLowerCase().includes(q),
      );
    }

    filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const counts: Record<string, number> = {};
    for (const r of filtered) counts[r.status] = (counts[r.status] ?? 0) + 1;

    // Distinct events present in the unfiltered window, for the filter dropdown.
    const events = Array.from(
      new Map(
        rows
          .filter((r) => r.eventId)
          .map((r) => [r.eventId!, { id: r.eventId!, title: r.eventTitle ?? r.eventId! }] as const),
      ).values(),
    ).sort((a, b) => a.title.localeCompare(b.title));

    return {
      rows: filtered.slice(0, limit),
      events,
      counts,
      truncated: filtered.length > limit,
    };
  });
