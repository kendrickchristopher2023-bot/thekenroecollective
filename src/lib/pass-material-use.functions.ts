// Client-callable server fn: stamp first material use on a pass attached to
// this event. Used from client-side exports and the check-in panel where the
// action itself doesn't run through another server fn.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { markMaterialUse } from "@/lib/pass-material-use";

export const markEventMaterialUse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      eventId: z.string().min(1).max(120),
      reason: z.string().min(1).max(80),
    }), d, "pass-material-use.functions.ts:12"),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await markMaterialUse(context.supabase, data.eventId, data.reason, context.userId);
    return { ok: true };
  });
