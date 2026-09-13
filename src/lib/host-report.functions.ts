// Host-facing master guest report data.
//
// This payload carries every guest's email, phone and dietary/medical notes, so
// access is verified SERVER-SIDE on every call: authenticated session +
// public.can_edit_event (owner or co-host with edit rights). Nothing here is
// reachable from a public/shareable link.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotDemo } from "@/lib/demo-mode.server";

const Input = z.object({ eventId: z.string().min(1).max(64) });

export interface HostReportPayload {
  eventId: string;
  /** Stored event JSON (guests, seating, payments) as the server sees it. */
  data: Record<string, any>;
  updatedAt: string | null;
  verifiedAt: string;
}

export const getHostMasterReportData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(Input, input, "host-report.functions.ts:23"))
  .handler(async ({ data, context }): Promise<HostReportPayload> => {
    await assertNotDemo("export");
    const supabase = context.supabase as any;

    // Server-side authorisation: host or edit-capable co-host only.
    const { data: mayEdit, error: rpcError } = await supabase.rpc("can_edit_event", {
      _event_id: data.eventId,
      _user_id: context.userId,
    });
    if (rpcError) throw new Error("Could not verify access to this event");
    if (mayEdit !== true) throw new Response("Forbidden", { status: 403 });

    // Read through the caller's own client so RLS applies a second time.
    const { data: row, error } = await supabase
      .from("events")
      .select("id,data,updated_at")
      .eq("id", data.eventId)
      .maybeSingle();
    if (error || !row) throw new Error("Event not found");

    return {
      eventId: String((row as any).id),
      data: ((row as any).data ?? {}) as Record<string, any>,
      updatedAt: ((row as any).updated_at as string | null) ?? null,
      verifiedAt: new Date().toISOString(),
    };
  });
