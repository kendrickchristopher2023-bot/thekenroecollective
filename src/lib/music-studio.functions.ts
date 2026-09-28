/**
 * Kenroe Sound Studio (Venture 05) — a standalone music and spoken-word studio.
 *
 * Publicly this is "coming soon": the launch switch lives on site_settings
 * (music_studio_public) and ships off, so only the two software owners can
 * compose while the paid product is being finished. Owners compose unlimited
 * and free; everyone else gets free auditions up to 30 seconds and pays per
 * finished piece by length.
 *
 * Auditions come straight back to the browser as base64 and live only on the
 * local sample shelf. Finished pieces are saved to the private sound-pieces
 * bucket with a row in sound_pieces, so they survive a new device, can be
 * shared by link, and can be attached to a Group eCard, an event invitation,
 * or the Photo Wall.
 */
import { toUserMessage } from "@/lib/user-error";
import { expectedError } from "@/lib/expected-outcome";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseInput } from "@/lib/user-error";
import { nullSafe } from "@/lib/zod-nullsafe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotDemo } from "@/lib/demo-mode.server";
import { DEFAULT_SONG_SETTINGS, normaliseVoice, poemWordBudget } from "@/lib/wall-soundtrack";
import {
  DEFAULT_BRIEF_EXTRAS,
  briefCoaching,
  compileStudioPrompt,
  type StudioBrief,
} from "@/lib/studio-brief";
import {
  applyConstraints,
  constraintDirective,
  hardConstraints,
  isInstrumental,
  settingsUsed,
  verifyPlan,
} from "@/lib/studio-constraints";
import {

  WORDS_MAX,
  compileSectionedPrompt,
  conflictNotes,
  planLyrics,
  requiredPhrases,
  splitBriefText,
  themeLeaks,
  verifyLyrics,
  type BriefSplit,
  type PlanChunk,
} from "@/lib/studio-words";
import {
  COMBINE_PART_KEYS,
  type CombinePart,
  type Ingredient,
  combineBrief,
  combineTitle,
  
  lyricsIntact,
  partLabel,
  planFromLyrics,
  validateCombine,
} from "@/lib/studio-combine";
import { briefFrom } from "@/lib/studio-brief";
import {
  FREE_AUDITIONS_PER_DAY,
  PERSONAL_LICENCE,
  isAudition,
  tierForPriceKey,
  tierForSeconds,
} from "@/lib/music-studio-pricing";

/** Longest single piece the studio will compose, in seconds. */
export const STUDIO_MAX_SECONDS = 240;

/** Length buttons offered in the studio, in seconds. */
export const STUDIO_LENGTHS = [10, 20, 30, 60, 120, 180, 240] as const;

export { STUDIO_LOCKED_MESSAGE } from "@/lib/studio-gate";
import { STUDIO_LOCKED_MESSAGE, studioAllowed } from "@/lib/studio-gate";

const BUCKET = "sound-pieces";
const SIGNED_URL_SECONDS = 60 * 60 * 6;

type RoleClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }>;
};

/**
 * Owners are Chris and Adrian: the `owner` role only. They compose free and
 * skip payment; super_admin alone does not count.
 */
async function isOwnerRole(supabase: RoleClient, userId: string): Promise<boolean> {
  const { data: isOwner } = await supabase.rpc("has_role", { _user_id: userId, _role: "owner" });
  return !!isOwner;
}

/** Is the studio open to paying customers yet? */
async function isStudioPublic(): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("music_studio_public")
    .eq("id", true)
    .maybeSingle();
  return !!(data as { music_studio_public?: boolean } | null)?.music_studio_public;
}

/** Owners always get in. Everyone else only once the studio is open. */
async function assertStudioAccess(
  supabase: RoleClient,
  userId: string,
): Promise<{ owner: boolean }> {
  const owner = await isOwnerRole(supabase, userId);
  if (owner) return { owner: true };
  if (!studioAllowed({ isOwner: false, publicOpen: await isStudioPublic() })) {
    throw new Error(STUDIO_LOCKED_MESSAGE);
  }
  return { owner: false };
}

/**
 * Screen a brief or a set of lyrics before anything is spent, and refuse with a
 * plain reason if it fails. Only the matched category is recorded, never the
 * text itself, so the log cannot become a second copy of the thing we refused.
 */
async function screenOrRefuse(text: string, stage: "brief" | "lyrics", userId: string) {
  const { screenText } = await import("@/lib/music-safety");
  const verdict = await screenText(text);
  if (verdict.allowed) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("sound_safety_refusals").insert({
      user_id: userId,
      stage,
      categories: verdict.categories,
    });
  } catch {
    // A logging failure must never turn a refusal into an allow.
  }
  throw new Error(verdict.reason);
}

/**
 * Everything a host typed, as one block for screening: the free text plus every
 * structured field, since a name, an in-joke or a claim can be in any of them.
 */
function briefSafetyText(input: Record<string, unknown>, brief: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const source of [input, brief]) {
    for (const value of Object.values(source)) {
      if (typeof value === "string") parts.push(value);
      else if (Array.isArray(value)) {
        for (const v of value) if (typeof v === "string") parts.push(v);
      }
    }
  }
  return Array.from(new Set(parts.filter((p) => p.trim()))).join("\n");
}

/** Provider failures are retried; after this many the money is returned. */
/** Chunked base64 so a long piece never blows the argument stack. */
function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Studio briefs round-trip as plain JSON values, so they stay serializable. */
type BriefJson = Record<string, string | number | boolean | string[] | null>;

function settingsJson(value: unknown): BriefJson | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: BriefJson = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string");
    else if (v === null) out[k] = null;
  }
  return out;
}

/**
 * A playable link for one piece. The studio keeps its audio in a private
 * bucket, so those get a signed link. Pieces made on a photo wall keep living
 * in the public wall bucket, which the slideshow already streams from: we point
 * at the same object rather than copying the file, so nothing is duplicated and
 * wall playback is untouched.
 */
async function audioUrl(path: string, bucket: string = BUCKET): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (bucket !== BUCKET) {
    return supabaseAdmin.storage.from(bucket).getPublicUrl(path).data.publicUrl ?? null;
  }
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}

/** Which bucket a piece's audio lives in, for the public read paths. */
async function bucketOf(id: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("sound_pieces")
    .select("storage_bucket")
    .eq("id", id)
    .maybeSingle();
  return (data as { storage_bucket?: string } | null)?.storage_bucket ?? BUCKET;
}

/** Does this signed-in person get into the studio, and on what terms? */
export const studioAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const owner = await isOwnerRole(context.supabase as never, context.userId);
    const publicOpen = await isStudioPublic();
    let auditionsLeft: number | null = null;
    if (!owner) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabaseAdmin
        .from("sound_audition_day")
        .select("used")
        .eq("user_id", context.userId)
        .eq("day", today)
        .maybeSingle();
      const used = (data as { used?: number } | null)?.used ?? 0;
      auditionsLeft = Math.max(FREE_AUDITIONS_PER_DAY - used, 0);
    }
    return {
      allowed: owner || publicOpen,
      owner,
      publicOpen,
      auditionsLeft,
    };
  });

/** One section of the composer's plan: its words, its length, its styles. */
const chunkShape = z.object({
  text: z.string().max(6000),
  durationMs: z.number().int().min(3000).max(120000),
  positiveStyles: z.array(z.string().max(120)).max(50).default([]),
  negativeStyles: z.array(z.string().max(120)).max(50).default([]),
});

const planShape = z.array(chunkShape).min(1).max(30);

/** Which pieces a combine draws on, and what is taken from each. */
const combineFromShape = z
  .array(
    z.object({
      pieceId: z.string().uuid(),
      parts: z
        .array(z.enum(COMBINE_PART_KEYS as [CombinePart, ...CombinePart[]]))
        .max(COMBINE_PART_KEYS.length)
        .default([]),
    }),
  )
  .max(4)
  .default([]);


export const settingsShape = z.object({
  kind: z.enum(["song", "poem"]).default("song"),
  words: z.string().trim().max(WORDS_MAX).default(""),
  genre: z.string().trim().min(1).max(40),
  mood: z.string().trim().min(1).max(40),
  // Old rows can still carry the ambiguous "duet"; read it as the explicit choice.
  voice: z.string().trim().min(1).max(40).transform(normaliseVoice),
  poemStyle: z.string().trim().max(60).default("spoken word tribute"),
  poemText: z.string().trim().max(1500).default(""),
  tempo: z.number().int().min(1).max(5).default(3),
  bass: z.number().int().min(1).max(5).default(3),
  brightness: z.number().int().min(1).max(5).default(3),
  // The richer brief. All optional so an older client still composes.
  genreBlend: z.string().trim().max(40).default(""),
  blendAmount: z.number().int().min(1).max(5).default(2),
  era: z.string().trim().max(40).default("timeless"),
  instruments: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  vocalTexture: z.string().trim().max(60).default("clear and close to the microphone"),
  structure: z.string().trim().max(160).default(""),
  language: z.string().trim().max(60).default("English"),
  emotion: z.number().int().min(1).max(5).default(4),
  honoree: z.string().trim().max(120).default(""),
  mustInclude: z.string().trim().max(1200).default(""),
  avoid: z.string().trim().max(200).default(""),
  keyMoment: z.string().trim().max(300).default(""),
  refrain: z.string().trim().max(160).default(""),
  /** Let the AI producer expand the brief before composing. */
  director: z.boolean().default(true),
  /** Optional occasion or project name, woven into the direction. */
  occasion: z.string().trim().max(80).default(""),
  seconds: z.number().int().min(10).max(STUDIO_MAX_SECONDS).default(30),
  /** A paid, unused purchase to spend on this piece (non-owners, over 30s). */
  purchaseId: z.string().uuid().optional(),
  /** Title to save the finished piece under. */
  title: z.string().trim().max(120).default(""),
  /** The piece this one is a fresh take of. */
  remixOf: z.string().uuid().optional().nullable(),
  /** The event this piece was made for. Event ids are short text codes. */
  eventId: z.string().trim().min(1).max(64).optional().nullable(),
  /**
   * The words the host approved, as the composer's own plan. When this is
   * present the audio is generated from these exact words instead of from a
   * prose prompt, which is the whole point of approving them first.
   */
  plan: planShape.optional().nullable(),
  /** Which composer model the approved plan came from. */
  planModel: z.enum(["music_v1", "music_v2"]).default("music_v2"),
  /**
   * The host was shown that the plan contradicts one of their controls and
   * chose to compose anyway. Without this, a known-wrong paid render is
   * refused before any money is spent.
   */
  acceptDeviations: z.boolean().default(false),
  /**
   * Combining: the pieces this one is being made from, and what is taken from
   * each. Sent so the merge can be recompiled and re-checked on the server
   * rather than trusted from the browser, and so the lineage is recorded.
   */
  combineFrom: combineFromShape,
  /**
   * The lock. Words the host has locked are cut into sections in code and
   * composed character for character: no producer pass, no plan rewrite, and
   * no model of any kind is allowed to touch them.
   */
  lockedLyrics: z.string().max(6000).default(""),
});

