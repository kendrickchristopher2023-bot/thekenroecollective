// Builds the emailed cross-event reconciliation summary from trusted credentials.
import { RECONCILIATION_CAVEAT } from "@/lib/payment-reconciliation";

function money(n: number): string {
  return `$${(Math.round(n * 100) / 100).toFixed(2)}`;
}

/** Same numbers the owner reconciliation panel shows, shaped for the email template. */
export async function reconciliationEmailPayload(limit = 200): Promise<Record<string, unknown>> {
  const { reconcileEvent, rollUp } = await import("@/lib/payment-reconciliation");
  // Demo rows are excluded by default by the shared events accessor.
  const { eventsReadQuery } = await import("@/lib/events-access.server");
  const { query } = await eventsReadQuery("id,user_id,data,updated_at");

  const { data: rows, error } = await query
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Could not load events");

  const events = ((rows ?? []) as Array<{ id: string; data: Record<string, any> | null }>)
    .map((r) => reconcileEvent(String(r.id), (r.data ?? {}) as Record<string, any>))
    .filter((r) => r.paymentEnabled && (r.billed > 0 || r.collected > 0));
  const totals = rollUp(events);

  const table = events
    .slice()
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 60)
    .map((e) => [e.title, money(e.billed), money(e.collected), money(e.outstanding), `${e.unpaidGuests} / ${e.partialGuests}`]);

  return {
    title: "Payment reconciliation report",
    subtitle: `${events.length} event${events.length === 1 ? "" : "s"} with payment collection on`,
    intro: "Billed vs collected vs outstanding across every event, plus the per-event breakdown.",
    pairs: [
      { label: "Events", value: String(totals.events) },
      { label: "Billed", value: money(totals.billed) },
      { label: "Collected", value: money(totals.collected) },
      { label: "Refunded", value: money(totals.refunded) },
      { label: "Outstanding", value: money(totals.outstanding) },
      ...totals.byMethod.map((m) => ({ label: `Collected · ${m.label}`, value: money(m.net) })),
    ],
    columns: ["Event", "Billed", "Collected", "Outstanding", "Unpaid / partial"],
    rows: table,
    truncated: Math.max(0, events.length - table.length),
    note: RECONCILIATION_CAVEAT,
  };
}
