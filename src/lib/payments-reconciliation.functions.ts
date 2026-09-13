// Owner + admin payment reconciliation report.
//
// Self-reported money only (Cash App / Venmo / Zelle / PayPal / cash / check).
// Reads events with trusted server credentials AFTER confirming the caller has
// the owner or admin role, and respects the demo/production split.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EventReconciliation, MethodTotals } from "@/lib/payment-reconciliation";

const Input = z
  .object({
    /** Only events with payment collection turned on, by default. */
    includeDisabled: z.boolean().optional().default(false),
    limit: z.number().int().min(1).max(500).optional().default(200),
  })
  .default({});

export type ReconciliationReport = {
  generatedAt: string;
  totals: {
    events: number;
    billed: number;
    collected: number;
    refunded: number;
    outstanding: number;
    byMethod: MethodTotals[];
  };
  events: (EventReconciliation & { ownerEmail: string | null; updatedAt: string })[];
};

export const getPaymentReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(Input, input ?? {}, "payments-reconciliation.functions.ts:34"))
  .handler(async ({ data, context }): Promise<ReconciliationReport> => {
    const guard = await import("@/lib/owner-guard.server");
    if (await guard.hasOwnerRole(context.supabase as any, context.userId)) {
      await guard.assertOwnerMfaSatisfied(context.supabase as any, context.userId);
    } else {
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!isAdmin) throw new Error("Forbidden");
    }

    const { reconcileEvent, rollUp } = await import("@/lib/payment-reconciliation");
    // Demo rows are excluded by default by the shared accessor; ?demo=1 opts in.
    const { eventsReadQuery } = await import("@/lib/events-access.server");
    const { query } = await eventsReadQuery("id,user_id,data,updated_at");

    const { data: rows, error } = await query
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error("Could not load events");

    const eventRows = (rows ?? []) as Array<{
      id: string;
      user_id: string | null;
      data: Record<string, any> | null;
      updated_at: string;
    }>;
    const ownerIds = eventRows
      .map((r) => r.user_id)
      .filter((v): v is string => typeof v === "string");
    const emails = new Map<string, string | null>();
    if (ownerIds.length) {
      // Emails live in auth.users, not public.profiles.
      const { emailById } = await import("@/lib/admin-directory.server");
      const directory = await emailById();
      for (const id of ownerIds) emails.set(id, directory.get(id) ?? null);
    }

    const events = eventRows
      .map((r) => {
        const recon = reconcileEvent(String(r.id), (r.data ?? {}) as Record<string, any>);
        return {
          ...recon,
          ownerEmail: (r.user_id ? emails.get(r.user_id) : null) ?? null,
          updatedAt: String(r.updated_at),
        };
      })
      .filter((r) => (data.includeDisabled ? true : r.paymentEnabled))
      .filter((r) => (data.includeDisabled ? true : r.billed > 0 || r.collected > 0));

    return {
      generatedAt: new Date().toISOString(),
      totals: rollUp(events),
      events,
    };
  });