type StudioInput = z.infer<typeof settingsShape>;

/**
 * Load the pieces a combine is being built from.
 *
 * Three things are enforced here, on the server, and not in the browser:
 *   1. Every source must be a piece THIS account owns and that is still live.
 *   2. Every source must be AI-composed. An uploaded recording can never be an
 *      ingredient. Playing a licensed track at a private party and feeding a
 *      commercial recording into a generation pipeline are different legal
 *      acts, and the second one is not one this product goes near.
 *   3. The selection itself has to be coherent: at least two pieces, and each
 *      part taken from exactly one of them.
 */
async function loadIngredients(
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        in: (
          c: string,
          v: string[],
        ) => { eq: (c: string, v: string) => { is: (c: string, v: null) => PromiseLike<{ data: unknown }> } };
      };
    };
  },
  userId: string,
  combineFrom: { pieceId: string; parts: CombinePart[] }[],
): Promise<Ingredient[]> {
  if (!combineFrom.length) return [];
  const ids = combineFrom.map((c) => c.pieceId);
  const { data } = await supabase
    .from("sound_pieces")
    .select("id, title, kind, settings, origin, wall_music_id")
    .in("id", ids)
    .eq("user_id", userId)
    .is("removed_at", null);
  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    kind: string;
    settings: unknown;
    origin: string | null;
    wall_music_id: string | null;
  }>;
  if (rows.length !== ids.length) {
    throw new Error("One of those pieces can't be found in your library.");
  }

  // Guardrail 2. A library entry that mirrors a photo wall track is only an
  // ingredient when that wall track was composed here, never when it was
  // uploaded or linked from a streaming service.
  const wallIds = rows.map((r) => r.wall_music_id).filter((x): x is string => !!x);
  if (wallIds.length) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: wall } = await supabaseAdmin
      .from("event_wall_music")
      .select("id, source")
      .in("id", wallIds);
    const bad = ((wall ?? []) as Array<{ id: string; source: string }>).filter(
      (w) => w.source !== "ai",
    );
    if (bad.length || (wall ?? []).length !== wallIds.length) {
      throw new Error(
        "Only pieces composed here can be combined. Uploaded or linked music can't be used as an ingredient.",
      );
    }
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const ingredients: Ingredient[] = combineFrom.map((c) => {
    const row = byId.get(c.pieceId)!;
    const saved = settingsJson(row.settings) as Partial<import("@/lib/studio-brief").StudioBrief> | null;
    const lyrics =
      typeof (row.settings as { lyrics?: unknown } | null)?.lyrics === "string"
        ? String((row.settings as { lyrics?: string }).lyrics)
        : "";
    return {
      pieceId: row.id,
      title: row.title,
      kind: row.kind,
      brief: briefFrom(DEFAULT_SONG_SETTINGS, saved),
      lyrics,
      parts: c.parts,
    };
  });

  const problems = validateCombine(ingredients);
  if (problems.length) throw new Error(problems.map((p) => p.message).join(" "));
  return ingredients;
}

function briefFromInput(data: StudioInput): StudioBrief {
  return {
    ...DEFAULT_BRIEF_EXTRAS,
    kind: data.kind,
    words: data.words,
    genre: data.genre,
    mood: data.mood,
    voice: data.voice,
    poemStyle: data.poemStyle,
    poemText: data.poemText,
    tempo: data.tempo,
    bass: data.bass,
    brightness: data.brightness,
    genreBlend: data.genreBlend,
    blendAmount: data.blendAmount,
    era: data.era,
    instruments: data.instruments,
    vocalTexture: data.vocalTexture,
    structure: data.structure || DEFAULT_BRIEF_EXTRAS.structure,
    language: data.language,
    emotion: data.emotion,
    honoree: data.honoree,
    mustInclude: data.mustInclude,
    avoid: data.avoid,
    keyMoment: data.keyMoment,
    refrain: data.refrain,
  } as StudioBrief;
}

/**
 * The AI producer pass. It never invents facts: it rewrites the compiled brief
 * into tighter production language the composer follows more faithfully. If
 * anything goes wrong we compose from the deterministic brief instead, so a
 * paid piece is never lost to a chatty model.
 */
async function directBrief(brief: string, seconds: number): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return brief;
  try {
    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: gateway("google/gemini-3.6-flash"),
      system:
        "You are a record producer writing the brief a composer will follow. Use American English spelling. Rewrite the brief you are given as tight production direction: arrangement across the timeline, where the emotional peak lands, how the vocal is delivered, and how it ends. Keep every name, quoted line and instruction exactly as written and never add facts, people or events. No headings, no bullet symbols other than '-', under 220 words. Reply with the brief only.",
      prompt: `Target length: ${seconds} seconds.\n\n${brief}`,
      maxOutputTokens: 700,
    });
    const out = text.trim();
    return out.length > 80 ? out : brief;
  } catch {
    return brief;
  }
}

/**
 * The words, before any audio is paid for.
 *
 * The AI producer pass reads the host's paragraph and sorts it: lyrical content
 * to the subject, sound talk to the production section, and "please get this
 * right on the first try" straight into the bin. It is allowed to reorganise
 * and never to invent, and if it fails we fall back to the deterministic split
 * so the pipeline still works.
 */
async function aiSplit(words: string, deterministic: BriefSplit): Promise<BriefSplit> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key || words.trim().length < 20) return deterministic;
  try {
    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: gateway("google/gemini-3.6-flash"),
      system:
        "You sort a songwriting brief into buckets. Use American English spelling for any words you write. Return ONLY minified JSON with keys: subject (string, what the piece is about, in the host's own words, with no instructions to the studio), mustInclude (array of short words or lines that have to appear in the lyrics), positives (array of positive rewrites of anything the host asked to leave out), negatives (array of the same constraints as short phrases), production (array of sentences about how it should sound), discarded (array of sentences that are instructions to the studio rather than content, for example pleasantries, 'get this right', 'make it a banger', 'people will download it'). Never invent facts, names or events. Copy wording rather than paraphrasing.",
      prompt: words.slice(0, WORDS_MAX),
      maxOutputTokens: 900,
    });
    const raw = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = parseInput(z
      .object({
        subject: z.string().max(WORDS_MAX).default(""),
        mustInclude: z.array(z.string().max(160)).max(16).default([]),
        positives: z.array(z.string().max(240)).max(10).default([]),
        negatives: z.array(z.string().max(160)).max(10).default([]),
        production: z.array(z.string().max(240)).max(10).default([]),
        discarded: z.array(z.string().max(240)).max(12).default([]),
      }), JSON.parse(raw), "music-studio.functions.ts:579");
    const merge = (a: string[], b: string[]) =>
      Array.from(new Set([...a, ...b].map((x) => x.trim()).filter(Boolean)));
    return {
      subject: parsed.subject.trim() || deterministic.subject,
      mustInclude: merge(deterministic.mustInclude, parsed.mustInclude).slice(0, 16),
      positives: merge(deterministic.positives, parsed.positives).slice(0, 10),
      negatives: merge(deterministic.negatives, parsed.negatives).slice(0, 10),
      production: merge(deterministic.production, parsed.production).slice(0, 10),
      discarded: merge(deterministic.discarded, parsed.discarded).slice(0, 12),
      soundDesign: deterministic.soundDesign,
    };
  } catch {
    return deterministic;
  }
}

/**
 * The direction handed to the composer, built from the split.
 *
 * The host's controls are re-asserted at the very END, after the AI producer's
 * prose and after every other section, because the producer pass is free to
 * paraphrase and a paraphrase of "female lead" has come back as a man singing.
 * The last thing the composer reads is what the host actually chose.
 */
async function buildDirection(
  brief: StudioBrief,
  occasion: string,
  seconds: number,
  director: boolean,
  split: BriefSplit,
): Promise<string> {
  const { compileProduction } = await import("@/lib/studio-brief");
  const base = compileProduction(brief, seconds);
  const production = director ? await directBrief(base, seconds) : base;
  const body = compileSectionedPrompt({
    brief,
    split,
    occasion: occasion || undefined,
    use: "studio",
    production,
    seconds,
  });
  return `${body}\n${constraintDirective(hardConstraints(brief))}`;
}


const ELEVEN_BASE = "https://api.elevenlabs.io/v1/music";

function elevenKey(): string {
  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey) throw new Error("Composing isn't configured yet.");
  return apiKey;
}

function elevenError(status: number, detail: string): Error {
  if (status === 429) return new Error("The music service is busy. Try again in a moment.");
  return new Error(detail.slice(0, 200) || `Couldn't do that right now (${status}).`);
}

/** Normalise either plan shape the composer can return into our chunks. */
function chunksFromPlan(json: unknown): PlanChunk[] {
  const obj = (json ?? {}) as Record<string, unknown>;
  if (Array.isArray(obj.chunks)) {
    return (obj.chunks as Array<Record<string, unknown>>)
      .filter((c) => typeof c.text === "string")
      .map((c) => ({
        text: String(c.text).slice(0, 6000),
        durationMs: Math.min(120000, Math.max(3000, Number(c.duration_ms) || 15000)),
        positiveStyles: Array.isArray(c.positive_styles) ? (c.positive_styles as string[]).slice(0, 50) : [],
        negativeStyles: Array.isArray(c.negative_styles) ? (c.negative_styles as string[]).slice(0, 50) : [],
      }));
  }
  if (Array.isArray(obj.sections)) {
    return (obj.sections as Array<Record<string, unknown>>).map((sec) => {
      const lines = Array.isArray(sec.lines) ? (sec.lines as string[]) : [];
      return {
        text: [`[${String(sec.section_name ?? "Section")}]`, ...lines].join("\n").slice(0, 6000),
        durationMs: Math.min(120000, Math.max(3000, Number(sec.duration_ms) || 15000)),
        positiveStyles: Array.isArray(sec.positive_local_styles)
          ? (sec.positive_local_styles as string[]).slice(0, 50)
          : [],
        negativeStyles: Array.isArray(sec.negative_local_styles)
          ? (sec.negative_local_styles as string[]).slice(0, 50)
          : [],
      };
    });
  }
  return [];
}

