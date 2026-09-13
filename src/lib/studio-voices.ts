/**
 * The reading voices, curated rather than invented.
 *
 * Every voice here is a real, pinned voice id from ElevenLabs' own library. It
 * was chosen the same way: render the identical three paragraph memorial
 * letter, measure how far the pitch actually moves across the read, and keep
 * only the ones that move like a person talking. A voice whose pitch barely
 * shifts sounds like a machine reading a label, however good its listing looks,
 * so several promising labels were dropped rather than shipped as filler. The
 * rejected ones are named in the comments below so nobody re-adds them.
 *
 * Two hard rules, both by construction:
 *   1. No voice cloning, ever. Nothing outside this list can be requested,
 *      because the server looks the id up here and falls back if it misses.
 *   2. No child voices. ElevenLabs' own policy bars child and child-like voices
 *      from the library, and an adult's words read in a child's voice at a
 *      funeral reads as manipulation rather than tenderness. Where somebody
 *      wants a child, what they usually want is a younger voice, so that is
 *      what "younger voice" offers: teenage to young adult.
 *
 * Previews are pre-rendered files in /public/voice-samples, not generated when
 * somebody browses. Choosing a voice for your grandmother's memorial should be
 * instant and free.
 */

export type VoiceGender = "woman" | "man";

export type AccentKey =
  | "american"
  | "black-american"
  | "american-southern"
  | "british"
  | "british-northern"
  | "irish"
  | "scottish"
  | "australian"
  | "caribbean"
  | "nigerian"
  | "south-african"
  | "indian"
  | "spanish"
  | "french";

/** Named the way people describe an accent out loud. */
export const ACCENTS: { key: AccentKey; label: string; lang: string }[] = [
  { key: "american", label: "American", lang: "en" },
  { key: "black-american", label: "Black American", lang: "en" },
  { key: "american-southern", label: "American Southern", lang: "en" },
  { key: "british", label: "British", lang: "en" },
  { key: "british-northern", label: "British Northern", lang: "en" },
  { key: "irish", label: "Irish", lang: "en" },
  { key: "scottish", label: "Scottish", lang: "en" },
  { key: "australian", label: "Australian", lang: "en" },
  { key: "caribbean", label: "Caribbean", lang: "en" },
  { key: "nigerian", label: "Nigerian", lang: "en" },
  { key: "south-african", label: "South African", lang: "en" },
  { key: "indian", label: "Indian", lang: "en" },
  { key: "spanish", label: "Spanish, read by a native speaker", lang: "es" },
  { key: "french", label: "French, read by a native speaker", lang: "fr" },
];

export type StudioVoice = {
  /** Pinned ElevenLabs voice id. */
  id: string;
  /** Sample file stem, /voice-samples/<sample>.mp3 */
  sample: string;
  label: string;
  gender: VoiceGender;
  /** Teenage to young adult. Offered instead of a child voice. */
  younger?: boolean;
  accent: AccentKey;
  lang: string;
};

