/**
 * The spoken invitation: server side.
 *
 * ONE recording per event, not one per guest. That is the whole point of this
 * file. Two hundred guests opening the same invitation share one audio file;
 * a new reading is paid for only when the spoken words themselves change,
 * which is why the words are fingerprinted rather than the event.
 *
 * The sequence a guest hears is assembled here too, in the order a person
 * would want it: the host's own voice note first, the reading second, music
 * last. A streaming playlist can never be started programmatically (the
 * service's own player owns that), so it comes back as something to press
 * rather than something we promise to play, and the studio piece stands behind
 * it so a guest is never left in silence.
 *
 * Public on purpose: a guest has no account. Rate limited per IP, and it
 * exposes nothing the invitation page does not already show.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { parseInput } from "@/lib/user-error";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertEventOwner } from "@/lib/event-cohosts.server";
import {
  narrationHash,
  narrationParagraphs,
  narrationSeconds,
  narrationSpeechText,
  type NarrationSource,
} from "@/lib/invite-narration";
import { recommendedVoice, studioVoiceId, voiceById } from "@/lib/studio-voices";
import { isShowcaseEvent } from "@/lib/showcase";

const BUCKET = "sound-pieces";
const SIGNED_URL_SECONDS = 60 * 60 * 6;

/** The whole reading is capped: a script this long means something is wrong. */
const MAX_SCRIPT_CHARS = 2400;
/**
 * Christopher's own licensed voice ("A Southern Gentleman", ElevenLabs Voice
 * Design, not a clone). The cache key below includes this id, so changing it
 * makes every invitation re-read itself on the next play; readings already on
 * file in the old voice are simply never served again.
 */
export const INVITATION_NARRATION_VOICE_ID = "d4m4BR3VP3E3Iyz1NJSV";

export interface InvitePerformance {
  /** Nothing to perform: the button must not be shown at all. */
  available: boolean;
  /** The host's own recording, played first when there is one. */
  voiceNoteUrl: string | null;
  narration: {
    url: string | null;
    /** Paragraph by paragraph, for captions and for the transcript. */
    paragraphs: string[];
    seconds: number;
    /** True when the audio was already on file (no new reading was paid for). */
    cached: boolean;
    /** Somebody else is mid-render. Try again in a moment. */
    pending: boolean;
    voiceLabel: string | null;
  };
  /**
   * A streaming playlist, when the host set one. It can only ever be pressed by
   * the guest (the service's own player owns playback), so it is separate from
   * the sequence and the playable music below still stands behind it.
   */
  playlist: { url: string; title: string | null } | null;
  /** What plays after the reading, in the order we try it. */
  music:
    | { kind: "song"; url: string; title: string | null }
    | { kind: "poem" | "letter"; url: string; title: string | null; words: string | null }
    | null;
}