/**
 * Ask the composer to write the words and the arrangement as TEXT. This is the
 * cheap step: it comes back in seconds and costs nothing like a full render, so
 * the host reads and edits the actual lyrics before spending on audio.
 */
async function fetchPlan(
  prompt: string,
  seconds: number,
): Promise<{ chunks: PlanChunk[]; model: "music_v1" | "music_v2" }> {
  const apiKey = elevenKey();
  const attempt = async (model?: "music_v2") => {
    const res = await fetch(`${ELEVEN_BASE}/plan`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        music_length_ms: seconds * 1000,
        ...(model ? { model_id: model } : {}),
      }),
    });
    if (!res.ok) throw elevenError(res.status, await res.text().catch(() => ""));
    return res.json() as Promise<unknown>;
  };
  try {
    const json = await attempt("music_v2");
    const chunks = chunksFromPlan(json);
    if (chunks.length) return { chunks, model: "music_v2" };
  } catch {
    // fall through to whatever the account's default model is
  }
  const json = await attempt();
  const chunks = chunksFromPlan(json);
  if (!chunks.length) throw new Error("The composer didn't return any words to review.");
  return { chunks, model: (json as { chunks?: unknown }).chunks ? "music_v2" : "music_v1" };
}

/**
 * Audio from a prose prompt: the path used when no words were approved, and the
 * only path that can guarantee an instrumental. `force_instrumental` is a real
 * API switch, but it is only accepted alongside a prompt and no lyrics, so a
 * host who asked for no vocals is composed here rather than from a plan.
 */
async function composeAudio(
  brief: StudioBrief,
  occasion: string,
  seconds: number,
  director: boolean,
  split?: BriefSplit,
) {
  const apiKey = elevenKey();
  const prompt = await buildDirection(brief, occasion, seconds, director, split ?? splitBriefText(brief.words));
  const res = await fetch(ELEVEN_BASE, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      music_length_ms: seconds * 1000,
      ...(isInstrumental(brief) ? { force_instrumental: true } : {}),
    }),
  });
  if (!res.ok) throw elevenError(res.status, await res.text().catch(() => ""));
  const audio = new Uint8Array(await res.arrayBuffer());
  if (audio.byteLength < 1024) throw new Error("The composer returned an empty take.");
  return { prompt, audio };
}


/**
 * Audio from a music_v2 plan that mixes kept slices of a stored recording with
 * newly generated sections. This is the extension path: the original audio is
 * inserted unchanged, so what the host already knows sounds identical.
 */
async function composeWithChunks(chunks: unknown[]): Promise<Uint8Array> {
  const apiKey = elevenKey();
  const res = await fetch(ELEVEN_BASE, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ composition_plan: { chunks }, model_id: "music_v2" }),
  });
  if (!res.ok) throw elevenError(res.status, await res.text().catch(() => ""));
  const audio = new Uint8Array(await res.arrayBuffer());
  if (audio.byteLength < 1024) throw new Error("The composer returned an empty take.");
  return audio;
}

/** Audio from the exact words the host approved. */
async function composeFromPlan(
  chunks: PlanChunk[],
  model: "music_v1" | "music_v2",
  seconds: number,
  prompt: string,
) {
  const apiKey = elevenKey();
  const body =
    model === "music_v2"
      ? {
          composition_plan: {
            chunks: chunks.map((c) => ({
              text: c.text,
              duration_ms: c.durationMs,
              positive_styles: c.positiveStyles,
              negative_styles: c.negativeStyles,
            })),
          },
          model_id: "music_v2",
        }
      : {
          composition_plan: {
            positive_global_styles: chunks[0]?.positiveStyles ?? [],
            negative_global_styles: chunks[0]?.negativeStyles ?? [],
            sections: chunks.map((c, i) => {
              const lines = c.text.split(/\r?\n/);
              const name = lines[0]?.match(/^\[(.+)\]$/)?.[1] ?? `Section ${i + 1}`;
              return {
                section_name: name.slice(0, 100),
                duration_ms: c.durationMs,
                lines: lines
                  .filter((l) => !/^\s*\[[^\]]*\]\s*$/.test(l) && l.trim())
                  .map((l) => l.slice(0, 200))
                  .slice(0, 30),
                positive_local_styles: c.positiveStyles,
                negative_local_styles: c.negativeStyles,
              };
            }),
          },
          model_id: "music_v1",
        };
  const res = await fetch(ELEVEN_BASE, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw elevenError(res.status, await res.text().catch(() => ""));
  const audio = new Uint8Array(await res.arrayBuffer());
  if (audio.byteLength < 1024) throw new Error("The composer returned an empty take.");
  return { prompt, audio, seconds };
}

/**
 * Step one of every compose: write the words, show them, check them.
 *
 * Free for everybody, owner or not, because reading the words is how a host
 * avoids paying for a piece that missed the point. No audio is generated here.
 */
export const studioWords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(settingsShape), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertNotDemo("generate");
    await assertStudioAccess(context.supabase as never, context.userId);
    // Reading the words for a combine is free too, so the same merge runs here:
    // ownership and the AI-only rule are checked before any text is written.
    const ingredients = await loadIngredients(
      context.supabase as never,
      context.userId,
      data.combineFrom,
    );
    const merged = ingredients.length ? combineBrief(briefFromInput(data), ingredients) : null;
    const brief = merged ? merged.brief : briefFromInput(data);
    await screenOrRefuse(briefSafetyText(data, brief), "brief", context.userId);
    const split = await aiSplit(brief.words, splitBriefText(brief.words));
    const prompt = await buildDirection(brief, data.occasion, data.seconds, data.director, split);
    const checks = hardConstraints(brief);

    const locked = (data.lockedLyrics.trim() || merged?.lockedLyrics || "").trim();
    let planned: { chunks: PlanChunk[]; model: "music_v1" | "music_v2" };
    let verdict: ReturnType<typeof verifyPlan>;
    if (locked) {
      // The lock. The words are cut into sections here, in code, so no model
      // gets a chance to rewrite them. The controls are still applied as
      // styles, and the words are read back to prove they survived.
      const fromLocked = planFromLyrics(locked, data.seconds);
      if (!fromLocked.length) throw new Error("Those locked words are empty.");
      planned = { chunks: fromLocked, model: "music_v2" };
      verdict = verifyPlan(applyConstraints(fromLocked, checks), checks);
    } else {
      // The plan step is free, so the plan is read back against the controls
      // before a cent is spent, and a plan that argues with a control is asked
      // for again once rather than paid for.
      planned = await fetchPlan(prompt, data.seconds);
      verdict = verifyPlan(applyConstraints(planned.chunks, checks), checks);
      if (verdict.deviations.length) {
        try {
          const retry = await fetchPlan(
            `${prompt}\n\nYour previous plan contradicted these settings: ${verdict.deviations
              .map((d) => `${d.label} must be ${d.chosen}`)
              .join("; ")}. Write it again and obey them exactly.`,
            data.seconds,
          );
          const retryVerdict = verifyPlan(applyConstraints(retry.chunks, checks), checks);
          if (retryVerdict.deviations.length <= verdict.deviations.length) {
            planned = retry;
            verdict = retryVerdict;
          }
        } catch {
          // Keep the first plan: the host still sees the deviation before paying.
        }
      }
    }
    const chunks = applyConstraints(planned.chunks, checks);
    const model = planned.model;
    const required = requiredPhrases(brief, split);
    const lyrics = planLyrics(chunks);
    // The words step writes text about a named person, so the output is
    // screened too, not just the input.
    await screenOrRefuse(lyrics, "lyrics", context.userId);
    const { missing, present } = verifyLyrics(lyrics, required);
    return {
      ok: true as const,
      prompt,
      plan: chunks,
      planModel: model,
      lyrics,
      split,
      required,
      missing,
      present,
      leaks: themeLeaks(lyrics, split.negatives),
      conflicts: conflictNotes(brief, split),
      coaching: briefCoaching(brief),
      seconds: data.seconds,
      /** Every control, what it was set to, and the exact direction sent. */
      settings: settingsUsed(checks),
      /** Controls the plan confirms, only asserts, or actively contradicts. */
      honoured: verdict.honoured,
      asserted: verdict.asserted,
      deviations: verdict.deviations,
      /** Were the words locked, and did every locked line survive? */
      locked: !!locked,
      lockedIntact: locked ? lyricsIntact(locked, chunks) : true,
      /** What this combine took, and from which piece. */
      credits: merged?.credits ?? [],
      suggestedTitle: ingredients.length ? combineTitle(ingredients) : "",
    };
  });



/**
 * Compose one piece. Auditions (up to 30 seconds) come back as audio for the
 * local shelf; a finished piece is saved to the account and returned with a
 * playable link. Owners compose free; everyone else spends a paid purchase.
 */
