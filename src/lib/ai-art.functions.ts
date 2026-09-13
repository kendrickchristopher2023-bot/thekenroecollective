import { toUserMessage, parseInput } from "@/lib/user-error";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotDemo } from "@/lib/demo-mode.server";

/**
 * Vibe-gallery AI art generation.
 *
 * Runs on the Lovable AI Gateway image endpoint (same infrastructure as every
 * other AI feature in the app) rather than a keyless third-party generator, so
 * it can't break when someone else's free tier runs dry.
 *
 * Returns raw base64 PNG. The caller uploads it through uploadAndRecord so the
 * image lands in the user's own media library and the gallery stores a durable
 * public URL instead of a giant data URL in localStorage.
 */
export const generateInviteArt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z
      .object({
        prompt: z.string().min(3).max(600),
        eventId: z.string().min(1).optional(),
      }), input, "ai-art.functions.ts:25"),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ base64: string; contentType: string } | { error: string; code?: string }> => {
      await assertNotDemo("generate");
      // Atelier one-time-pass AI cap (subscriptions pass straight through).
      const { enforceAtelierAiCap } = await import("@/lib/ai-cap");
      const cap = await enforceAtelierAiCap(context.supabase, context.userId, data.eventId ?? null);
      if ("code" in cap) return { error: cap.error, code: cap.code };
      if ("error" in cap) return { error: cap.error };

      const key = process.env["LOVABLE_API_KEY"];
      if (!key) return { error: "AI image service is not configured." };

      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-image-2",
            // Art direction, not "invitation artwork". Asking for an
            // invitation made the model paint a blank ornate card — a huge
            // decorative floral border with the real scene shrunk into one
            // corner. We want an edge-to-edge scene that fills the frame at
            // any container size, especially phone width.
            prompt: [
              `Full-bleed editorial illustration that fills the entire square frame edge to edge: ${data.prompt}.`,
              "The scene itself is the whole image, composed to fill the frame with a clear focal subject.",
              "Elegant, refined, luxurious color palette and lighting.",
              "Absolutely no decorative border, no frame, no arch, no floral wreath around the edges,",
              "no blank or empty space reserved for text, no card or stationery mockup, no matting or margins,",
              "no text, no lettering, no watermarks, no logos.",
            ].join(" "),
            size: "1024x1024",
            quality: "low",
            n: 1,
          }),

        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          if (res.status === 429)
            return { error: "AI art is rate-limited right now. Try again in a moment." };
          if (res.status === 402)
            return { error: "AI credits are exhausted. Add credits in Settings → Plans & credits." };
          if (/content_policy|moderation/i.test(text))
            return {
              error:
                "That prompt was rejected by the image model. Try describing the scene without named people, brands, or characters.",
            };
          return { error: `AI image error (${res.status}). Please try again.` };
        }

        const body = (await res.json()) as { data?: Array<{ b64_json?: string }> };
        const base64 = body.data?.[0]?.b64_json;
        if (!base64) return { error: "AI returned no image. Please try again." };
        return { base64, contentType: "image/png" };
      } catch (e) {
        return { error: toUserMessage(e, "AI image request failed.") };
      }
    },
  );
