/**
 * Demo boundary for scheduled jobs.
 *
 * Cron workers carry no request, so isDemoRequest() can never fire for them.
 * They must decide by the data instead: an event flagged is_demo, the
 * showcase, or a row owned by the demo/showcase accounts is skipped before
 * any work (or any send) happens. Every hook under
 * src/routes/api/public/hooks imports from here.
 *
 * Server-only.
 */
import { SHOWCASE_EVENT_ID, isShowcaseEvent } from "@/lib/showcase";

type AnyClient = { from: (table: string) => any };

/** Owner ids whose rows are demo data (demo host + showcase system account). */
export async function demoOwnerIds(): Promise<string[]> {
  try {
    const { getDemoUserIds } = await import("@/lib/demo-accounts.server");
    return await getDemoUserIds();
  } catch {
    return [];
  }
}

/**
 * Apply the job-side demo boundary to an `events` query builder: never the
 * showcase, never an is_demo row. Chain this right after `.from("events")`.
 */
export function excludeDemoEvents<T>(query: T): T {
  const q = query as any;
  return q.eq("is_demo", false).neq("id", SHOWCASE_EVENT_ID) as T;
}

/**
 * For jobs that load one event at a time by id: true when the row must be
 * skipped. `row` may be null when the event no longer exists.
 */
export function isDemoEventRow(
  eventId: string | null | undefined,
  row: { is_demo?: boolean | null } | null | undefined,
): boolean {
  if (isShowcaseEvent(eventId ?? "")) return true;
  return !!row?.is_demo;
}

/** True when the given owner id belongs to a demo account. */
export async function isDemoOwner(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const ids = await demoOwnerIds();
  return ids.includes(userId);
}

/**
 * Filter a page of sms_outbox rows: rows for demo/showcase events or demo
 * owners are marked `skipped_demo` (so they are never re-read) and dropped
 * from the returned list. Returns the rows that may be sent.
 */
export async function skipDemoOutboxRows<
  R extends { id: string; event_id?: string | null; user_id?: string | null },
>(admin: AnyClient, rows: R[]): Promise<R[]> {
  if (!rows.length) return rows;
  const owners = new Set(await demoOwnerIds());
  const eventIds = Array.from(
    new Set(rows.map((r) => r.event_id).filter((v): v is string => !!v)),
  );
  const demoEvents = new Set<string>([SHOWCASE_EVENT_ID]);
  if (eventIds.length) {
    const { data } = await admin
      .from("events")
      .select("id,is_demo")
      .in("id", eventIds)
      .eq("is_demo", true);
    for (const e of (data ?? []) as { id: string }[]) demoEvents.add(e.id);
  }
  const skip = rows.filter(
    (r) => (r.event_id && demoEvents.has(r.event_id)) || (r.user_id && owners.has(r.user_id)),
  );
  if (skip.length) {
    await admin
      .from("sms_outbox")
      .update({ status: "skipped_demo", error: "Demo data: never sent" })
      .in("id", skip.map((r) => r.id));
  }
  const skipped = new Set(skip.map((r) => r.id));
  return rows.filter((r) => !skipped.has(r.id));
}