export const studioCompose = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(settingsShape), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertNotDemo("generate");
    const { owner } = await assertStudioAccess(context.supabase as never, context.userId);
    const audition = isAudition(data.seconds);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // A fresh take can only be started from a piece this account owns, checked
    // here rather than in the browser.
    if (data.remixOf) {
      const { data: source } = await context.supabase
        .from("sound_pieces")
        .select("id")
        .eq("id", data.remixOf)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!source) throw new Error("That piece can't be found in your library.");
    }

    // Combining. Ownership, the AI-only rule, and the coherence of the
    // selection are all re-checked here before anything is spent, and the merge
    // is recompiled from the stored briefs rather than trusted from the client.
    const ingredients = await loadIngredients(
      context.supabase as never,
      context.userId,
      data.combineFrom,
    );


    // Non-owners: auditions come out of a daily allowance, finished pieces
    // must be paid for first.
    let purchase: { id: string; seconds: number; price_key: string } | null = null;
    if (!owner) {
      if (audition) {
        const { error } = await supabaseAdmin.rpc("sound_take_audition", {
          _user_id: context.userId,
          _limit: FREE_AUDITIONS_PER_DAY,
        });
        if (error) {
          throw new Error(
            `That's all ${FREE_AUDITIONS_PER_DAY} free auditions for today. Come back tomorrow, or make a full piece.`,
          );
        }
      } else {
        if (!data.purchaseId) throw new Error("Pay for the piece first, then compose it.");
        const { data: row } = await supabaseAdmin
          .from("sound_piece_purchases")
          .select("id, seconds, price_key, status, credit_unused, user_id")
          .eq("id", data.purchaseId)
          .maybeSingle();
        const p = row as {
          id: string;
          seconds: number;
          price_key: string;
          status: string;
          credit_unused: boolean;
          user_id: string;
        } | null;
        if (!p || p.user_id !== context.userId) throw new Error("That payment can't be found.");
        if (p.status !== "paid" || !p.credit_unused) {
          throw new Error("That payment has already been used.");
        }
        const tier = tierForPriceKey(p.price_key);
        if (!tier || data.seconds > tier.maxSeconds) {
          throw new Error("That length costs more than the piece you paid for.");
        }
        purchase = { id: p.id, seconds: p.seconds, price_key: p.price_key };
      }
    }

    const merged = ingredients.length
      ? combineBrief(briefFromInput(data), ingredients)
      : null;
    const brief = merged ? merged.brief : briefFromInput(data);
    await screenOrRefuse(briefSafetyText(data, brief), "brief", context.userId);
    const split = await aiSplit(brief.words, splitBriefText(brief.words));
    const required = requiredPhrases(brief, split);
    const checks = hardConstraints(brief);

    // A plan can be edited in the browser, so the controls are re-asserted on it
    // here as well: the render call itself carries them as styles rather than
    // trusting prose that two models have already rewritten. An instrumental
    // cannot be guaranteed from a plan (force_instrumental is prompt-only), so
    // that choice always takes the prompt path.
    // Words taken whole from a parent piece are locked by definition.
    const lockedWords = (data.lockedLyrics.trim() || merged?.lockedLyrics || "").trim();
    const lockedPlan = lockedWords && !isInstrumental(brief) ? planFromLyrics(lockedWords, data.seconds) : [];
    const usePlan = (lockedPlan.length > 0 || Boolean(data.plan?.length)) && !isInstrumental(brief);
    const planned = usePlan
      ? applyConstraints(lockedPlan.length ? lockedPlan : (data.plan as PlanChunk[]), checks)
      : null;
    // The lock is verified, not asserted: if a locked line did not survive into
    // what would be sent, nothing is rendered and nothing is charged.
    if (lockedPlan.length && planned && !lyricsIntact(lockedWords, planned)) {
      throw new Error("Nothing was charged. Your locked words were altered, so the compose was stopped.");
    }
    const verdict = planned
      ? verifyPlan(planned, checks)
      : { honoured: [] as string[], asserted: checks.map((c) => c.id), deviations: [] as ReturnType<typeof verifyPlan>["deviations"] };
    // Checked BEFORE the render call, so a refusal costs nothing and does not
    // count as a provider failure against the purchase.
    if (verdict.deviations.length && !data.acceptDeviations) {
      throw new Error(
        `Nothing was charged. The plan still disagrees with your settings: ${verdict.deviations
          .map((d) => `${d.label} should be ${d.chosen}`)
          .join("; ")}. Rewrite the words at no charge, or choose "compose anyway".`,
      );
    }

    // Words the host read and approved are composed verbatim. Anything else
    // still goes through the sectioned prompt, content first.
    let prompt: string;
    let audio: Uint8Array;
    let lyrics = "";
    let missing: string[] = [];
    try {
      if (planned) {
        prompt = await buildDirection(brief, data.occasion, data.seconds, data.director, split);
        lyrics = planLyrics(planned);
        await screenOrRefuse(lyrics, "lyrics", context.userId);
        missing = verifyLyrics(lyrics, required).missing;
        const out = await composeFromPlan(planned, data.planModel, data.seconds, prompt);
        audio = out.audio;
      } else {
        const out = await composeAudio(brief, data.occasion, data.seconds, data.director, split);
        prompt = out.prompt;
        audio = out.audio;
      }
    } catch (error) {


      // A paid render that fails must never leave the customer holding nothing.
      // The credit stays unused so they can retry immediately, and after
      // repeated provider failures the money goes back on its own.
      if (purchase) {
        {
          const { handleRenderFailure } = await import("@/lib/music-render-failure.server");
          throw new Error(await handleRenderFailure(purchase.id, error));
        }
      }
      throw error;
    }

    if (audition) {
      return {
        ok: true as const,
        prompt,
        lyrics,
        missing,
        seconds: data.seconds,
        contentType: "audio/mpeg",
        audioBase64: base64FromBytes(audio),
        piece: null,
      };
    }

    // Every finished piece keeps its arrangement from now on. When the render
    // went through the prompt path there is no approved plan, so one is written
    // from the same direction here. The plan step is free, and without it
    // "change length" and "combine" have nothing to build on.
    let storedPlan: PlanChunk[] | null = planned;
    let planSource: "approved" | "written-after-render" | "none" = planned ? "approved" : "none";
    if (!storedPlan && !isInstrumental(brief)) {
      try {
        const derived = await fetchPlan(prompt, data.seconds);
        if (derived.chunks.length) {
          storedPlan = applyConstraints(derived.chunks, checks);
          planSource = "written-after-render";
        }
      } catch {
        // Never let this step cost a host a piece they have already paid for.
      }
    }

    // Finished piece: keep it, so it survives the browser.

    const path = `${context.userId}/${crypto.randomUUID()}.mp3`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, audio, { contentType: "audio/mpeg", upsert: false });
    if (upErr) throw new Error("The piece was composed but couldn't be saved. Nothing was charged twice, try again.");

    const title =
      data.title.trim() ||
      // A combine gets a name from its ingredients, so a library of variants
      // stays readable instead of filling with "Untitled song".
      (ingredients.length ? combineTitle(ingredients) : "") ||
      (data.occasion.trim()
        ? `${data.occasion.trim()} ${data.kind === "poem" ? "poem" : "song"}`
        : data.kind === "poem"
          ? "Spoken word piece"
          : "Untitled song");

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("sound_pieces")
      .insert({
        user_id: context.userId,
        kind: data.kind,
        title: title.slice(0, 120),
        words: data.kind === "poem" ? data.poemText : data.words,
        settings: {
          ...brief,
          occasion: data.occasion,
          prompt,
          // Kept so a "this missed what I asked for" retry can be checked on
          // the server rather than taken on trust from the browser.
          lyrics,
          required,
          missing,
          // Which controls the plan confirmed, which we could only assert, and
          // which the host chose to override. Stored so "it ignored my settings"
          // can be answered with evidence instead of a guess.
          settingsUsed: settingsUsed(checks),
          honoured: verdict.honoured,
          asserted: verdict.asserted,
          deviations: verdict.deviations,
          composedFrom: planned ? "approved-plan" : "prompt",
          /** Whether the stored arrangement was approved or written afterwards. */
          planSource,
          forcedInstrumental: isInstrumental(brief),
          // What was taken from where, kept on the row as well as in the join
          // table so the library can show lineage in one read.
          credits: merged?.credits ?? [],
          // Empty string, never null: "nothing locked" has one spelling everywhere.
          lockedLyrics: lockedWords,
        },

        seconds: data.seconds,
        storage_path: path,
        // The arrangement, kept so the same song can be grown or trimmed later
        // from it rather than reinvented.
        plan_json: storedPlan ? (storedPlan as unknown as BriefJson[]) : null,

        licence: PERSONAL_LICENCE,
        // remix_of keeps working for single-parent takes; a multi-source combine
        // also names its first ingredient here so older screens still read.
        ...(data.remixOf
          ? { remix_of: data.remixOf }
          : ingredients.length
            ? { remix_of: ingredients[0].pieceId }
            : {}),
        ...(data.eventId ? { event_id: data.eventId } : {}),
      })
      .select("id, title, kind, seconds, share_token, created_at")
      .single();
    if (insErr || !inserted) {
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      throw new Error("Couldn't save the finished piece. Please try again.");
    }

    // Lineage: one row per ingredient, recording WHAT was taken, not just that
    // it was used. Written after the piece so the rows can never orphan.
    if (ingredients.length) {
      await supabaseAdmin.from("sound_piece_sources").insert(
        ingredients.map((ing, i) => ({
          piece_id: (inserted as { id: string }).id,
          source_piece_id: ing.pieceId,
          took: ing.parts,
          position: i,
        })),
      );
    }


    if (purchase) {
      await supabaseAdmin
        .from("sound_piece_purchases")
        .update({ credit_unused: false, piece_id: (inserted as { id: string }).id })
        .eq("id", purchase.id);
    }

    const row = inserted as {
      id: string;
      title: string;
      kind: string;
      seconds: number;
      share_token: string;
      created_at: string;
    };
    return {
      ok: true as const,
      prompt,
      lyrics,
      missing,
      seconds: data.seconds,
      contentType: "audio/mpeg",
      audioBase64: null,
      piece: {
        id: row.id,
        title: row.title,
        kind: row.kind,
        seconds: row.seconds,
        shareToken: row.share_token,
        createdAt: row.created_at,
        licence: PERSONAL_LICENCE,
        url: await audioUrl(path),
      },
    };
  });

/** Everything this person has kept, newest first. */
export const listMyPieces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ includeDemo: z.boolean().optional() })), i ?? {}, "input"),
  )
  .handler(async ({ data, context }) => {
    // Test pieces live in the same table as real work, so the library asks for
    // real work only unless the shelf is explicitly showing demo material.
    let q = context.supabase
      .from("sound_pieces")
      .select(
        "id, kind, title, seconds, storage_path, storage_bucket, origin, wall_music_id, event_id, prompt, share_token, share_slug, licence, created_at, settings, remix_of, plan_json, is_demo",
      )
      .eq("user_id", context.userId)
      .is("removed_at", null);
    if (!data?.includeDemo) q = q.eq("is_demo", false);
    const { data: pieceData } = await q
      .order("created_at", { ascending: false })
      .limit(60);
    const rows = (pieceData ?? []) as Array<{
      id: string;
      kind: string;
      title: string;
      seconds: number;
      storage_path: string;
      storage_bucket: string;
      origin: string;
      wall_music_id: string | null;
      event_id: string | null;
      prompt: string | null;
      share_token: string;
      share_slug: string | null;
      licence: string;
      created_at: string;
      settings: unknown;
      remix_of: string | null;
      plan_json: unknown;
      is_demo: boolean;
    }>;

    // Lineage for the whole page in one read: what each combined piece came
    // from and what it took, so a good result can be traced to its ingredients.
    const titles = new Map(rows.map((r) => [r.id, r.title]));
    const { data: srcData } = await context.supabase
      .from("sound_piece_sources")
      .select("piece_id, source_piece_id, took, position")
      .in(
        "piece_id",
        rows.map((r) => r.id),
      )
      .order("position", { ascending: true });
    const lineage = new Map<
      string,
      { pieceId: string; title: string; took: string[]; labels: string[] }[]
    >();
    for (const s of (srcData ?? []) as Array<{
      piece_id: string;
      source_piece_id: string;
      took: string[] | null;
      position: number;
    }>) {
      const list = lineage.get(s.piece_id) ?? [];
      const took = s.took ?? [];
      list.push({
        pieceId: s.source_piece_id,
        title: titles.get(s.source_piece_id) ?? "A piece no longer in your library",
        took,
        labels: took.map((t) => partLabel(t)),
      });
      lineage.set(s.piece_id, list);
    }

    return {
      pieces: await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          /** Where a combined piece came from, and what was taken from each. */
          sources: lineage.get(r.id) ?? [],
          kind: r.kind,
          title: r.title,
          seconds: r.seconds,
          shareToken: r.share_token,
          /** Readable share address; falls back to the raw token for old rows. */
          shareKey: r.share_slug || r.share_token,
          licence: r.licence,
          createdAt: r.created_at,
          settings: settingsJson(r.settings),
          remixOf: r.remix_of,
          /** Whether the arrangement was kept, so it can be grown or combined from. */
          hasPlan: Array.isArray(r.plan_json) && r.plan_json.length > 0,
          /** "studio" or "wall": where this piece was composed. */
          origin: r.origin,
          /** The photo wall track this piece is placed on, if any. */
          wallMusicId: r.wall_music_id,
          eventId: r.event_id,
          prompt: r.prompt,
          /** A test piece, kept out of the library and every count by default. */
          isDemo: r.is_demo,
          url: await audioUrl(r.storage_path, r.storage_bucket),

        })),
      ),
    };
  });

