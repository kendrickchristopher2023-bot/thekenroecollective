// Server-side helpers for the owner/admin event report.
//
// Kept out of the *.functions.ts wrapper so nothing but imports, types and
// server-function declarations live in the split module.
import {
  buildGuestReport,
  guestNeedRows,
  guestReportSummaryPairs,
  type GuestNeedRow,
  type GuestReport,
} from "@/lib/guest-report";
import { RECONCILIATION_CAVEAT, type EventReconciliation } from "@/lib/payment-reconciliation";

type Sb = any;

/** Owner (MFA-satisfied) or admin. Mirrors the reconciliation report's guard. */
export async function assertReportAccess(supabase: Sb, userId: string): Promise<void> {
  const guard = await import("@/lib/owner-guard.server");
  if (await guard.hasOwnerRole(supabase, userId)) {
    await guard.assertOwnerMfaSatisfied(supabase, userId);
    return;
  }
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}

export interface EventFullReport {
  generatedAt: string;
  eventId: string;
  title: string;
  when: string;
  venue: string;
  ownerEmail: string | null;
  report: GuestReport;
  reconciliation: EventReconciliation;
  caveat: string;
}

/** Load one event with trusted credentials and build its complete report. */
export async function loadEventFullReport(eventId: string): Promise<EventFullReport> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { reconcileEvent } = await import("@/lib/payment-reconciliation");

  const { data: row, error } = await supabaseAdmin
    .from("events")
    .select("id,user_id,data,updated_at")
    .eq("id" as never, eventId as never)
    .maybeSingle();
  if (error || !row) throw new Error("Event not found");

  const data = ((row as any).data ?? {}) as Record<string, any>;
  let ownerEmail: string | null = null;
  if ((row as any).user_id) {
    // `profiles` has no email column; emails live in auth.users.
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(String((row as any).user_id));
    ownerEmail = (u?.user?.email as string | null) ?? null;
  }

  return {
    generatedAt: new Date().toISOString(),
    eventId,
    title: typeof data.title === "string" && data.title ? data.title : "Untitled event",
    when: typeof data.date === "string" ? data.date : "",
    venue: typeof data.venue === "string" ? data.venue : "",
    ownerEmail,
    report: buildGuestReport(data, eventId),
    reconciliation: reconcileEvent(eventId, data),
    caveat: RECONCILIATION_CAVEAT,
  };
}

/** Rows the emailed table shows before it truncates. Keeps messages sane. */
export const EMAIL_TABLE_LIMIT = 60;

/** Columns worth reading in an email body; the CSV still carries everything. */
const EMAIL_COLUMNS = [
  "Name",
  "RSVP",
  "Party headcount",
  "Dietary restrictions",
  "Accessibility needs",
  "T-shirt size",
  "Balance",
  "Payment status",
];

export function emailTable(report: GuestReport): {
  columns: string[];
  rows: (string | number)[][];
  truncated: number;
} {
  const idx = EMAIL_COLUMNS.map((c) => report.columns.indexOf(c)).filter((i) => i >= 0);
  const columns = idx.map((i) => report.columns[i]!);
  const all = report.rows.map((r) => idx.map((i) => r[i] ?? ""));
  return {
    columns,
    rows: all.slice(0, EMAIL_TABLE_LIMIT),
    truncated: Math.max(0, all.length - EMAIL_TABLE_LIMIT),
  };
}

export function eventReportEmailPayload(full: EventFullReport): Record<string, unknown> {
  const table = emailTable(full.report);
  return {
    title: `Guest report — ${full.title}`,
    subtitle: [full.when, full.venue].filter(Boolean).join(" · "),
    intro: "Everything guests submitted for this event: RSVP status, party size, dietary restrictions, accessibility needs, T-shirt sizes and payment status.",
    pairs: guestReportSummaryPairs(full.report),
    columns: table.columns,
    rows: table.rows,
    truncated: table.truncated,
    note: full.report.flags.payments ? full.caveat : "",
  };
}

export { guestReportSummaryPairs };

export interface GuestNeedsEvent {
  eventId: string;
  title: string;
  when: string;
  venue: string;
  ownerEmail: string | null;
  guests: number;
  withDietary: number;
  withAccessibility: number;
  needs: GuestNeedRow[];
}

/**
 * Cross-event dietary + accessibility overview.
 *
 * Owners asked for this to be findable on its own, not only inside a
 * per-event drill-down: catering and venue accommodations are the reason the
 * questions are asked in the first place.
 */
export async function loadGuestNeedsOverview(): Promise<{
  generatedAt: string;
  events: GuestNeedsEvent[];
  totals: { events: number; withDietary: number; withAccessibility: number };
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Demo boundary: this is a cross-event owner report, so seeded demo events
  // must never inflate it. Production requests drop them; the demo environment
  // sees only them.
  const { getDemoScope } = await import("@/lib/demo-accounts.server");
  const scope = await getDemoScope();
  const { data: rows, error } = await supabaseAdmin
    .from("events")
    .select("id,user_id,data")
    .eq("is_demo" as never, scope.isDemo as never)
    .order("updated_at" as never, { ascending: false })
    .limit(500);
  if (error) throw new Error("Could not load events");

  const ownerIds = Array.from(
    new Set(((rows ?? []) as any[]).map((r) => r.user_id).filter(Boolean) as string[]),
  );
  const emails = new Map<string, string>();
  if (ownerIds.length) {
    // Emails live in auth.users, not public.profiles.
    const { emailById } = await import("@/lib/admin-directory.server");
    const directory = await emailById();
    for (const id of ownerIds) {
      const email = directory.get(id);
      if (email) emails.set(id, email);
    }
  }

  const events: GuestNeedsEvent[] = [];
  for (const row of ((rows ?? []) as any[])) {
    const data = (row?.data ?? {}) as Record<string, any>;
    const report = buildGuestReport(data, String(row.id));
    const needs = guestNeedRows(report);
    if (!needs.length) continue;
    events.push({
      eventId: String(row.id),
      title: typeof data.title === "string" && data.title ? data.title : "Untitled event",
      when: typeof data.date === "string" ? data.date : "",
      venue: typeof data.venue === "string" ? data.venue : "",
      ownerEmail: row.user_id ? emails.get(String(row.user_id)) ?? null : null,
      guests: report.summary.guests,
      withDietary: report.summary.withDietary,
      withAccessibility: report.summary.withAccessibility,
      needs,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    events,
    totals: {
      events: events.length,
      withDietary: events.reduce((a, e) => a + e.withDietary, 0),
      withAccessibility: events.reduce((a, e) => a + e.withAccessibility, 0),
    },
  };
}
