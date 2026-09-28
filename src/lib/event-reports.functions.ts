// Owner/admin per-event report + on-demand "email this report" actions.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotDemo } from "@/lib/demo-mode.server";
import type { EventFullReport, GuestNeedsEvent } from "@/lib/event-reports.server";

export type { EventFullReport, GuestNeedsEvent };

const EventInput = z.object({ eventId: z.string().min(1).max(64) });
const EmailEventInput = z.object({
  eventId: z.string().min(1).max(64),
  to: z.string().email().max(254),
});
const EmailReconInput = z.object({ to: z.string().email().max(254) });

/** Complete single-event report: guest data + attendance + payment reconciliation. */
export const getEventFullReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(EventInput, input, "event-reports.functions.ts:19"))
  .handler(async ({ data, context }): Promise<EventFullReport> => {
    await assertNotDemo("export");
    const mod = await import("@/lib/event-reports.server");
    await mod.assertReportAccess(context.supabase as any, context.userId);
    return mod.loadEventFullReport(data.eventId);
  });

/** Send the single-event report to any address, on demand. */
export const emailEventReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(EmailEventInput, input, "event-reports.functions.ts:29"))
  .handler(async ({ data, context }): Promise<{ ok: boolean; reason?: string }> => {
    await assertNotDemo("email report");
    const mod = await import("@/lib/event-reports.server");
    await mod.assertReportAccess(context.supabase as any, context.userId);
    const full = await mod.loadEventFullReport(data.eventId);
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
    const { logAdminAction } = await import("@/lib/admin-audit.server");
    const res = await enqueueTransactionalEmailServer({
      templateName: "report-delivery",
      recipientEmail: data.to,
      idempotencyKey: `event-report-${data.eventId}-${Date.now()}`,
      label: "event-report",
      eventId: data.eventId,
      templateData: mod.eventReportEmailPayload(full),
    });
    await logAdminAction({
      actorUserId: context.userId,
      action: "email_event_report",
      details: { event_id: data.eventId, to: data.to, ok: res.ok, reason: res.reason ?? null },
    }).catch(() => {});
    return res;
  });

/** Send the cross-event reconciliation summary to any address, on demand. */
export const emailReconciliationReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(EmailReconInput, input, "event-reports.functions.ts:55"))
  .handler(async ({ data, context }): Promise<{ ok: boolean; reason?: string }> => {
    await assertNotDemo("email report");
    const mod = await import("@/lib/event-reports.server");
    await mod.assertReportAccess(context.supabase as any, context.userId);
    const recon = await import("@/lib/reconciliation-email.server");
    const payload = await recon.reconciliationEmailPayload();
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
    const { logAdminAction } = await import("@/lib/admin-audit.server");
    const res = await enqueueTransactionalEmailServer({
      templateName: "report-delivery",
      recipientEmail: data.to,
      idempotencyKey: `recon-report-${Date.now()}`,
      label: "reconciliation-report",
      templateData: payload,
    });
    await logAdminAction({
      actorUserId: context.userId,
      action: "email_reconciliation_report",
      details: { report: "payment-reconciliation", to: data.to, ok: res.ok, reason: res.reason ?? null },
    }).catch(() => {});
    return res;
  });

/** Cross-event dietary + accessibility overview for owners and admins. */
export const getGuestNeedsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await import("@/lib/event-reports.server");
    await mod.assertReportAccess(context.supabase as any, context.userId);
    return mod.loadGuestNeedsOverview();
  });