/** Unused paid pieces waiting to be composed, including retries after a failure. */
export const listMyPieceCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("sound_piece_purchases")
      .select("id, price_key, seconds, amount_cents, created_at")
      .eq("user_id", context.userId)
      .eq("status", "paid")
      .eq("credit_unused", true)
      .order("created_at", { ascending: false });
    return {
      credits: ((data ?? []) as Array<{
        id: string;
        price_key: string;
        seconds: number;
        amount_cents: number;
        created_at: string;
      }>).map((r) => ({
        id: r.id,
        priceKey: r.price_key,
        seconds: r.seconds,
        amountCents: r.amount_cents,
        createdAt: r.created_at,
      })),
    };
  });

export const renamePiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(120) })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sound_pieces")
      .update({ title: data.title })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Couldn't rename that piece.");
    return { ok: true as const, title: data.title };
  });
/**
 * Move a piece to demo, or bring it back. Reversible on purpose: a test made in
 * the middle of real work should be reclassified in one tap rather than deleted,
 * and a piece filed as demo by mistake should come straight back.
 */
export const setPieceDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ id: z.string().uuid(), isDemo: z.boolean() })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sound_pieces")
      .update({ is_demo: data.isDemo })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Couldn't move that piece.");
    return { ok: true as const, isDemo: data.isDemo };
  });


export const deletePiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ id: z.string().uuid() })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("sound_pieces")
      .select("id, storage_path, storage_bucket")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row) return { ok: true as const };
    const piece = row as { storage_path: string; storage_bucket: string };
    const { error } = await context.supabase
      .from("sound_pieces")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Couldn't remove that piece.");
    // Only studio audio is ours to delete. A piece composed on a photo wall
    // shares its file with the slideshow, so removing the library entry must
    // never pull the audio out from under the wall.
    if (piece.storage_bucket === BUCKET) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from(BUCKET).remove([piece.storage_path]);
    }
    return { ok: true as const };
  });

/**
 * Takedown. Unlike deletePiece this keeps the row as a record: the piece stops
 * playing, the share link stops resolving (the token is rotated and the reader
 * function ignores removed pieces), and who removed it and why is stored.
 * A host can take down their own piece; an owner or admin can take down any.
 */
export const takedownPiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z
      .object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(500) })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    const owner = await isOwnerRole(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("sound_pieces")
      .select("id, user_id, event_id, wall_music_id")
      .eq("id", data.id)
      .maybeSingle();
    const piece = (row ?? null) as { user_id: string } | null;
    if (!piece) throw new Error("That piece can't be found.");
    if (!owner && piece.user_id !== context.userId) {
      throw new Error("That piece can't be found.");
    }
    const { error } = await supabaseAdmin
      .from("sound_pieces")
      .update({
        removed_at: new Date().toISOString(),
        removed_by: context.userId,
        removed_reason: data.reason,
        // Rotating the token is what actually kills a link someone already has.
        share_token: crypto.randomUUID().replace(/-/g, ""),
      })
      .eq("id", data.id);
    if (error) throw new Error("Couldn't take that piece down. Please try again.");
    return { ok: true as const };
  });

/**
 * Every composed piece, for the owner moderation screen. Includes pieces that
 * have already been taken down so the record stays visible, and never returns
 * the brief or the words: a moderator needs the title, who made it and when,
 * and something to listen to, not a second copy of the text that was reported.
 */
export const listPiecesForModeration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("sound_pieces")
      .select(
        "id, user_id, title, kind, seconds, event_id, origin, storage_path, storage_bucket, share_token, created_at, removed_at, removed_reason, is_demo",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      pieces: await Promise.all(
        rows.map(async (r) => ({
          id: String(r.id),
          userId: String(r.user_id ?? ""),
          title: String(r.title ?? "Untitled"),
          kind: String(r.kind ?? "song"),
          seconds: Number(r.seconds ?? 0),
          eventId: (r.event_id as string | null) ?? null,
          origin: String(r.origin ?? "studio"),
          /** Labelled everywhere it shows, so nobody has to ask if it is real. */
          isDemo: !!r.is_demo,
          shareToken: String(r.share_token ?? ""),
          createdAt: String(r.created_at ?? ""),
          removedAt: (r.removed_at as string | null) ?? null,
          removedReason: (r.removed_reason as string | null) ?? null,
          url: r.removed_at
            ? null
            : await audioUrl(String(r.storage_path ?? ""), String(r.storage_bucket ?? BUCKET)),
        })),
      ),
    };
  });





/**
 * "This piece missed what I asked for." Verified on the server against the words
 * that were actually composed, so a genuine miss releases the payment back as a
 * credit and the host composes again at no charge. Charging twice for a fix is
 * what kills trust in a paid AI feature; taking the browser's word for it is
 * what invites free pieces, so we check the stored words ourselves.
 */
export const requestFreeRetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ pieceId: z.string().uuid() })), i, "input"),
  )
  .handler(
    async ({ data, context }): Promise<{ granted: boolean; reason: string; missing: string[] }> => {
      const { data: row } = await context.supabase
        .from("sound_pieces")
        .select("id, settings")
        .eq("id", data.pieceId)
        .eq("user_id", context.userId)
        .maybeSingle();
      const piece = row as { id: string; settings: Record<string, unknown> | null } | null;
      if (!piece) return { granted: false, reason: "That piece can't be found.", missing: [] };
      const settings = (piece.settings ?? {}) as Record<string, unknown>;
      if (settings.retryGranted) {
        return { granted: false, reason: "A free retry was already used on this piece.", missing: [] };
      }
      const required = Array.isArray(settings.required) ? (settings.required as string[]) : [];
      const lyrics = typeof settings.lyrics === "string" ? settings.lyrics : "";
      if (!required.length || !lyrics) {
        return {
          granted: false,
          reason:
            "We don't have the words for this piece on file, so we can't check it. Approve the words on your next compose and this check works.",
          missing: [],
        };
      }
      const { missing } = verifyLyrics(lyrics, required);
      if (!missing.length) {
        return {
          granted: false,
          reason: "Everything you asked for is in these words, so this one counts as delivered.",
          missing: [],
        };
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: purchase } = await supabaseAdmin
        .from("sound_piece_purchases")
        .select("id")
        .eq("piece_id", piece.id)
        .eq("user_id", context.userId)
        .eq("status", "paid")
        .maybeSingle();
      await supabaseAdmin
        .from("sound_pieces")
        .update({ settings: { ...settings, retryGranted: true } })
        .eq("id", piece.id);
      if (purchase) {
        await supabaseAdmin
          .from("sound_piece_purchases")
          .update({ credit_unused: true })
          .eq("id", (purchase as { id: string }).id);
        return {
          granted: true,
          reason: `Missing: ${missing.join(", ")}. Your payment is back as a credit, compose again at no charge.`,
          missing,
        };
      }
      return {
        granted: true,
        reason: `Missing: ${missing.join(", ")}. Compose again at no charge.`,
        missing,
      };
    },
  );

/** A fresh playable link for one of my pieces. */
export const getPieceAudioUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ id: z.string().uuid() })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("sound_pieces")
      .select("storage_path, storage_bucket")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .is("removed_at", null)
      .maybeSingle();
    if (!row) return { url: null };
    const piece = row as { storage_path: string; storage_bucket: string };
    return { url: await audioUrl(piece.storage_path, piece.storage_bucket) };
  });

/**
 * Copy one of my saved songs into the public invitation media bucket and
 * return its public URL, so it can become an event's invitation song.
 *
 * The copy happens entirely server-side from a piece the caller already owns,
 * so no bytes travel up from the browser. That is why this does not go through
 * the device-upload path: nothing new is being introduced, and the demo host
 * needs to be able to swap songs on demo events.
 */
export const publishPieceForInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ id: z.string().uuid() })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("sound_pieces")
      .select("storage_path, storage_bucket, kind, title")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .is("removed_at", null)
      .maybeSingle();
    if (!row) throw new Error("That song can't be found.");
    const piece = row as {
      storage_path: string;
      storage_bucket: string;
      kind: string;
      title: string;
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const download = await supabaseAdmin.storage
      .from(piece.storage_bucket)
      .download(piece.storage_path);
    if (download.error || !download.data) throw new Error("That song could not be read.");
    const bytes = new Uint8Array(await download.data.arrayBuffer());
    const path = `invite-songs/${context.userId}/${data.id}.mp3`;
    const upload = await supabaseAdmin.storage
      .from("atelier-shared")
      .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
    if (upload.error) throw new Error("That song could not be prepared for the invitation.");
    const { data: pub } = supabaseAdmin.storage.from("atelier-shared").getPublicUrl(path);
    if (!pub?.publicUrl) throw new Error("That song could not be prepared for the invitation.");
    return { url: `${pub.publicUrl}?v=${Date.now()}`, title: piece.title };
  });

/**
 * Start a purchase for a finished piece. Creates the pending record first so
 * the webhook (or the client return) can mark it paid, then opens checkout.
 */
