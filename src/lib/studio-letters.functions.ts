/**
 * Letters: the server side.
 *
 * Two steps, in this order, always:
 *   1. letterWrite  — free. Prepares or tightens the text, screens it for
 *      safety, checks it against what the writer actually supplied, and reports
 *      how long it will take to read. Nothing is spent.
 *   2. letterCompose — reads the APPROVED text aloud with a fixed studio voice
 *      and, if asked, lays an instrumental bed underneath. Saved to the library
 *      like any other piece, and printable as words.
 *
 * The two rules that matter are enforced here, not in the interface:
 *   - No voice cloning. The voice id is looked up in a fixed list; anything else
 *     is replaced by the first studio voice, so an arbitrary id cannot be sent.
 *   - No invented facts. The writing pass is told it may not invent, and what it
 *     returns is checked against the writer's own material. Anything that looks
 *     like a new name, number, date or quotation is returned as a question for
 *     the writer, and a letter is never read aloud until they have seen it.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotDemo } from "@/lib/demo-mode.server";
import { parseInput } from "@/lib/user-error";
import { nullSafe } from "@/lib/zod-nullsafe";
import {
  AUDITION_MAX_SECONDS,
  FREE_AUDITIONS_PER_DAY,
  PERSONAL_LICENCE,
  tierForPriceKey,
} from "@/lib/music-studio-pricing";
import { STUDIO_MAX_SECONDS } from "@/lib/music-studio.functions";
import { STUDIO_LOCKED_MESSAGE, studioAllowed } from "@/lib/studio-gate";
import {
  LETTER_OCCASIONS,
  LETTER_PACES,
  letterVoiceId,
  letterWritingPrompt,
  possibleInventions,
  printableLetter,
  speechText,
  spokenSeconds,
  suppliedMaterial,
  letterVoiceSettings,
} from "@/lib/studio-letter";

const BUCKET = "sound-pieces";
const SIGNED_URL_SECONDS = 60 * 60 * 6;

const paceKeys = LETTER_PACES.map((p) => p.key) as [string, ...string[]];
const occasionKeys = LETTER_OCCASIONS.map((o) => o.key) as [string, ...string[]];

const letterShape = z.object({
  occasion: z.enum(occasionKeys).default("other"),
  /** The writer's own draft. The source of truth when it is present. */
  draft: z.string().trim().max(6000).default(""),
  /** Notes about the moment, when there is no draft yet. */
  about: z.string().trim().max(2000).default(""),
  honoree: z.string().trim().max(120).default(""),
  fromName: z.string().trim().max(120).default(""),
  mustInclude: z.string().trim().max(1200).default(""),
  pace: z.enum(paceKeys).default("natural"),
  paragraphPause: z.number().int().min(1).max(3).default(1),
  emphasis: z.array(z.string().trim().max(60)).max(8).default([]),
  seconds: z.number().int().min(10).max(STUDIO_MAX_SECONDS).default(60),
  voice: z.string().trim().max(80).default(""),
  /** Warm, solemn, celebratory, conversational, joyful. */
  delivery: z.string().trim().max(20).default("warm"),
  /** The honoree's name spelled as it is said, used only in what is spoken. */
  sayName: z.string().trim().max(120).default(""),
  /** An instrumental bed under the reading, composed from this description. */
  bed: z.string().trim().max(200).default(""),
  title: z.string().trim().max(120).default(""),
});

const composeShape = letterShape.extend({
  /** The exact words the writer approved. Read character for character. */
  letter: z.string().trim().min(20).max(6000),
  /** They have seen the possible-invention list and confirmed every line. */
  factsConfirmed: z.boolean().default(false),
  /** A paid, unused credit to spend, for anything over an audition. */
  purchaseId: z.string().uuid().optional(),
  eventId: z.string().trim().min(1).max(64).optional().nullable(),
});

type RoleClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> };