export const STUDIO_VOICES: StudioVoice[] = [
  // American
  { id: "MFZUKuGQUsGJPQjTS4wC", sample: "am-jon", label: "Jon, warm and grounded", gender: "man", accent: "american", lang: "en" },
  { id: "lxYfHSkYm1EzQzGhdbfc", sample: "am-jessica", label: "Jessica, steady and kind", gender: "woman", accent: "american", lang: "en" },
  { id: "EXAVITQu4vr4xnSDxMaL", sample: "am-sarah", label: "Sarah, clear and gentle", gender: "woman", accent: "american", lang: "en" },
  { id: "NOpBlnGInO9m6vDvFkFC", sample: "am-walter", label: "Walter, elderly and gentle", gender: "man", accent: "american", lang: "en" },
  { id: "N2lVS1w4EtoT3dr4eOWO", sample: "am-callum", label: "Callum, quiet and close", gender: "man", accent: "american", lang: "en" },
  { id: "uIZsnBL0YK1S5j69bAih", sample: "am-samantha", label: "Samantha, soft and close", gender: "woman", younger: true, accent: "american", lang: "en" },
  { id: "8z82LG47qQ2qjeeQB8lk", sample: "am-kenneth", label: "Kenneth, calm and young", gender: "man", younger: true, accent: "american", lang: "en" },

  // Black American. Chosen with the same care as the rest, and deliberately
  // deep enough to cover a memorial, a toast and a graduation.
  //
  // A Southern Gentleman is Christopher's own voice, designed in ElevenLabs
  // Voice Design (category "generated", verified 12 Sep 2026) and licensed for
  // commercial voice and music use. It is not a clone of anybody. It replaced
  // Edwin (CMUEYyUNA4TrldQy4HLM) everywhere on 12 Sep 2026.
  { id: "d4m4BR3VP3E3Iyz1NJSV", sample: "ba-atlanta", label: "A Southern Gentleman", gender: "man", accent: "black-american", lang: "en" },
  { id: "riqnCDqBJCxuKuDEeenv", sample: "ba-ceewell", label: "Cee, deep and unhurried", gender: "man", accent: "black-american", lang: "en" },
  { id: "NQMJRVvPew6HsaebYnZj", sample: "ba-cecily", label: "Cecily, poised and clear", gender: "woman", accent: "black-american", lang: "en" },
  { id: "Z5JpFCNFIz8Nhe4KEikq", sample: "ba-kelli", label: "Kelli, warm and Southern", gender: "woman", accent: "black-american", lang: "en" },
  { id: "vzb1D7zjti0h5u8StSra", sample: "ba-ashley", label: "Ashley, warm and encouraging", gender: "woman", younger: true, accent: "black-american", lang: "en" },
  { id: "bQxW1c7YCr6VQgQhw8KX", sample: "ba-lasean", label: "LaSean, easy and young", gender: "man", younger: true, accent: "black-american", lang: "en" },

  // American Southern
  { id: "0rEo3eAjssGDUCXHYENf", sample: "so-rachel", label: "Rachel, wise and Southern", gender: "woman", accent: "american-southern", lang: "en" },
  { id: "DLsHlh26Ugcm6ELvS0qi", sample: "so-walker", label: "Ms. Walker, warm and reassuring", gender: "woman", accent: "american-southern", lang: "en" },
  { id: "Cb8NLd0sUB8jI4MW2f9M", sample: "so-jedediah", label: "Jedediah, rich and inviting", gender: "man", accent: "american-southern", lang: "en" },

  // British
  { id: "JBFqnCBsd6RMkjVDRZzb", sample: "br-george", label: "George, warm and steady", gender: "man", accent: "british", lang: "en" },
  { id: "G17SuINrv2H9FC6nvetn", sample: "br-christopher", label: "Christopher, gentle and calm", gender: "man", accent: "british", lang: "en" },
  { id: "RILOU7YmBhvwJGDGjNmP", sample: "br-jane", label: "Jane, older and well spoken", gender: "woman", accent: "british", lang: "en" },
  { id: "ZF6FPAbjXT4488VcRRnw", sample: "br-amelia", label: "Amelia, bright and young", gender: "woman", younger: true, accent: "british", lang: "en" },

  // British Northern
  { id: "S1GxattMxHrXozy2QM7J", sample: "bn-mike", label: "Mike, Northern and plain spoken", gender: "man", accent: "british-northern", lang: "en" },

  // Irish, Scottish, Australian
  { id: "Rni4NyZRvnv6RI6vRMqC", sample: "ie-neil", label: "Neil, calm and melodic", gender: "man", accent: "irish", lang: "en" },
  { id: "DbwWo4rVEd5NrejHYUnm", sample: "ie-jessica", label: "Jessica, clear and warm", gender: "woman", accent: "irish", lang: "en" },
  { id: "U5UjeJMsOvyhYhXfZdvZ", sample: "sc-adam", label: "Adam, old Scots storyteller", gender: "man", accent: "scottish", lang: "en" },
  { id: "Lny4bN2CTZWgKZAgIHKa", sample: "sc-sarah", label: "Sarah, friendly and expressive", gender: "woman", accent: "scottish", lang: "en" },
  { id: "REj8RmvYhs4GYVeZD6wC", sample: "au-alex", label: "Alex, modern Australian", gender: "man", accent: "australian", lang: "en" },
  { id: "NihRgaLj2HWAjvZ5XNxl", sample: "au-matilda", label: "Matilda, easy and pleasant", gender: "woman", accent: "australian", lang: "en" },

  // Caribbean, West and Southern Africa, India
  { id: "dhwafD61uVd8h85wAZSE", sample: "cb-denzel", label: "Denzel, deep Jamaican", gender: "man", accent: "caribbean", lang: "en" },
  { id: "mrDMz4sYNCz18XYFpmyV", sample: "cb-nicole", label: "Nicole, rich and expressive", gender: "woman", accent: "caribbean", lang: "en" },
  { id: "U7wWSnxIJwCjioxt86mk", sample: "ng-victor", label: "Victor, warm and rich", gender: "man", accent: "nigerian", lang: "en" },
  { id: "2vbhUP8zyKg4dEZaTWGn", sample: "ng-stella", label: "Stella, warm and natural", gender: "woman", accent: "nigerian", lang: "en" },
  { id: "tJvgmaVM5tDwPVrtn8TA", sample: "za-sekou", label: "Sekou, deep and soothing", gender: "man", accent: "south-african", lang: "en" },
  { id: "gsm4lUH9bnZ3pjR1Pw7w", sample: "za-claire", label: "Claire, even and polished", gender: "woman", accent: "south-african", lang: "en" },
  { id: "hEVeuEwuN5rfDgwQ85v8", sample: "in-arjun", label: "Arjun, warm and clear", gender: "man", accent: "indian", lang: "en" },
  { id: "az9wg0kCmz7TXHgFa5t9", sample: "in-shakeena", label: "Shakeena, warm and friendly", gender: "woman", younger: true, accent: "indian", lang: "en" },

  // Native speakers, not English voices attempting another language.
  { id: "KHCvMklQZZo0O30ERnVn", sample: "es-sara", label: "Sara, serena y cercana", gender: "woman", accent: "spanish", lang: "es" },
  { id: "l1zE9xgNpUTaQCZzpNJa", sample: "es-alberto", label: "Alberto, grave y narrativo", gender: "man", accent: "spanish", lang: "es" },
  { id: "hFgOzpmS0CMtL2to8sAl", sample: "fr-camille", label: "Camille, calme et posée", gender: "woman", accent: "french", lang: "fr" },
  { id: "TTtB1x9U8PF0Vgf20IAP", sample: "fr-adrien", label: "Adrien, grave et réconfortant", gender: "man", accent: "french", lang: "fr" },
];

