// Group eCards, AI montage curation helper. Server-only.
import type { RevealPayload } from "@/lib/ecards.schemas";

export type MontageCuration = { intro: string; outro: string; order: string[] };

const strip = (s: string) => s.replace(/[—–]/g, ",").replace(/^["'\s]+|["'\s]+$/g, "").trim();

function fallback(reveal: RevealPayload): MontageCuration {
  return {
    intro: `A card for ${reveal.recipient_name}, from everyone who wanted to say something.`,
    outro: `With love, from all of us.`,
    order: reveal.contributions.map((c) => c.id),
  };
}

/**
 * Asks Lovable AI for a warm intro line, a short closing line, and a sensible
 * running order. It never rewrites anyone's message: only ordering plus the two
 * extra cards. Any failure degrades to the natural order and default copy.
 */
export async function buildMontageCuration(
  reveal: RevealPayload,
  apiKey: string | undefined,
): Promise<MontageCuration> {
  const base = fallback(reveal);
  if (!apiKey || reveal.contributions.length === 0) return base;

  try {
    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(apiKey);

    const list = reveal.contributions
      .map(
        (c, i) =>
          `${i + 1}. id=${c.id} from=${c.contributor_name} media=${c.media_type} text=${(c.message || "(no text)").slice(0, 240)}`,
      )
      .join("\n");

    const { text } = await generateText({
      model: gateway("google/gemini-3.6-flash"),
      system:
        "You curate a slideshow of group greeting card messages. Return JSON only, no markdown. " +
        "Keys: intro (one warm sentence, max 18 words), outro (one short closing sentence, max 12 words), " +
        "order (array of the given ids, every id exactly once). Never rewrite, quote, or summarize the " +
        "messages themselves. Use plain American English and never use em dashes.",
      prompt:
        `Occasion: ${reveal.occasion}\nRecipient: ${reveal.recipient_name}\n` +
        `Messages:\n${list}\n\n` +
        "Order them so the montage builds gently and ends on something warm. Return the JSON object.",
    });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return base;
    const parsed = JSON.parse(match[0]) as Partial<MontageCuration>;

    const valid = new Set(reveal.contributions.map((c) => c.id));
    const seen = new Set<string>();
    const order: string[] = [];
    for (const id of Array.isArray(parsed.order) ? parsed.order : []) {
      if (typeof id === "string" && valid.has(id) && !seen.has(id)) {
        seen.add(id);
        order.push(id);
      }
    }
    for (const c of reveal.contributions) if (!seen.has(c.id)) order.push(c.id);

    return {
      intro: (typeof parsed.intro === "string" && strip(parsed.intro).slice(0, 220)) || base.intro,
      outro: (typeof parsed.outro === "string" && strip(parsed.outro).slice(0, 160)) || base.outro,
      order,
    };
  } catch {
    return base;
  }
}