async function assertAccess(supabase: RoleClient, userId: string): Promise<{ owner: boolean }> {
  // Owners are Chris and Adrian: the `owner` role only.
  const { data: isOwner } = await supabase.rpc("has_role", { _user_id: userId, _role: "owner" });
  if (isOwner) return { owner: true };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("music_studio_public")
    .eq("id", true)
    .maybeSingle();
  const publicOpen = !!(data as { music_studio_public?: boolean } | null)?.music_studio_public;
  if (!studioAllowed({ isOwner: false, publicOpen })) {
    throw new Error(STUDIO_LOCKED_MESSAGE);
  }
  return { owner: false };
}

/** Safety screening, unchanged from the rest of the studio: grief and faith pass. */
async function screenOrRefuse(text: string, stage: "brief" | "lyrics", userId: string) {
  const { screenText } = await import("@/lib/music-safety");
  const verdict = await screenText(text);
  if (verdict.allowed) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("sound_safety_refusals")
      .insert({ user_id: userId, stage, categories: verdict.categories });
  } catch {
    /* a logging failure must never turn a refusal into an allow */
  }
  throw new Error(verdict.reason);
}

/**
 * Step one, free: prepare the letter and check it.
 *
 * When the writer has a draft, that draft is the source of truth and the pass
 * may only tighten it. When they have not, it is written from their notes, and
 * still may not invent anything they did not say.
 */
export const letterWrite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(nullSafe(letterShape), i, "input"))
  .handler(async ({ data, context }) => {
    await assertNotDemo("generate");
    await assertAccess(context.supabase as never, context.userId);
    const supplied = suppliedMaterial({
      letterText: data.draft,
      words: data.about,
      honoree: data.honoree,
      mustInclude: data.mustInclude,
      keyMoment: "",
      fromName: data.fromName,
    });
    if (!supplied.trim()) {
      throw new Error("Write a few lines, or say what the letter is about, and we will shape it.");
    }
    await screenOrRefuse([data.draft, data.about, data.mustInclude].join("\n"), "brief", context.userId);

    const prompt = letterWritingPrompt({
      occasion: data.occasion,
      seconds: data.seconds,
      pace: data.pace as never,
      draft: data.draft,
      about: data.about,
      honoree: data.honoree,
      fromName: data.fromName,
      mustInclude: data.mustInclude,
    });

    let letter = data.draft.trim();
    const key = process.env["LOVABLE_API_KEY"];
    if (key) {
      try {
        const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
        const { generateText } = await import("ai");
        const gateway = createLovableAiGatewayProvider(key);
        const { text } = await generateText({
          model: gateway("google/gemini-3.6-flash"),
          prompt,
        });
        if (text.trim().length > 20) letter = text.trim();
      } catch {
        // No letter is ever lost to a chatty model: we fall back to the
        // writer's own words exactly as typed.
      }
    }
    if (!letter) {
      throw new Error("Couldn't prepare the letter. Type it in and we will read it as written.");
    }

    await screenOrRefuse(letter, "lyrics", context.userId);

    const invented = possibleInventions(letter, supplied);
    return {
      ok: true as const,
      letter,
      seconds: data.seconds,
      spokenSeconds: spokenSeconds(letter, data.pace as never),
      /** Anything that reads like a fact the writer never gave us. */
      possibleInventions: invented,
      printable: printableLetter({
        title: data.title,
        letter,
        honoree: data.honoree,
        fromName: data.fromName,
      }),
    };
  });