/**
 * Dropped after listening tests, kept here so they are not quietly re-added:
 * Paulette and Kevin (Jamaican, both almost monotone), Isla (Scottish),
 * Julius, Nylo, Tyrese and Zoe (Black American, flatter than the six kept),
 * Ana Rita (British), Ananya (Indian), Kubz (Northern), Sinclair (Black
 * American). Ghanaian is not offered at all: the library has no Ghanaian voice
 * good enough to put under a eulogy, and a thin voice behind a promising label
 * is worse than no label.
 */

export function voiceById(id: string): StudioVoice | undefined {
  return STUDIO_VOICES.find((v) => v.id === id);
}

/** The fixed list, as the server sees it. Anything else is not a voice. */
export function studioVoiceId(value: string): string {
  return (
    STUDIO_VOICES.find((v) => v.id === value || v.sample === value || v.label === value)?.id ??
    recommendedVoice("memorial", "en")
  );
}

export function voicesFor(opts: {
  lang?: string;
  accent?: AccentKey | "";
  gender?: VoiceGender | "younger" | "";
}): StudioVoice[] {
  const lang = opts.lang && opts.lang !== "en" ? opts.lang : "en";
  return STUDIO_VOICES.filter((v) => {
    if (v.lang !== lang) return false;
    if (opts.accent && v.accent !== opts.accent) return false;
    if (opts.gender === "younger") return !!v.younger;
    if (opts.gender && v.gender !== opts.gender) return false;
    return true;
  });
}

/**
 * A good answer instead of a menu of forty. These are the voices that read the
 * test letter best for each moment.
 */
const RECOMMENDED: Record<string, string> = {
  memorial: "d4m4BR3VP3E3Iyz1NJSV", // A Southern Gentleman
  toast: "lxYfHSkYm1EzQzGhdbfc", // Jessica, steady and kind
  graduate: "NQMJRVvPew6HsaebYnZj", // Cecily, poised and clear
  milestone: "MFZUKuGQUsGJPQjTS4wC", // Jon, warm and grounded
  other: "JBFqnCBsd6RMkjVDRZzb", // George, warm and steady
};

export function recommendedVoice(occasion: string, lang = "en"): string {
  if (lang === "es") return "KHCvMklQZZo0O30ERnVn";
  if (lang === "fr") return "hFgOzpmS0CMtL2to8sAl";
  return RECOMMENDED[occasion] ?? RECOMMENDED["other"]!;
}

export function samplePath(v: StudioVoice): string {
  return `/voice-samples/${v.sample}.mp3`;
}

/**
 * How it is delivered, which changes more than the voice does.
 *
 * The numbers are the ElevenLabs voice settings, tuned on the same memorial
 * letter rather than left at the defaults. Lower stability lets the read move
 * with the sentence, which is what stops it sounding automated; too low and it
 * wanders. Style is kept modest because at high values the model starts
 * performing, which is fatal at a funeral. Similarity stays high so the voice
 * you previewed is the voice you get.
 */
export const DELIVERIES = [
  {
    key: "solemn",
    label: "Solemn",
    help: "A memorial, a blessing.",
    settings: { stability: 0.62, similarity_boost: 0.85, style: 0.15, use_speaker_boost: true },
  },
  {
    key: "warm",
    label: "Warm",
    help: "The way you would say it to one person.",
    settings: { stability: 0.5, similarity_boost: 0.82, style: 0.28, use_speaker_boost: true },
  },
  {
    key: "celebratory",
    label: "Celebratory",
    help: "A toast, a graduation.",
    settings: { stability: 0.4, similarity_boost: 0.8, style: 0.42, use_speaker_boost: true },
  },
  {
    key: "conversational",
    label: "Conversational",
    help: "Plain, unhurried, no performance.",
    settings: { stability: 0.55, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
  },
  {
    key: "joyful",
    label: "Joyful",
    help: "A birthday, good news.",
    settings: { stability: 0.38, similarity_boost: 0.78, style: 0.5, use_speaker_boost: true },
  },
] as const;

export type DeliveryKey = (typeof DELIVERIES)[number]["key"];

export const DELIVERY_FOR_OCCASION: Record<string, DeliveryKey> = {
  memorial: "solemn",
  toast: "celebratory",
  graduate: "celebratory",
  milestone: "warm",
  other: "warm",
};

/** Speed still comes from the pace the writer chose, delivery does the rest. */
export function deliverySettings(delivery: string, speed: number) {
  const d = DELIVERIES.find((x) => x.key === delivery) ?? DELIVERIES[1];
  return { ...d.settings, speed };
}
