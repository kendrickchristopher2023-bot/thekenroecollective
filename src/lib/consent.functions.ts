// Legal-evidence log for checkout consent. Every checkout (subscription or
// one-time) records the user's acceptance of Terms + Refund Policy with IP
// and user agent so we can produce evidence in a dispute.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const logPurchaseConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({
      priceId: z.string().min(1).max(120),
      eventId: z.string().min(1).max(120).optional(),
      consentText: z.string().min(1).max(2000),
      termsVersion: z.string().max(40).optional(),
      refundPolicyVersion: z.string().max(40).optional(),
      environment: z.enum(["sandbox", "live"]),
    }), data, "consent.functions.ts:11"),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const forwardedFor = getRequestHeader("cf-connecting-ip")
      ?? getRequestHeader("x-forwarded-for")
      ?? getRequestHeader("x-real-ip")
      ?? "";
    const ip = forwardedFor.split(",")[0]?.trim() || null;
    const userAgent = getRequestHeader("user-agent") ?? null;

    await context.supabase.from("purchase_consent_log").insert({
      user_id: context.userId,
      price_id: data.priceId,
      event_id: data.eventId ?? null,
      consent_text: data.consentText,
      terms_version: data.termsVersion ?? null,
      refund_policy_version: data.refundPolicyVersion ?? null,
      ip_address: ip,
      user_agent: userAgent,
      environment: data.environment,
    });
    return { ok: true };
  });
