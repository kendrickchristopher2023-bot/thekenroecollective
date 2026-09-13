import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { isShowcaseEvent } from "@/lib/showcase";
import { checkPublicWriteAllowed } from "@/lib/demo-write-guard.server";

/**
 * Public, no account required: record a guest's Yes / Maybe / No the instant
 * they tap it, whether that tap happened in the email or on the invitation
 * page. Details are asked afterwards and are optional, so an abandoned form
 * never loses the answer.
 */
export const quickRsvp = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    parseInput(z
      .object({
        eventId: z.string().min(1).max(120),
        guestId: z.string().min(1).max(60),
        answer: z.enum(["yes", "maybe", "no"]),
      }), input, "rsvp-quick.functions.ts:18"),
  )
  .handler(async ({ data }) => {
    // Showcase: the tap is acknowledged in the interface, nothing is stored.
    if (isShowcaseEvent(data.eventId)) return { ok: true as const, showcase: true as const, confirmation: null as string | null };
    const guard = await checkPublicWriteAllowed(data.eventId);
    if (!guard.ok) return { ok: false as const, showcase: false as const, confirmation: null as string | null, error: guard.error };
    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceIpRateLimit } = await import("@/lib/rate-limit.server");
    try {
      const limited = enforceIpRateLimit(getRequest(), {
        scope: "quick-rsvp",
        max: 30,
        windowMs: 60 * 1000,
      });
      if (limited) throw limited;
    } catch (e) {
      if (e instanceof Response) throw e;
    }

    let origin: string | undefined;
    try {
      origin = new URL(getRequest().url).origin;
    } catch {
      origin = undefined;
    }

    const { recordQuickRsvp } = await import("@/lib/rsvp-quick.server");
    return recordQuickRsvp({
      eventId: data.eventId,
      guestId: data.guestId,
      answer: data.answer,
      origin,
    });
  });