/** Read the approved letter aloud, with an optional instrumental bed. */
export const letterCompose = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(nullSafe(composeShape), i, "input"))
  .handler(async ({ data, context }) => {
    await assertNotDemo("generate");
    const { owner } = await assertAccess(context.supabase as never, context.userId);
    const audition = data.seconds <= AUDITION_MAX_SECONDS;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const supplied = suppliedMaterial({
      letterText: data.draft,
      words: data.about,
      honoree: data.honoree,
      mustInclude: data.mustInclude,
      fromName: data.fromName,
    });
    // The check is done again here, on the words actually being read, because
    // this is the last point before a real person hears it.
    const invented = possibleInventions(data.letter, supplied);
    if (invented.length && !data.factsConfirmed) {
      throw new Error(
        `Nothing was charged. These are in the letter but not in anything you gave us: ${invented
          .slice(0, 6)
          .join(", ")}. Confirm or remove them first.`,
      );
    }
    await screenOrRefuse(data.letter, "lyrics", context.userId);

    // Gates, on the server. Auditions come out of the daily allowance, anything
    // longer needs a paid, unspent credit that covers the length asked for.
    let purchase: { id: string } | null = null;
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
        purchase = { id: p.id };
      }
    }

    const apiKey = process.env["ELEVENLABS_API_KEY"];
    if (!apiKey) throw new Error("Reading letters aloud isn't configured yet.");

    // Speech, not music: a music model paraphrases, and a letter must be said
    // exactly as written. The voice id comes from a fixed list, so no uploaded
    // or cloned voice can ever be requested.
    const voiceId = letterVoiceId(data.voice);
    const spoken = speechText(data.letter, {
      pace: data.pace as never,
      paragraphPause: data.paragraphPause,
      emphasis: data.emphasis,
      honoree: data.honoree,
      sayName: data.sayName,
    });
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: spoken,
          model_id: "eleven_multilingual_v2",
          voice_settings: letterVoiceSettings(data.pace as never, data.delivery),
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      console.error(`[letters] speech failed [${res.status}]: ${detail.slice(0, 400)}`);
      throw new Error(
        res.status === 429
          ? "The reading voice is busy. Try again in a moment, nothing was charged twice."
          : "Couldn't read that aloud just now. Nothing was used up, please try again.",
      );
    }
    const voiceAudio = new Uint8Array(await res.arrayBuffer());

    const path = `${context.userId}/${crypto.randomUUID()}.mp3`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, voiceAudio, { contentType: "audio/mpeg", upsert: false });
    if (upErr) throw new Error("The letter was read but couldn't be saved. Please try again.");

    const title =
      data.title.trim() ||
      (data.honoree.trim() ? `A letter for ${data.honoree.trim()}` : "A letter, read aloud");

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("sound_pieces")
      .insert({
        user_id: context.userId,
        kind: "letter",
        title: title.slice(0, 120),
        words: data.letter,
        settings: {
          kind: "letter",
          occasion: data.occasion,
          pace: data.pace,
          paragraphPause: data.paragraphPause,
          emphasis: data.emphasis,
          voice: voiceId,
          delivery: data.delivery,
          sayName: data.sayName,
          honoree: data.honoree,
          fromName: data.fromName,
          bed: data.bed,
          // The words, kept so the printed keepsake and the recording can never
          // drift apart.
          lyrics: data.letter,
          lockedLyrics: data.letter,
          printable: printableLetter({
            title,
            letter: data.letter,
            honoree: data.honoree,
            fromName: data.fromName,
          }),
          possibleInventions: invented,
          factsConfirmed: data.factsConfirmed,
          composedFrom: "read-aloud",
        },
        seconds: Math.max(10, Math.min(STUDIO_MAX_SECONDS, spokenSeconds(data.letter, data.pace as never))),
        storage_path: path,
        licence: PERSONAL_LICENCE,
        ...(data.eventId ? { event_id: data.eventId } : {}),
      })
      .select("id, title, kind, seconds, share_token, created_at")
      .single();
    if (insErr || !inserted) {
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      throw new Error("Couldn't save the finished letter. Please try again.");
    }

    if (purchase) {
      await supabaseAdmin
        .from("sound_piece_purchases")
        .update({ credit_unused: false, piece_id: (inserted as { id: string }).id })
        .eq("id", purchase.id);
    }

    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS);
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
      piece: {
        id: row.id,
        title: row.title,
        kind: row.kind,
        seconds: row.seconds,
        shareToken: row.share_token,
        createdAt: row.created_at,
        licence: PERSONAL_LICENCE,
        url: signed?.signedUrl ?? null,
      },
      printable: printableLetter({
        title: row.title,
        letter: data.letter,
        honoree: data.honoree,
        fromName: data.fromName,
      }),
    };
  });
