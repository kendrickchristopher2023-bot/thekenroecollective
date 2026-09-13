/**
 * Content safety for Kenroe Sound Studio.
 *
 * This feature puts a named real person into an AI singing voice, and the brief
 * fields deliberately ask for that person's name, how it is pronounced, private
 * in-jokes, and a moment from their life. That is a real abuse surface, so both
 * the words a host submits and the lyrics the model writes are screened before
 * any money or any render is spent.
 *
 * Two passes:
 *  1. A deterministic pass, so obvious cases are refused instantly and for free.
 *  2. A model pass for the cases wording alone cannot catch, such as a
 *     defamatory claim about a named person. The model pass is advisory: if it
 *     is unavailable, the deterministic result stands and the compose proceeds,
 *     because a screening outage must not silently swallow a paid render.
 */

export type SafetyCategory =
  | "sexual_named_person"
  | "harassment"
  | "threat"
  | "slur"
  | "defamation"
  | "impersonation";

export type SafetyStage = "brief" | "lyrics";

export interface SafetyVerdict {
  allowed: boolean;
  categories: SafetyCategory[];
  /** Shown to the host. Plain language, no legal wording, no slur repeated. */
  reason: string;
}

export const SAFETY_REASONS: Record<SafetyCategory, string> = {
  sexual_named_person:
    "We can't make a piece that puts a named person into sexual content. Take that out and the rest of your brief is fine.",
  harassment:
    "This reads as aimed at humiliating or bullying someone. The studio is for celebrating people, so we can't compose this one.",
  threat:
    "There's a threat of harm in here. We can't compose that. Nothing has been charged.",
  slur: "There's a slur in here. Please rewrite it without that word and try again.",
  defamation:
    "This states something damaging about a named person as fact. We can't put that in a song. Rephrase it as your own feeling or a shared memory.",
  impersonation:
    "We can't make a piece that presents itself as a real recording artist's voice or work. Describe the style you want instead of naming the artist to imitate.",
};

const SLUR_PATTERNS: RegExp[] = [
  /\bn[i1]gg(?:er|a)s?\b/i,
  /\bf[a@]gg?(?:ot|ots)?\b/i,
  /\bk[i1]kes?\b/i,
  /\bsp[i1]cs?\b/i,
  /\bch[i1]nks?\b/i,
  /\btr[a@]nn(?:y|ies)\b/i,
  /\bret[a@]rds?\b/i,
  /\bw[e3]tb[a@]cks?\b/i,
];

const SEXUAL_PATTERNS: RegExp[] = [
  /\b(?:fuck(?:ing|s|ed)?|blow ?job|cum(?:ming|shot)?|dick|cock|pussy|tits|nudes?|horny|orgasm|porn|sex(?:y|ual)?)\b/i,
  /\b(?:strip(?:ping|per)|lap dance|onlyfans)\b/i,
];

