// Batch translation via Lovable AI. Called by the auto-translate DOM walker.
// Returns an array of translated strings in the same order as input.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LANG_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  zh: "Mandarin Chinese (Simplified)",
  hi: "Hindi",
  ar: "Arabic",
};

const Input = z.object({
  target: z.string().min(2).max(8),
  strings: z.array(z.string().min(1).max(2000)).min(1).max(120),
});

export const translateBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => parseInput(Input, raw, "translate.functions.ts:23"))
  .handler(async ({ data }) => {
    if (data.target === "en") return { translations: data.strings };

    // Unauthenticated, triggers a paid LLM call per batch (up to 120 strings).
    // Results are cached client-side per page, so a real browsing session
    // only needs a handful of calls — generous enough to not clip legitimate
    // multi-page navigation, tight enough to block scripted abuse.
    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceIpRateLimit } = await import("@/lib/rate-limit.server");
    try {
      const limited = enforceIpRateLimit(getRequest(), { scope: "translate-batch", max: 20, windowMs: 60 * 1000 });
      if (limited) throw limited;
    } catch (e) {
      if (e instanceof Response) throw e;
    }

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const langName = LANG_NAMES[data.target] ?? data.target;

    const numbered = data.strings
      .map((s, i) => `${i + 1}. ${s.replace(/\n/g, " ")}`)
      .join("\n");

    const gateway = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: gateway("google/gemini-3.6-flash"),
      system:
        `You are a professional UI translator. Translate each numbered line into ${langName}. ` +
        `Return exactly the same numbered lines, one per line, with the same numbers, ` +
        `and ONLY the translated text after the number and period. ` +
        `Do NOT translate: brand names (Kenroe, Atelier, Whisper, Postcard, Host, Stripe, ` +
        `Venmo, CashApp, Zelle, Apple Pay, Google Pay), URLs, emails, or numbers. ` +
        `Preserve capitalization style, punctuation, emoji, and trailing/leading whitespace intent. ` +
        `Never add explanations.`,
      prompt: numbered,
    });

    const out: string[] = new Array(data.strings.length).fill("");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(\d+)\.\s?(.*)$/);
      if (!m) continue;
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < out.length) out[idx] = m[2];
    }
    // Fill any misses with originals so UI never blanks.
    for (let i = 0; i < out.length; i++) {
      if (!out[i]) out[i] = data.strings[i];
    }
    return { translations: out };
  });
