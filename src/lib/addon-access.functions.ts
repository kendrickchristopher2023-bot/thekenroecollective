import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseInput } from "@/lib/user-error";
import { accountAddonAccess, eventOwnerId } from "@/lib/addon-access.server";

export const assertEventAddonAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(z.object({
    eventId: z.string().min(1).max(120),
    kind: z.enum(["guest_import", "thank_you_cards"]),
  }), input, "addon-access.functions.ts"))
  .handler(async ({ data, context }) => {
    const ownerId = await eventOwnerId(context.supabase, data.eventId);
    if (!ownerId) throw new Error("Event not found.");
    if (ownerId !== context.userId) {
      const { data: member } = await context.supabase
        .from("event_members")
        .select("role,status")
        .eq("event_id", data.eventId)
        .eq("user_id", context.userId)
        .eq("status", "active")
        .maybeSingle();
      if (member?.role !== "cohost") throw new Error("You cannot edit this event.");
    }
    if (!(await accountAddonAccess(context.supabase, ownerId, data.kind))) {
      throw new Error(data.kind === "guest_import"
        ? "Bulk guest import is not unlocked for this account."
        : "The thank-you card studio is not unlocked for this account.");
    }
    return { ok: true };
  });