function publicClient() {
  return createClient<Database>(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

async function rateLimitOrThrow(scope: string, max: number, windowMs: number) {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { enforceIpRateLimit } = await import("@/lib/rate-limit.server");
  try {
    const limited = enforceIpRateLimit(getRequest(), { scope, max, windowMs });
    if (limited) throw limited;
  } catch (e) {
    if (e instanceof Response) throw e;
  }
}

type Blob = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function sourceFromEvent(ev: Blob): NarrationSource {
  const hosts = Array.isArray(ev["hosts"])
    ? (ev["hosts"] as Blob[]).map((h) => ({ name: str(h?.["name"]), role: str(h?.["role"]) }))
    : null;
  // Host-set phonetic spellings: a venue or family name the voice gets wrong.
  const pronunciations = Array.isArray(ev["pronunciations"])
    ? (ev["pronunciations"] as Blob[])
        .map((p) => ({ term: str(p?.["term"]) ?? "", sayAs: str(p?.["sayAs"]) ?? "" }))
        .filter((p) => p.term && p.sayAs)
        .slice(0, 24)
    : null;
  return {
    title: str(ev["title"]),
    date: str(ev["date"]),
    timezone: str(ev["timezone"]),
    venue: str(ev["venue"]),
    // The spoken script is built from the STORED address, never from the line
    // the page renders: that is what turned "Dr" into "Doctor".
    address: str(ev["address"]),
    city: str(ev["city"]),
    message: str(ev["message"]),
    welcomeQuote: str(ev["welcomeQuote"]),
    hostName: str(ev["hostName"]),
    hosts,
    dressCode: str(ev["dressCode"]),
    // Potluck: the items live in their own table, so the spoken line says the
    // sheet exists rather than reading a list of dishes at a listener.
    bringNote:
      ev["bringSheetEnabled"] === true
        ? "There's a sign-up sheet on this page for what to bring, if you'd like to add something."
        : null,
    pronunciations,
  };
}


/**
 * Everything the guided playthrough needs, in one call. Generates the reading
 * on the first guest to ask for it and serves the same file to everyone after.
 */
export const getInvitePerformance = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    parseInput(
      z.object({ eventId: z.string().min(1).max(80) }),
      input,
      "invite-narration.functions.ts:getInvitePerformance",
    ),
  )
  .handler(async ({ data }): Promise<InvitePerformance> => {
    await rateLimitOrThrow("invite-performance", 40, 60 * 1000);

    const empty: InvitePerformance = {
      available: false,
      voiceNoteUrl: null,
      narration: { url: null, paragraphs: [], seconds: 0, cached: false, pending: false, voiceLabel: null },
      playlist: null,
      music: null,
    };

    const sb = publicClient();
    const { data: row } = await sb.rpc("get_public_event_by_id", { _id: data.eventId });
    if (!row) return empty;
    const isShowcase = isShowcaseEvent(data.eventId);
    const { sanitizePublicEvent } = await import("@/lib/public-event-sanitize");
    const ev = sanitizePublicEvent(row as Blob, null, null) as Blob;

    const source = sourceFromEvent(ev);
    const paragraphs = narrationParagraphs(source);
    const script = narrationSpeechText(source).slice(0, MAX_SCRIPT_CHARS);
    const hash = narrationHash(`${INVITATION_NARRATION_VOICE_ID}\n${script}`);
    // A Southern Gentleman is the invitation default: neutral Black American,
    // conversational rather than announcer-like. If the id ever leaves the
    // curated list, the occasion's recommended voice stands in.
    const voiceId = voiceById(INVITATION_NARRATION_VOICE_ID)
      ? INVITATION_NARRATION_VOICE_ID
      : studioVoiceId(recommendedVoice(String(source.title ?? "")));
    const voiceLabel = voiceById(voiceId)?.label ?? null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    /* ------------------------------------------------- what plays afterwards */
    let music: InvitePerformance["music"] = null;
    const playlistUrl = str(ev["playlistUrl"]);
    const songUrl = str(ev["songUrl"]);
    const playlist = playlistUrl
      ? { url: playlistUrl, title: str(ev["songTitle"]) }
      : null;
    if (songUrl) {
      music = { kind: "song", url: songUrl, title: str(ev["songTitle"]) };
    } else {

      // The event's own studio piece, poem before letter: a poem sits under an
      // invitation more naturally than a letter addressed to one person.
      const { data: pieces } = await supabaseAdmin
        .from("sound_pieces")
        .select("id, kind, title, words, storage_path, storage_bucket, seconds, removed_at")
        .eq("event_id", data.eventId)
        .is("removed_at", null)
        .order("created_at", { ascending: false })
        .limit(12);
      const rows = (pieces ?? []) as {
        kind: string | null;
        title: string | null;
        words: string | null;
        storage_path: string | null;
        storage_bucket: string | null;
      }[];
      const order = ["song", "poem", "letter"];
      const chosen = order
        .map((k) => rows.find((r) => r.kind === k && r.storage_path))
        .find(Boolean);
      if (chosen?.storage_path) {
        const { data: signed } = await supabaseAdmin.storage
          .from(chosen.storage_bucket || BUCKET)
          .createSignedUrl(chosen.storage_path, SIGNED_URL_SECONDS);
        if (signed?.signedUrl) {
          music =
            chosen.kind === "song"
              ? { kind: "song", url: signed.signedUrl, title: chosen.title }
              : {
                  kind: chosen.kind === "letter" ? "letter" : "poem",
                  url: signed.signedUrl,
                  title: chosen.title,
                  words: chosen.words && chosen.words.trim() ? chosen.words.trim() : null,
                };
        }
      }
    }

    const voiceNoteUrl = str(ev["voiceMessage"]);

    /* ------------------------------------------------------ the reading itself */
    const apiKey = process.env["ELEVENLABS_API_KEY"];
    let url: string | null = null;
    let cached = false;
    let pending = false;

    const signPath = async (path: string) => {
      const { data: signed } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_SECONDS);
      return signed?.signedUrl ?? null;
    };

    // The showcase is a fixture, never a billable generation: it reads
    // whatever narration is already cached and never calls ElevenLabs.
    if (apiKey && script && !isShowcase) {
      const { data: claimRows } = await supabaseAdmin.rpc("claim_invite_narration", {
        _event_id: data.eventId,
        _hash: hash,
        _script: script,
        _chars: script.length,
        _voice_id: voiceId,
      });
      const claim = (Array.isArray(claimRows) ? claimRows[0] : claimRows) as
        | { ready: boolean; should_generate: boolean; storage_path: string | null; seconds: number | null }
        | null;

      if (claim?.ready && claim.storage_path) {
        cached = true;
        url = await signPath(claim.storage_path);
      } else if (claim?.should_generate) {
        try {
          const res = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
            {
              method: "POST",
              headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
              body: JSON.stringify({
                text: script,
                model_id: "eleven_multilingual_v2",
                // Tuned for a long, emotional read rather than a clip: higher
                // stability so the voice does not drift over a minute, low style
                // so it never performs, and slightly under pace so names and
                // places land.
                voice_settings: {
                  stability: 0.72,
                  similarity_boost: 0.8,
                  style: 0.12,
                  use_speaker_boost: true,
                  speed: 0.93,
                },
              }),
            },
          );
          if (!res.ok) {
            console.error(`[invite-narration] speech failed [${res.status}]`);
            pending = true;
          } else {
            const audio = new Uint8Array(await res.arrayBuffer());
            const path = `invite-narration/${data.eventId}/${voiceId}/${hash}.mp3`;
            const { error: upErr } = await supabaseAdmin.storage
              .from(BUCKET)
              .upload(path, audio, { contentType: "audio/mpeg", upsert: true });
            if (upErr) {
              console.error("[invite-narration] upload failed", upErr.message);
              pending = true;
            } else {
              await supabaseAdmin.rpc("finish_invite_narration", {
                _event_id: data.eventId,
                _hash: hash,
                _path: path,
                _seconds: narrationSeconds(paragraphs),
                _voice_id: voiceId,
              });
              url = await signPath(path);
            }
          }
        } catch (err) {
          console.error("[invite-narration] generation error", err);
          pending = true;
        }
      } else {
        // Another guest is mid-render on these same words.
        pending = true;
      }
    } else if (isShowcase && apiKey && script) {
      // Showcase: read whatever is already on file for these exact words, but
      // never claim/generate a new reading.
      const { data: existing } = await supabaseAdmin
        .from("invite_narrations")
        .select("storage_path, seconds")
        .eq("event_id", data.eventId)
        .eq("script_hash", hash)
        .eq("voice_id", voiceId)
        .maybeSingle();
      const row2 = existing as { storage_path: string | null; seconds: number | null } | null;
      if (row2?.storage_path) {
        cached = true;
        url = await signPath(row2.storage_path);
      }
    }

    const hasSomething = !!voiceNoteUrl || !!url || !!music || !!playlist;
    return {
      available: hasSomething,
      voiceNoteUrl,
      narration: {
        url,
        paragraphs,
        seconds: narrationSeconds(paragraphs),
        cached,
        pending,
        voiceLabel,
      },
      playlist,
      music,

    };
  });