export const startPiecePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z
      .object({
        seconds: z.number().int().min(31).max(STUDIO_MAX_SECONDS),
        kind: z.enum(["song", "poem", "letter"]).default("song"),
        title: z.string().trim().max(120).optional().nullable(),
        ecardId: z.string().uuid().optional().nullable(),
        eventId: z.string().trim().min(1).max(64).optional().nullable(),
        returnUrl: z.string().url().max(500),
        environment: z.enum(["sandbox", "live"]).default("sandbox"),
      })), i, "input"),
  )
  .handler(async ({ data, context }): Promise<{ clientSecret: string; purchaseId: string } | { error: string }> => {
    try {
      await assertStudioAccess(context.supabase as never, context.userId);
    } catch (e) {
      return { error: toUserMessage(e, STUDIO_LOCKED_MESSAGE) };
    }
    // Letters and spoken word sit on the cheaper speech ladder; songs on the
    // music ladder. `tierForSeconds` picks the right one from the kind.
    const tier = tierForSeconds(data.seconds, data.kind);
    if (!tier) return { error: "Pick a length between one and four minutes." };

    const { resolveDemoSafeStripeEnv } = await import("@/lib/demo-mode.server");
    const {
      createStripeClient,
      getStripeErrorMessage,
      createCheckoutSessionWithTax,
      resolveOrCreateCustomer,
    } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const env = await resolveDemoSafeStripeEnv(data.environment);
      const stripe = createStripeClient(env);
      const prices = await stripe.prices.list({ lookup_keys: [tier.priceKey] });
      if (!prices.data.length) return { error: "Music isn't on sale right now." };

      const { data: pending, error: insErr } = await supabaseAdmin
        .from("sound_piece_purchases")
        .insert({
          user_id: context.userId,
          ecard_id: data.ecardId ?? null,
          event_id: data.eventId ?? null,
          price_key: tier.priceKey,
          amount_cents: tier.amountCents,
          seconds: data.seconds,
          status: "pending",
          credit_unused: false,
          environment: env,
        })
        .select("id")
        .single();
      if (insErr || !pending) return { error: "Couldn't start that purchase." };
      const purchaseId = (pending as { id: string }).id;

      // A real Customer carrying userId, so the receipt reaches the buyer and
      // the payment can be found again for a refund.
      const customerId = await resolveOrCreateCustomer(stripe, {
        userId: context.userId,
        email: (context.claims as { email?: string } | undefined)?.email ?? null,
      });

      const session = await createCheckoutSessionWithTax(stripe, {
        line_items: [{ price: prices.data[0]!.id, quantity: 1 }],
        customer: customerId,
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        redirect_on_completion: "always",
        // This description is what the customer sees on their Stripe receipt
        // and what the payments dashboard shows, so name the actual piece.
        payment_intent_data: {
          description: [
            "Kenroe Sound Studio",
            data.kind === "letter" ? "letter read aloud" : data.kind === "poem" ? "spoken word piece" : "song",
            data.title ? `"${data.title.slice(0, 60)}"` : null,
            `(${tier.label.toLowerCase()})`,
          ]
            .filter(Boolean)
            .join(" · "),
        },
        metadata: {
          userId: context.userId,
          kind: "music_piece",
          purchaseId,
          ...(data.ecardId ? { ecardId: data.ecardId } : {}),
          ...(data.eventId ? { eventId: data.eventId } : {}),
        },
      }, {
        // Sales tax is worked out at checkout from the buyer's address. If the
        // account is not set up for tax yet, the helper quietly falls back to a
        // plain session rather than blocking the sale.
        automatic_tax: { enabled: true },
      });
      await supabaseAdmin
        .from("sound_piece_purchases")
        .update({ stripe_session_id: session.id })
        .eq("id", purchaseId);
      return { clientSecret: session.client_secret ?? "", purchaseId };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/** Client-side return path: confirm the payment and release the credit. */
export const confirmPiecePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z
      .object({
        sessionId: z.string().min(6).max(200),
        environment: z.enum(["sandbox", "live"]).default("sandbox"),
      })), i, "input"),
  )
  .handler(async ({ data, context }): Promise<{ paid: boolean; purchaseId?: string; seconds?: number }> => {
    const { resolveDemoSafeStripeEnv } = await import("@/lib/demo-mode.server");
    const { createStripeClient } = await import("@/lib/stripe.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const env = await resolveDemoSafeStripeEnv(data.environment);
      const stripe = createStripeClient(env);
      const session = await stripe.checkout.sessions.retrieve(data.sessionId);
      const meta = (session.metadata ?? {}) as Record<string, string>;
      if (meta.kind !== "music_piece" || meta.userId !== context.userId) return { paid: false };
      if (session.payment_status === "unpaid") return { paid: false };
      const { data: row } = await supabaseAdmin
        .from("sound_piece_purchases")
        .update({
          status: "paid",
          credit_unused: true,
          stripe_payment_intent_id:
            typeof session.payment_intent === "string" ? session.payment_intent : null,
        })
        .eq("id", meta.purchaseId!)
        .eq("user_id", context.userId)
        .eq("status", "pending")
        .select("id, seconds")
        .maybeSingle();
      const paidRow = (row ?? null) as { id: string; seconds: number } | null;
      if (paidRow) return { paid: true, purchaseId: paidRow.id, seconds: paidRow.seconds };
      // Already marked paid by the webhook: report the credit either way.
      const { data: existing } = await supabaseAdmin
        .from("sound_piece_purchases")
        .select("id, seconds, status")
        .eq("id", meta.purchaseId!)
        .eq("user_id", context.userId)
        .maybeSingle();
      const ex = (existing ?? null) as { id: string; seconds: number; status: string } | null;
      if (ex?.status === "paid") return { paid: true, purchaseId: ex.id, seconds: ex.seconds };
      return { paid: false };
    } catch {
      return { paid: false };
    }
  });

/** A hand-crafted piece enquiry. Quoted by email, no instant checkout. */
export const requestConcierge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z
      .object({
        contactName: z.string().trim().min(1).max(120),
        contactEmail: z.string().trim().email().max(320),
        occasion: z.string().trim().max(120).default(""),
        brief: z.string().trim().min(10).max(2000),
        budget: z.string().trim().max(60).default(""),
      })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("sound_concierge_requests").insert({
      user_id: context.userId,
      contact_name: data.contactName,
      contact_email: data.contactEmail,
      occasion: data.occasion,
      brief: data.brief,
      budget: data.budget,
    });
    if (error) throw new Error("Couldn't send that request. Please try again.");

    try {
      const { sendManagedEmail } = await import("@/lib/email/managed-send.server");
      const { getSiteSettings } = await import("@/lib/site-settings.functions");
      const settings = await getSiteSettings();
      await sendManagedEmail({
        to: settings.contact_email,
        subject: `Sound Studio concierge request from ${data.contactName}`,
        label: "sound_concierge_request",
        idempotencyKey: `concierge-${context.userId}-${Date.now()}`,
        replyTo: data.contactEmail,
        html: `<p><strong>${data.contactName}</strong> (${data.contactEmail})</p>
<p><strong>Occasion:</strong> ${data.occasion || "not given"}<br/>
<strong>Budget:</strong> ${data.budget || "not given"}</p>
<p>${data.brief.replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>`,
        text: `${data.contactName} (${data.contactEmail})\nOccasion: ${data.occasion}\nBudget: ${data.budget}\n\n${data.brief}`,
      });
    } catch {
      // The request is saved either way; the notification is best effort.
    }
    return { ok: true as const };
  });

/**
 * The private listen page: one piece, by its readable share address or by an
 * older raw token. Both keep working, so links already sent never break.
 * Host and event names come back because the link preview card is meant to
 * show them; the brief, the words and the settings never do.
 */
export const getSharedPiece = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ token: z.string().min(8).max(80) })), i, "input"),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.rpc("get_shared_sound_piece", {
      _key: data.token,
    });
    const row = (Array.isArray(rows) ? rows[0] : null) as {
      id: string;
      kind: string;
      title: string;
      seconds: number;
      storage_path: string;
      storage_bucket: string | null;
      licence: string;
      created_at: string;
      host_name: string | null;
      event_title: string | null;
      words: string | null;
    } | null;
    if (!row) return { piece: null };
    return {
      piece: {
        id: row.id,
        kind: row.kind,
        title: row.title,
        seconds: row.seconds,
        licence: row.licence,
        createdAt: row.created_at,
        hostName: row.host_name,
        eventTitle: row.event_title,
        // The written words travel with the audio: someone who cannot listen,
        // or would rather read, still receives the whole piece.
        words: row.words && row.words.trim() ? row.words.trim() : null,
        url: await audioUrl(row.storage_path, row.storage_bucket ?? (await bucketOf(row.id))),
      },
    };
  });


/** The piece attached to a card, for the reveal view. Public by card slug. */
export const getEcardMusic = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ slug: z.string().min(4).max(64) })), i, "input"),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.rpc("get_ecard_music", { _slug: data.slug });
    const row = (Array.isArray(rows) ? rows[0] : null) as {
      id: string;
      kind: string;
      title: string;
      seconds: number;
      storage_path: string;
      words: string | null;
    } | null;
    if (!row) return { music: null };
    return {
      music: {
        id: row.id,
        kind: row.kind,
        title: row.title,
        seconds: row.seconds,
        words: row.words ?? null,
        url: await audioUrl(row.storage_path, await bucketOf(row.id)),
      },
    };
  });

/**
 * Stamped the first time the recipient actually presses play, so the person who
 * attached the piece is told it was heard and not only that the card was opened.
 */
export const markEcardMusicHeard = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ slug: z.string().min(4).max(64) })), i, "input"),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("mark_ecard_music_heard", { _slug: data.slug });
    return { ok: true };
  });

/**
 * Writing help: sharpen a description, or draft a verse to be read aloud.
 */
export const studioWrite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z
      .object({
        want: z.enum(["poem", "description"]),
        words: z.string().trim().max(WORDS_MAX).default(""),
        genre: z.string().trim().min(1).max(40),
        mood: z.string().trim().min(1).max(40),
        poemStyle: z.string().trim().max(60).default("spoken word tribute"),
        occasion: z.string().trim().max(80).default(""),
        seconds: z.number().int().min(10).max(STUDIO_MAX_SECONDS).default(60),
      })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertNotDemo("generate");
    await assertStudioAccess(context.supabase as never, context.userId);
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("The writing assistant isn't configured yet.");

    const budget = poemWordBudget(data.seconds);
    const system =
      data.want === "poem"
        ? `You write short pieces to be read aloud. Write a ${data.poemStyle} that feels ${data.mood}. About ${budget} words, in short lines, no title, no stage directions, no emoji. Use only names and facts you are given and invent nothing about the people. Warm and specific, never greeting-card generic. Reply with the poem only.`
        : "You help someone describe the piece of music they want. Rewrite their notes as three or four vivid sentences: who it is for, the feeling, the moment it plays, and any names spelled the way they should be pronounced. Keep every fact they gave and invent no new ones. No lists, no headings, under 90 words. Reply with the description only.";

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(key);
    const lines = [
      data.words ? `Notes: ${data.words}` : "No notes yet.",
      data.occasion ? `Occasion: ${data.occasion}` : "",
      `Style: ${data.mood} ${data.genre}`,
    ].filter(Boolean);

    let text = "";
    try {
      const res = await generateText({
        model: gateway("google/gemini-3.7-flash"),
        system,
        prompt: lines.join("\n"),
      });
      text = res.text.trim();
    } catch {
      throw new Error("The writing assistant is busy. Try again in a moment.");
    }
    if (text.length < 10) throw new Error("Couldn't write that yet. Add a little more detail.");
    return { ok: true as const, text: text.slice(0, 1500) };
  });

