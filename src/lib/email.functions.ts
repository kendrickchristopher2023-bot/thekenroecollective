import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side gateway for the app emails a signed-in host may trigger from the
 * browser.
 *
 * Why this exists: the browser must never be able to name an arbitrary
 * recipient or template. Every guard lives here — the demo-mode block, the
 * template allow-list, the "you can only email your own guests" ownership
 * check, and link sanitising — because a client-side check would be bypassable
 * with devtools.
 *
 * In demo mode nothing is sent; a fake success is returned so the flow stays
 * demo-able end to end.
 */
export const sendTransactionalEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z
      .object({
        templateName: z.string().trim().min(1).max(120),
        recipientEmail: z.string().trim().email().max(320),
        idempotencyKey: z.string().trim().min(1).max(200),
        templateData: z.record(z.string(), z.unknown()).optional(),
        eventId: z.string().min(1).max(120).optional(),
      }), data, "email.functions.ts:28"),
  )
  .handler(async ({ data, context }) => {
    const { isDemoRequest, logDemoGuard } = await import("@/lib/demo-mode.server");
    if (await isDemoRequest()) {
      // Refused quietly (the demo flow still looks successful) but recorded,
      // like every other demo refusal, so the daily owner digest sees it.
      await logDemoGuard("send_email", { template: data.templateName, eventId: data.eventId ?? null }, context.userId);
      return { success: true, demo: true, message_id: null, droppedImages: [] as string[] };
    }

    const { TEMPLATES } = await import("@/lib/email-templates/registry");
    const template = TEMPLATES[data.templateName];
    if (!template) throw new Error("Template not available");

    // This path is reachable by any signed-in user, so it only ever exposes
    // templates that are safe for a caller to send to their OWN audience.
    // Everything else (security alerts, invites, RFQ mail, broadcasts, privacy
    // notices) is sent exclusively from server code with its own checks.
    const CALLER_SENDABLE = new Set(["thank-you-card", "event-announcement", "admin-notification"]);
    if (!CALLER_SENDABLE.has(data.templateName)) {
      throw new Error("Template not available");
    }
    if (data.templateName === "thank-you-card") {
      if (!data.eventId) throw new Error("An event is required for thank-you cards.");
      const { eventOwnerId, accountAddonAccess } = await import("@/lib/addon-access.server");
      const ownerId = await eventOwnerId(context.supabase, data.eventId);
      if (!ownerId || !(await accountAddonAccess(context.supabase, ownerId, "thank_you_cards"))) {
        throw new Error("The thank-you card studio is not unlocked for this account.");
      }
    }

    const recipient = (template.to || data.recipientEmail).trim().toLowerCase();
    if (!recipient) throw new Error("A recipient is required.");

    // Templates with a fixed recipient (admin-notification) need no recipient
    // authorization; the rest must target one of the caller's own event guests.
    if (!template.to) {
      const { supabase, userId } = context;
      const { ownsRecipient, isStaff } = await import("@/lib/email/caller-authz.server");
      const allowed =
        (await ownsRecipient(supabase, userId, recipient)) || (await isStaff(supabase, userId));
      if (!allowed) throw new Error("You can only email guests on your own events.");
    }

    // Never let caller input build links inside a rendered email — any URL-ish
    // field must point at our own site.
    const templateData: Record<string, unknown> = { ...(data.templateData ?? {}) };
    const { isAllowedUrl } = await import("@/lib/email/caller-authz.server");
    const { isEmailSafeImageUrl, EMAIL_IMAGE_KEYS } = await import("@/lib/email/image-url");
    for (const key of ["link_url", "ctaUrl", "cta_url", "appUrl", "url"]) {
      const val = templateData[key];
      if (typeof val === "string" && val.trim() && !isAllowedUrl(val.trim())) {
        delete templateData[key];
      }
    }
    // Images are reported back rather than dropped in silence: the composer
    // shows the host exactly what the recipient will not receive.
    const droppedImages: string[] = [];
    for (const key of EMAIL_IMAGE_KEYS) {
      const val = templateData[key];
      if (typeof val !== "string" || !val.trim()) continue;
      if (!isEmailSafeImageUrl(val.trim())) {
        delete templateData[key];
        droppedImages.push(key);
      }
    }


    const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
    const res = await enqueueTransactionalEmailServer({
      templateName: data.templateName,
      recipientEmail: recipient,
      idempotencyKey: data.idempotencyKey,
      templateData,
    });

    if (!res.ok) {
      if (res.reason === "suppressed") {
        return { success: false, demo: false, message_id: null, reason: "email_suppressed", droppedImages };
      }
      throw new Error("Email send failed");
    }

    return { success: true, demo: false, message_id: null, droppedImages };

  });