/** Lets a host discard a stale reading. The next invite request rebuilds it. */
export const regenerateInviteNarration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(
      z.object({ eventId: z.string().min(1).max(80) }),
      input,
      "invite-narration.functions.ts:regenerateInviteNarration",
    ),
  )
  .handler(async ({ data, context }) => {
    // The showcase's owner check always fails for a real signed-in visitor
    // (its account is locked, no password, nobody can hold its session), so
    // this also refuses regeneration there by construction.
    await assertEventOwner(
      context.supabase,
      data.eventId,
      context.userId,
      "event.invitation_narration_regenerate_override",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Demo host events never spend a new reading either: hand back whatever
    // is already cached rather than clearing it and forcing a fresh one.
    if (isShowcaseEvent(data.eventId)) {
      return { ok: false, reason: "Sample invitations don't regenerate narration.", voiceId: INVITATION_NARRATION_VOICE_ID };
    }
    const { data: eventRow } = await supabaseAdmin
      .from("events")
      .select("is_demo")
      .eq("id", data.eventId)
      .maybeSingle();
    if ((eventRow as { is_demo?: boolean } | null)?.is_demo) {
      const { data: existing } = await supabaseAdmin
        .from("invite_narrations")
        .select("storage_path")
        .eq("event_id", data.eventId)
        .not("storage_path", "is", null)
        .limit(1);
      const hasCached = ((existing ?? []) as { storage_path?: string | null }[]).length > 0;
      return {
        ok: hasCached,
        reason: hasCached
          ? "Demo event: the cached reading was kept as is."
          : "Demo events don't generate new narration.",
        voiceId: INVITATION_NARRATION_VOICE_ID,
      };
    }

    const { error } = await supabaseAdmin
      .from("invite_narrations")
      .update({ storage_path: null, seconds: null, generating_at: null })
      .eq("event_id", data.eventId);
    if (error) throw new Error(error.message);
    return { ok: true, voiceId: INVITATION_NARRATION_VOICE_ID };
  });