/**
 * The launch switch. While this is off, Kenroe Sound Studio shows "coming soon"
 * to everyone and only the software owners can compose. Owners only.
 */
export const setStudioPublic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ open: z.boolean() })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    if (!(await isOwnerRole(context.supabase as never, context.userId))) {
      throw new Error("Only the owners can open the studio.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("site_settings")
      .update({ music_studio_public: data.open, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) throw new Error("Couldn't change that setting.");
    return { ok: true as const, open: data.open };
  });

/** Is the studio open to everyone? Owners only. */
export const getStudioPublic = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isOwnerRole(context.supabase as never, context.userId))) {
      throw new Error("Only the owners can see that setting.");
    }
    return { open: await isStudioPublic() };
  });

// ---------------------------------------------------------------------------
// Owner tools: the concierge queue and the sales report.
// Both are owner-only; a signed-in customer never reaches them.
// ---------------------------------------------------------------------------

async function assertOwner(supabase: RoleClient, userId: string) {
  if (!(await isOwnerRole(supabase, userId))) throw new Error("Owners only.");
}

/** The concierge enquiry queue. Owners only. */
export const listConciergeRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("sound_concierge_requests")
      .select(
        "id, contact_name, contact_email, occasion, brief, budget, status, notes, quoted_cents, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    return {
      requests: ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        contactName: String(r.contact_name ?? ""),
        contactEmail: String(r.contact_email ?? ""),
        occasion: String(r.occasion ?? ""),
        brief: String(r.brief ?? ""),
        budget: String(r.budget ?? ""),
        status: String(r.status ?? "new"),
        notes: String(r.notes ?? ""),
        quotedCents: typeof r.quoted_cents === "number" ? r.quoted_cents : null,
        createdAt: String(r.created_at ?? ""),
      })),
    };
  });

export const CONCIERGE_STATUSES = ["new", "quoted", "in progress", "delivered", "closed"] as const;

/** Move a concierge enquiry along, with a quote and private notes. Owners only. */
export const updateConciergeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z
      .object({
        id: z.string().uuid(),
        status: z.enum(CONCIERGE_STATUSES).optional(),
        notes: z.string().trim().max(2000).optional(),
        quotedCents: z.number().int().min(0).max(10_000_00).nullable().optional(),
      })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      updated_at: string;
      status?: string;
      notes?: string;
      quoted_cents?: number | null;
    } = { updated_at: new Date().toISOString() };
    if (data.status) patch.status = data.status;
    if (typeof data.notes === "string") patch.notes = data.notes;
    if (data.quotedCents !== undefined) patch.quoted_cents = data.quotedCents;
    const { error } = await supabaseAdmin
      .from("sound_concierge_requests")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error("Couldn't save that change.");
    return { ok: true as const };
  });

/** Every studio sale, with the piece it produced. Owners only. */
export const soundSalesReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("sound_piece_purchases")
      .select(
        "id, user_id, price_key, seconds, amount_cents, status, credit_unused, environment, ecard_id, event_id, piece_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const pieceIds = rows.map((r) => r.piece_id).filter((v): v is string => typeof v === "string");
    const titles = new Map<string, string>();
    // A piece filed as demo is a test render, never revenue, exactly like a
    // purchase attributed to a demo event.
    const demoPieces = new Set<string>();
    if (pieceIds.length) {
      const { data: pieces } = await supabaseAdmin
        .from("sound_pieces")
        .select("id, title, is_demo")
        .in("id", pieceIds);
      for (const p of (pieces ?? []) as Array<{ id: string; title: string; is_demo: boolean }>) {
        titles.set(p.id, p.title);
        if (p.is_demo) demoPieces.add(p.id);
      }
    }
    // A purchase attributed to a demo event is a test render, never revenue, so
    // the report can hide those by default rather than mixing them into money.
    const eventIds = Array.from(
      new Set(rows.map((r) => r.event_id).filter((v): v is string => typeof v === "string")),
    );
    const demoEvents = new Set<string>();
    if (eventIds.length) {
      const { data: evs } = await supabaseAdmin
        .from("events")
        .select("id, is_demo")
        .in("id", eventIds);
      for (const e of (evs ?? []) as Array<{ id: string; is_demo: boolean }>) {
        if (e.is_demo) demoEvents.add(e.id);
      }
    }
    const sales = rows.map((r) => ({
      id: String(r.id),
      priceKey: String(r.price_key ?? ""),
      seconds: Number(r.seconds ?? 0),
      amountCents: Number(r.amount_cents ?? 0),
      status: String(r.status ?? ""),
      creditUnused: !!r.credit_unused,
      environment: String(r.environment ?? "sandbox"),
      attachedTo: r.ecard_id ? "eCard" : r.event_id ? "Event" : "Standalone",
      eventId: typeof r.event_id === "string" ? r.event_id : null,
      isDemo:
        (typeof r.event_id === "string" && demoEvents.has(r.event_id)) ||
        (typeof r.piece_id === "string" && demoPieces.has(r.piece_id)),
      title: typeof r.piece_id === "string" ? (titles.get(r.piece_id) ?? "") : "",
      createdAt: String(r.created_at ?? ""),
    }));
    const paid = sales.filter(
      (s) => s.status === "paid" && s.environment === "live" && !s.isDemo,
    );
    return {
      sales,
      totals: {
        paidCount: paid.length,
        paidCents: paid.reduce((n, s) => n + s.amountCents, 0),
        unusedCredits: sales.filter((s) => s.status === "paid" && s.creditUnused).length,
      },
    };
  });

// ---------------------------------------------------------------------------
// Changing the length of a piece he already has
// ---------------------------------------------------------------------------

/**
 * Hand a finished recording back to the composer so it can be kept verbatim and
 * built around. This is what makes a genuine extension possible rather than a
 * fresh render that only resembles the original.
 *
 * Returns null when the composer will not take it, and the caller then promises
 * a new recording instead. Never throws: a failure here changes what we promise,
 * it does not stop the host.
 */
async function storeForInpainting(piece: {
  id: string;
  storage_path: string;
  storage_bucket: string;
  eleven_song_id: string | null;
}): Promise<string | null> {
  if (piece.eleven_song_id) return piece.eleven_song_id;
  try {
    const apiKey = elevenKey();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: file } = await supabaseAdmin.storage
      .from(piece.storage_bucket || BUCKET)
      .download(piece.storage_path);
    if (!file) return null;
    const form = new FormData();
    form.append("file", file, "piece.mp3");
    const res = await fetch("https://api.elevenlabs.io/v1/music/upload", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { song_id?: string };
    const songId = typeof json.song_id === "string" ? json.song_id : null;
    if (!songId) return null;
    await supabaseAdmin
      .from("sound_pieces")
      .update({ eleven_song_id: songId })
      .eq("id", piece.id);
    return songId;
  } catch {
    return null;
  }
}

type LengthPieceRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  seconds: number;
  storage_path: string;
  storage_bucket: string;
  settings: unknown;
  plan_json: unknown;
  eleven_song_id: string | null;
  loop_ready: boolean;
  event_id: string | null;
};

/** One piece of this account's library, or a plain refusal. */
async function loadOwnPiece(
  supabase: { from: (t: string) => any },
  userId: string,
  pieceId: string,
): Promise<LengthPieceRow> {
  const { data } = await supabase
    .from("sound_pieces")
    .select(
      "id, user_id, kind, title, seconds, storage_path, storage_bucket, settings, plan_json, eleven_song_id, loop_ready, event_id",
    )
    .eq("id", pieceId)
    .eq("user_id", userId)
    .is("removed_at", null)
    .maybeSingle();
  const row = data as LengthPieceRow | null;
  if (!row) throw new Error("That piece can't be found in your library.");
  return row;
}

/** What the host has already paid towards one piece, in cents. */
async function paidCentsFor(pieceId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("sound_piece_purchases")
    .select("amount_cents, status")
    .eq("piece_id", pieceId)
    .eq("status", "paid");
  return ((data ?? []) as Array<{ amount_cents: number | null }>).reduce(
    (n, r) => Math.max(n, r.amount_cents ?? 0),
    0,
  );
}

/** The plan stored with a piece, if it has one worth reusing. */
function storedPlan(value: unknown): PlanChunk[] {
  if (!Array.isArray(value)) return [];
  return (value as Array<Record<string, unknown>>)
    .filter((c) => typeof c["text"] === "string")
    .map((c) => ({
      text: String(c["text"]).slice(0, 6000),
      durationMs: Math.min(120000, Math.max(3000, Number(c["durationMs"]) || 15000)),
      positiveStyles: Array.isArray(c["positiveStyles"]) ? (c["positiveStyles"] as string[]) : [],
      negativeStyles: Array.isArray(c["negativeStyles"]) ? (c["negativeStyles"] as string[]) : [],
    }));
}

export const lengthShape = z.object({
  pieceId: z.string().uuid(),
  toSeconds: z.number().int().min(10).max(STUDIO_MAX_SECONDS),
  mode: z.enum(["verse", "instrumental", "chorus"]).default("verse"),
  /** Set when the host locked his words: growth is then musical only. */
  keepWords: z.boolean().default(false),
  /** Words approved for the new verse, from the free step below. */
  newVerse: z.string().trim().max(2000).default(""),
  purchaseId: z.string().uuid().nullish(),
  title: z.string().trim().max(120).default(""),
});

/**
 * The free step. Works out what the change costs, whether the original
 * recording can genuinely be kept, writes the extra words for approval, and
 * hands back exactly what will be sent. No audio, no charge.
 */