const THREAT_PATTERNS: RegExp[] = [
  /\b(?:kill|murder|shoot|stab|beat(?: the [a-z]+)? up)\b[^.?!]{0,40}\b(?:you|him|her|them|his|their)\b/i,
  /\bi(?:'|’)?m going to (?:kill|hurt|end|destroy|find)\b/i,
  /\b(?:i hope|hoping) (?:you|he|she|they) (?:die|dies|suffer|suffers)\b/i,
];

const HARASSMENT_PATTERNS: RegExp[] = [
  /\b(?:make (?:fun|a fool) of|humiliate|embarrass(?:ing)? (?:him|her|them|the hell out of)|roast (?:him|her|them) (?:until|till)|expose (?:him|her|them))\b/i,
  /\b(?:everyone|the whole (?:room|family)) (?:should|will) laugh at\b/i,
];

const DEFAMATION_PATTERNS: RegExp[] = [
  /\b(?:is|was|has been) (?:a )?(?:paedophile|pedophile|rapist)\b/i,
  /\b(?:stole|embezzled|molested|assaulted)\b[^.?!]{0,30}\b(?:money|her|him|them|kids?|children)\b/i,
  /\b(?:went to|did) (?:jail|prison) for\b/i,
  /\b(?:has|got|caught) (?:an? )?(?:std|hiv|herpes)\b/i,
];

const IMPERSONATION_PATTERNS: RegExp[] = [
  /\b(?:sound(?:s)? (?:exactly )?like|imitat(?:e|ing)|impersonat(?:e|ing)|clone|copy) (?:the (?:voice|singer) of )?(?:beyonc|drake|taylor swift|adele|rihanna|jay-?z|kendrick lamar|whitney|michael jackson|prince|sza|usher)/i,
  /\bin (?:the )?(?:actual|real) voice of\b/i,
  /\b(?:make it|it should be) (?:an? )?(?:unreleased|lost) (?:beyonc|drake|adele|prince|michael jackson)/i,
];

const CHECKS: Array<{ category: SafetyCategory; patterns: RegExp[] }> = [
  { category: "slur", patterns: SLUR_PATTERNS },
  { category: "threat", patterns: THREAT_PATTERNS },
  { category: "sexual_named_person", patterns: SEXUAL_PATTERNS },
  { category: "defamation", patterns: DEFAMATION_PATTERNS },
  { category: "harassment", patterns: HARASSMENT_PATTERNS },
  { category: "impersonation", patterns: IMPERSONATION_PATTERNS },
];

/**
 * Ambiguous wording that is far more often grief, recovery or metaphor than
 * abuse ("we had to bury him too soon", "Dad was an addict but he beat it",
 * "the naked truth"). These NEVER refuse on their own: they only ask the model
 * pass for a second opinion.
 */
const SOFT_CHECKS: Array<{ category: SafetyCategory; patterns: RegExp[] }> = [
  {
    category: "threat",
    patterns: [
      /\b(?:hurt|burn(?: down)?|bury|buried)\b[^.?!]{0,40}\b(?:you|him|her|them|his|their)\b/i,
    ],
  },
  { category: "sexual_named_person", patterns: [/\bnaked\b/i] },
  {
    category: "defamation",
    patterns: [
      /\b(?:is|was|has been) (?:a )?(?:cheat(?:er|ing)|liar|thief|fraud|criminal|abuser|addict|drunk)\b/i,
      /\b(?:abused|beat)\b[^.?!]{0,30}\b(?:her|him|them|kids?|children)\b/i,
    ],
  },
  {
    category: "harassment",
    patterns: [/\b(?:worthless|pathetic|disgusting|piece of (?:shit|garbage)|loser)\b/i],
  },
];

/** Free, instant, offline screen. Returns every category that matched. */
export function screenTextRules(text: string): SafetyCategory[] {
  const hay = (text ?? "").normalize("NFKC");
  if (!hay.trim()) return [];
  const hits: SafetyCategory[] = [];
  for (const check of CHECKS) {
    if (check.patterns.some((p) => p.test(hay))) hits.push(check.category);
  }
  return hits;
}

/** Wording that only warrants a model second opinion, never a refusal by itself. */
export function screenTextSoftRules(text: string): SafetyCategory[] {
  const hay = (text ?? "").normalize("NFKC");
  if (!hay.trim()) return [];
  const hits: SafetyCategory[] = [];
  for (const check of SOFT_CHECKS) {
    if (check.patterns.some((p) => p.test(hay))) hits.push(check.category);
  }
  return hits;
}

export function verdictFor(categories: SafetyCategory[]): SafetyVerdict {
  if (!categories.length) return { allowed: true, categories: [], reason: "" };
  const reason = categories.map((c) => SAFETY_REASONS[c]).join(" ");
  return { allowed: false, categories, reason };
}

const MODEL_CATEGORIES: SafetyCategory[] = [
  "sexual_named_person",
  "harassment",
  "threat",
  "slur",
  "defamation",
  "impersonation",
];

/**
 * Model pass. Advisory only: any failure returns "allowed" so a screening
 * outage never eats a paid render. Uses the single project model id.
 */
export async function screenTextWithModel(text: string): Promise<SafetyCategory[]> {
  const body = (text ?? "").trim().slice(0, 4000);
  if (!body) return [];
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return [];
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          {
            role: "system",
            content:
              "You screen text that will become an AI-sung song about a real named person. Reply with a JSON array of matching category strings, or [] if nothing matches. Categories: sexual_named_person, harassment, threat, slur, defamation, impersonation. Affectionate teasing, grief, religious content, alcohol at a party, and heartfelt tributes are NOT matches. Only flag genuine sexual content about a named person, targeted humiliation, threats of harm, slurs, damaging factual claims about a named person, or a request to imitate a real recording artist. Reply with the JSON array only.",
          },
          { role: "user", content: body },
        ],
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is SafetyCategory =>
      typeof c === "string" && (MODEL_CATEGORIES as string[]).includes(c),
    );
  } catch {
    return [];
  }
}

/** Both passes, deduplicated. */
export async function screenText(text: string): Promise<SafetyVerdict> {
  const rules = screenTextRules(text);
  if (rules.length) return verdictFor(rules);
  const model = await screenTextWithModel(text);
  return verdictFor(Array.from(new Set(model)));
}