export const lengthPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(lengthShape), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertNotDemo("generate");
    await assertStudioAccess(context.supabase as never, context.userId);
    const {
      defaultGrowMode,
      lengthCharge,
      lengthPromise,
      loopAdvice,
      relengthPlan,
      addedSectionCount,
    } = await import("@/lib/studio-length");

    const row = await loadOwnPiece(context.supabase as never, context.userId, data.pieceId);
    const saved = settingsJson(row.settings) ?? {};
    const brief = briefFrom(DEFAULT_SONG_SETTINGS, saved);
    const locked = data.keepWords || typeof saved["lockedLyrics"] === "string";
    const instrumental = isInstrumental(brief);
    const base = storedPlan(row.plan_json);
    const mode = data.mode || defaultGrowMode({ instrumental });

    const paid = await paidCentsFor(row.id);
    const charge = lengthCharge({
      fromSeconds: row.seconds,
      toSeconds: data.toSeconds,
      paidCents: paid,
      pieceKind: row.kind === "poem" || row.kind === "letter" ? row.kind : "song",
    });

    // Can the original recording actually be kept? Answered by asking the
    // composer to hold it, not by assuming. Only relevant when growing and only
    // when we still have the approved arrangement to build on.
    const growing = data.toSeconds > row.seconds;
    const songId = growing && base.length ? await storeForInpainting(row) : row.eleven_song_id;
    const route: "extend" | "rerender" = growing && songId && base.length ? "extend" : "rerender";

    // New words for the extra time, written free and shown before any money
    // moves. A locked piece never gets new words at all.
    let verse = data.newVerse;
    if (growing && mode === "verse" && !locked && !instrumental && !verse) {
      const extra = Math.max(15, data.toSeconds - row.seconds);
      try {
        const split = splitBriefText(brief.words);
        const prompt = await buildDirection(brief, String(saved["occasion"] ?? ""), extra, false, split);
        const planned = await fetchPlan(
          `${prompt}\n\nWrite ONE additional verse to follow this song, in the same voice, on the same subject. Do not repeat lines already used.`,
          extra,
        );
        verse = planLyrics(planned.chunks).trim().slice(0, 1200);
      } catch {
        verse = "";
      }
    }
    if (verse) await screenOrRefuse(verse, "lyrics", context.userId);

    const grown = base.length
      ? relengthPlan({
          chunks: base,
          toSeconds: data.toSeconds,
          mode,
          instrumental,
          lockedLyrics: locked,
          newVerse: verse,
        })
      : [];

    return {
      ok: true as const,
      piece: { id: row.id, title: row.title, seconds: row.seconds, kind: row.kind },
      toSeconds: data.toSeconds,
      mode,
      route,
      /** In his words, before he pays. */
      promise: lengthPromise(route, data.toSeconds),
      charge,
      locked,
      instrumental,
      /** The extra words, for approval. Empty when nothing new is sung. */
      newVerse: verse,
      /** Every section that will be sent, so nothing is a surprise. */
      plan: grown,
      addedSections: addedSectionCount(base, grown),
      hasStoredPlan: base.length > 0,
      /** Offered free before any paid render, when this plays under pictures. */
      loopHint:
        row.loop_ready || row.event_id ? loopAdvice(row.seconds, 30) : null,
      loopReady: !!row.loop_ready,
    };
  });

/**
 * Compose the new length. The original is never touched: this always writes a
 * new piece, with the old one recorded as its source.
 */
export const lengthCompose = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(lengthShape), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertNotDemo("generate");
    const { owner } = await assertStudioAccess(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      addedSectionCount,
      extendChunks,
      isAudioRef,
      lengthCharge,
      relengthPlan,
    } = await import("@/lib/studio-length");

    const row = await loadOwnPiece(context.supabase as never, context.userId, data.pieceId);
    const saved = settingsJson(row.settings) ?? {};
    const brief = briefFrom(DEFAULT_SONG_SETTINGS, saved);
    const lockedWords =
      typeof saved["lockedLyrics"] === "string" ? String(saved["lockedLyrics"]).trim() : "";
    const locked = data.keepWords || !!lockedWords;
    const instrumental = isInstrumental(brief);
    const base = storedPlan(row.plan_json);
    if (!base.length) {
      // Designed limitation, not a fault: keep it out of the error monitor.
      throw expectedError(
        "This piece was made before we started keeping its arrangement, so it can't be lengthened. Composing it again is the only route.",
      );
    }


    const paid = await paidCentsFor(row.id);
    const charge = lengthCharge({
      fromSeconds: row.seconds,
      toSeconds: data.toSeconds,
      paidCents: paid,
      pieceKind: row.kind === "poem" || row.kind === "letter" ? row.kind : "song",
    });

    // Money. Owners compose free; everyone else must already hold a credit that
    // covers what this change costs.
    let purchase: { id: string } | null = null;
    if (!owner && charge.amountCents > 0) {
      if (!data.purchaseId) throw new Error("Pay for the longer version first, then compose it.");
      const { data: pRow } = await supabaseAdmin
        .from("sound_piece_purchases")
        .select("id, status, credit_unused, user_id, price_key")
        .eq("id", data.purchaseId)
        .maybeSingle();
      const p = pRow as {
        id: string;
        status: string;
        credit_unused: boolean;
        user_id: string;
        price_key: string;
      } | null;
      if (!p || p.user_id !== context.userId) throw new Error("That payment can't be found.");
      if (p.status !== "paid" || !p.credit_unused) throw new Error("That payment has already been used.");
      const tier = tierForPriceKey(p.price_key);
      if (!tier || data.toSeconds > tier.maxSeconds) {
        throw new Error("That length costs more than the credit you're holding.");
      }
      purchase = { id: p.id };
    }

    if (data.newVerse) await screenOrRefuse(data.newVerse, "lyrics", context.userId);

    const checks = hardConstraints(brief);
    const grown = applyConstraints(
      relengthPlan({
        chunks: base,
        toSeconds: data.toSeconds,
        mode: data.mode,
        instrumental,
        lockedLyrics: locked,
        newVerse: locked ? "" : data.newVerse,
      }),
      checks,
    );
    // The lock, verified rather than asserted: if a line he approved did not
    // survive into what would be sent, nothing renders and nothing is charged.
    if (lockedWords && !lyricsIntact(lockedWords, grown)) {
      throw new Error("Nothing was charged. Your locked words were altered, so the compose was stopped.");
    }

    const added = addedSectionCount(base, grown);
    const songId = data.toSeconds > row.seconds ? await storeForInpainting(row) : row.eleven_song_id;
    const canExtend = !!songId && added > 0;

    const prompt = String(saved["prompt"] ?? "");
    let audio: Uint8Array;
    try {
      if (canExtend) {
        // The genuine extension: the original recording is inserted unchanged
        // and only the new time is generated.
        const chunks = extendChunks({
          songId: songId!,
          originalSeconds: row.seconds,
          grown,
          addedCount: added,
        });
        audio = await composeWithChunks(chunks.map((c) =>
          isAudioRef(c)
            ? { song_id: c.songId, range: { start_ms: c.startMs, end_ms: c.endMs } }
            : {
                text: c.text,
                duration_ms: c.durationMs,
                positive_styles: c.positiveStyles,
                negative_styles: c.negativeStyles,
                context_adherence: "high" as const,
              },
        ));
      } else {
        const out = await composeFromPlan(grown, "music_v2", data.toSeconds, prompt);
        audio = out.audio;
      }
    } catch (error) {
      if (purchase) {
          const { handleRenderFailure } = await import("@/lib/music-render-failure.server");
          throw new Error(await handleRenderFailure(purchase.id, error));
        }
      throw error;
    }

    const path = `${context.userId}/${crypto.randomUUID()}.mp3`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, audio, { contentType: "audio/mpeg", upsert: false });
    if (upErr) throw new Error("The piece was composed but couldn't be saved. Try again.");

    const label = data.toSeconds >= 60 ? `${Math.round(data.toSeconds / 60)} min` : `${data.toSeconds}s`;
    const title = (data.title.trim() || `${row.title} (${label})`).slice(0, 120);
    const lyrics = planLyrics(grown);

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("sound_pieces")
      .insert({
        user_id: context.userId,
        kind: row.kind,
        title,
        words: typeof saved["words"] === "string" ? saved["words"] : "",
        settings: {
          ...brief,
          occasion: saved["occasion"] ?? "",
          prompt,
          lyrics,
          // Empty string, never null: "nothing locked" has one spelling everywhere.
          lockedLyrics: lockedWords,
          lengthChange: {
            from: row.seconds,
            to: data.toSeconds,
            mode: data.mode,
            route: canExtend ? "extend" : "rerender",
          },
        },
        seconds: data.toSeconds,
        storage_path: path,
        plan_json: grown as unknown as BriefJson[],
        parent_seconds: row.seconds,
        eleven_song_id: null,
        licence: PERSONAL_LICENCE,
        remix_of: row.id,
        ...(row.event_id ? { event_id: row.event_id } : {}),
      })
      .select("id, title, kind, seconds, share_token, share_slug, created_at")
      .single();
    if (insErr || !inserted) {
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      throw new Error("Couldn't save the new version. Please try again.");
    }
    const newId = (inserted as { id: string }).id;

    // Lineage, using the same join table as a combine: what it came from and
    // what was taken, which here is the whole song at a different length.
    await supabaseAdmin.from("sound_piece_sources").insert({
      piece_id: newId,
      source_piece_id: row.id,
      took: ["length"],
      position: 0,
    });

    if (purchase) {
      await supabaseAdmin
        .from("sound_piece_purchases")
        .update({ credit_unused: false, piece_id: newId })
        .eq("id", purchase.id);
    }

    const out = inserted as {
      id: string;
      title: string;
      kind: string;
      seconds: number;
      share_token: string;
      share_slug: string | null;
      created_at: string;
    };
    return {
      ok: true as const,
      route: canExtend ? ("extend" as const) : ("rerender" as const),
      lyrics,
      piece: {
        id: out.id,
        title: out.title,
        kind: out.kind,
        seconds: out.seconds,
        shareToken: out.share_token,
        shareKey: out.share_slug || out.share_token,
        createdAt: out.created_at,
        licence: PERSONAL_LICENCE,
        url: await audioUrl(path),
      },
    };
  });

/**
 * Mark a piece as good for looping under photographs. Free, and the reason the
 * "make it longer" screen can offer the cheaper answer first.
 */
export const setPieceLoop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z.object({ pieceId: z.string().uuid(), loop: z.boolean() })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sound_pieces")
      .update({ loop_ready: data.loop })
      .eq("id", data.pieceId)
      .eq("user_id", context.userId);
    if (error) throw new Error("Couldn't save that just now.");
    return { ok: true as const, loop: data.loop };
  });
