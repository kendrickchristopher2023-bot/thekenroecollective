/**
 * Kenroe Sound Studio — Venture 05, a standalone music and spoken-word studio.
 *
 * Publicly this page is a "coming soon" teaser with a sample gallery and a way
 * to ask for early access. Signed-in owners get the full studio: unlimited
 * composes and downloads, no daily allowance. Once the studio opens to
 * everyone, auditions stay free and a finished piece is paid for by length.
 */
import { toUserMessage } from "@/lib/user-error";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SoundLengthPanel } from "@/components/sound-length-panel";
import { Download, Library, Loader2, Music4, Play, ShieldAlert, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useAuthReady } from "@/hooks/use-auth-ready";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import {
  studioAccess,
  studioCompose,
  studioWords,
  requestFreeRetry,
  studioWrite,
  listMyPieces,
  listMyPieceCredits,
  startPiecePurchase,
  confirmPiecePurchase,
  renamePiece,
  setPieceDemo,
  deletePiece,
  takedownPiece,
  requestConcierge,
  STUDIO_LENGTHS,
} from "@/lib/music-studio.functions";
import {
  AUDITION_MAX_SECONDS,
  CONCIERGE_FROM_CENTS,
  FREE_AUDITIONS_PER_DAY,
  PIECE_TIERS,
  SPEECH_TIERS,
  money,
  priceLabelForSeconds,
} from "@/lib/music-studio-pricing";
import { RefundTerms, useRefundCopy } from "@/components/refund-terms";
import {
  DEFAULT_SONG_SETTINGS,
  GENRES,
  MOODS,
  POEM_STYLES,
  POEM_VOICES,
  VOICES,
  voiceOptions,
  composeWaitLabel,
  songLengthLabel,
  type SongSettings,
} from "@/lib/wall-soundtrack";
import {
  DEFAULT_BRIEF_EXTRAS,
  ERAS,
  GENRE_FAMILIES,
  INSTRUMENTS,
  LANGUAGES,
  SONG_STRUCTURES,
  VOCAL_TEXTURES,
  briefCoaching,
  type StudioBrief,
} from "@/lib/studio-brief";
import {
  SOUND_DESIGN_NOTE,
  WEAK_BRIEF_SCORE,
  WORDS_MAX,
  planToText,
  textToPlan,
  type PlanChunk,
} from "@/lib/studio-words";
import { StudioUseOnEvent } from "@/components/studio-use-on-event";
import { StudioLetterPanel } from "@/components/studio-letter-panel";

import { SoundCombinePanel, type CombineSelection } from "@/components/sound-combine-panel";
import { downloadFileName } from "@/lib/sound-download-name";
import { pieceShareUrl } from "@/lib/sound-share";
import {
  AddToPlaylistMenu,
  SoundPlaylistsPanel,
  useMyPlaylists,
} from "@/components/sound-playlists-panel";
import {
  listSamples,
  removeSample,
  sampleAgeLabel,
  samplePlayable,
  saveSample,
  type ShelfSample,
} from "@/lib/sample-shelf";


export const Route = createFileRoute("/music")({
  head: () => ({
    meta: [
      { title: "Kenroe Sound Studio — Custom songs and spoken word" },
      {
        name: "description",
        content:
          "Kenroe Sound Studio composes a one-of-a-kind song or spoken-word piece for your celebration, named guests and all. Coming soon from The Kenroe Collective.",
      },
      { property: "og:title", content: "Kenroe Sound Studio — Custom songs and spoken word" },
      {
        property: "og:description",
        content:
          "Original songs and spoken-word pieces made for one occasion, in minutes. Coming soon from The Kenroe Collective.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MusicStudioPage,
});

/** The local shelf is event-scoped; the studio uses one reserved bucket. */
const STUDIO_SHELF_KEY = "studio";

type AccessInfo = {
  allowed: boolean;
  owner: boolean;
  publicOpen: boolean;
  auditionsLeft: number | null;
};

type SavedPiece = {
  id: string;
  kind: string;
  title: string;
  seconds: number;
  shareToken: string;
  /** Readable slug plus a random tail, used for share links. */
  shareKey?: string | null;
  licence?: string;
  createdAt?: string;
  url: string | null;
  settings?: Record<string, unknown> | null;
  /** Where this piece was composed: "studio" or "wall". */
  origin?: string | null;
  /** Whether the arrangement was kept, so it can be grown or combined from. */
  hasPlan?: boolean;
  /** What a combined piece was made from, and what was taken from each. */
  sources?: { pieceId: string; title: string; took: string[]; labels: string[] }[];
  /** A test piece: hidden from the library unless demo pieces are shown. */
  isDemo?: boolean;
};

type Credit = { id: string; priceKey: string; seconds: number; amountCents: number };

function MusicStudioPage() {
  const { ready, user } = useAuthReady();
  const access = useQuery({
    queryKey: ["studio-access", user?.id ?? "anon"],
    enabled: ready && !!user,
    queryFn: async () => (await studioAccess()) as AccessInfo,
    staleTime: 60_000,
  });
  const allowed = !!access.data?.allowed;

  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      <header className="mx-auto max-w-5xl px-6 pt-10">
        <Link to="/" className="text-xs font-medium uppercase tracking-[0.28em] text-blossom">
          The Kenroe Collective
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-blossom/80">
          Collection 01 · Celebrations
        </p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-ink sm:text-5xl">
          Kenroe Sound Studio
        </h1>
        <p className="mt-4 max-w-2xl text-base text-ink/70">
          An original song or spoken-word piece written for one occasion, with the
          guests of honour named out loud. Choose the feel, hear a short taste, then
          keep the full version to play at the party, in a slideshow, or on a card.
        </p>

        {!access.data?.publicOpen ? (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-blossom/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-blossom">
            <Music4 className="h-3.5 w-3.5" aria-hidden /> Coming soon
          </div>
        ) : null}

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Songs that say the names",
              body: "Sung, in the genre and mood you pick, with the spelling honoured so names are never mumbled.",
            },
            {
              title: "Spoken word",
              body: "A poem read over a quiet bed of music. Write it yourself or let the studio draft one.",
            },
            {
              title: "Taste before you commit",
              body: "Short 10, 20 and 30 second auditions are free, then keep a full one to four minute piece.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-blossom/20 bg-blossom/5 p-5">
              <h2 className="font-serif text-lg text-ink">{f.title}</h2>
              <p className="mt-1 text-sm text-ink/70">{f.body}</p>
            </div>
          ))}
        </div>

        <section className="mt-10 rounded-3xl border border-ink/10 bg-white/70 p-6">
          <h2 className="font-serif text-2xl text-ink">What a piece costs</h2>
          <p className="mt-1 text-sm text-ink/60">
            Auditions are free. You only pay for a piece you decide to keep, and the
            price is the same whether it stands alone or rides along on a Group eCard.
          </p>
          {[
            { heading: "A song", tiers: PIECE_TIERS },
            { heading: "A letter or spoken word piece", tiers: SPEECH_TIERS },
          ].map((group) => (
            <div key={group.heading} className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blossom">
                {group.heading}
              </p>
              <ul className="mt-2 grid gap-3 sm:grid-cols-3">
                {group.tiers.map((t) => (
                  <li key={t.priceKey} className="rounded-2xl border border-ink/10 bg-paper p-4">
                    <p className="font-serif text-xl text-ink">{money(t.amountCents)}</p>
                    <p className="mt-1 text-sm text-ink/65">{t.label}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-4 text-sm text-ink/60">
            Want it hand crafted by Christopher instead, with revisions and real
            instruments? The concierge service starts at {money(CONCIERGE_FROM_CENTS)}.
          </p>
        </section>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            to="/contact"
            className="rounded-full bg-blossom px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {access.data?.publicOpen ? "Talk to us about concierge →" : "Ask for early access →"}
          </Link>
          <Link
            to="/gatherings"
            className="rounded-full px-6 py-3 text-sm font-medium text-blossom ring-1 ring-blossom/30 transition-colors hover:bg-blossom/5"
          >
            Explore Events &amp; Gatherings
          </Link>
        </div>

        {ready && !user ? (
          <p className="mt-8 text-sm text-ink/60">
            Already in the private preview?{" "}
            <Link to="/auth" search={{ redirect: "/music" }} className="underline decoration-blossom/40 underline-offset-4">
              Sign in
            </Link>
            .
          </p>
        ) : null}

        {allowed ? <StudioComposer access={access.data as AccessInfo} /> : null}
        {ready && user ? <ConciergePanel email={user.email ?? ""} /> : null}
      </main>
    </div>
  );
}

type Take = {
  id: string;
  url: string;
  seconds: number;
  title: string;
  prompt: string;
  /** Set when the piece was saved to the library, so a miss can be reported. */
  pieceId?: string;
  missing?: string[];
};

/** The words step: what the composer intends to sing, before any audio. */
type Words = {
  seconds: number;
  prompt: string;
  plan: PlanChunk[];
  planModel: "music_v1" | "music_v2";
  lyrics: string;
  required: string[];
  missing: string[];
  leaks: string[];
  conflicts: string[];
  /** Every control, what it was set to, and the direction sent for it. */
  settings: { label: string; chosen: string; direction: string; verifiable: boolean }[];
  /** Controls the plan confirms in its own words. */
  honoured: string[];
  /** Controls we asserted that the plan does not restate either way. */
  asserted: string[];
  /** Controls the plan actively contradicts, shown before any payment. */
  deviations: { id: string; label: string; chosen: string; detail: string }[];
  split: {
    discarded: string[];
    production: string[];
    soundDesign: string[];
    mustInclude: string[];
  };
};


function StudioComposer({ access }: { access: AccessInfo }) {
  const [settings, setSettings] = useState<StudioBrief>({
    ...DEFAULT_SONG_SETTINGS,
    ...DEFAULT_BRIEF_EXTRAS,
  });
  const [remixOf, setRemixOf] = useState<{ id: string; title: string } | null>(null);
  /**
   * A loaded combination: which pieces it draws on and what is taken from each.
   * Sent with every write and compose so the merge is recompiled and re-checked
   * on the server, and so the lineage is recorded against the finished piece.
   */
  const [combine, setCombine] = useState<{
    selection: CombineSelection[];
    credits: { label: string; from: string }[];
    lockedLyrics: string;
  } | null>(null);
  // "Fresh take" used to scroll the window to the very top, which is the
  // marketing hero, so the form it had just filled in was off screen and the
  // button looked dead. It now scrolls to the form itself and says what it did.
  const formRef = useRef<HTMLElement | null>(null);

  const [showBrief, setShowBrief] = useState(true);
  const [occasion, setOccasion] = useState("");
  const [title, setTitle] = useState("");
  // A greeting card can send a host straight here to write a letter
  // (/music?compose=letter), so the studio opens on the letter panel.
  const search = useSearch({ strict: false }) as { compose?: string };
  const [letterMode, setLetterMode] = useState(search.compose === "letter");

  const [busySeconds, setBusySeconds] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  const [take, setTake] = useState<Take | null>(null);
  const [shelf, setShelf] = useState<ShelfSample[]>([]);
  const [buySeconds, setBuySeconds] = useState<number | null>(null);
  const refundCopy = useRefundCopy();
  const [refundOk, setRefundOk] = useState(false);
  // A fresh purchase asks again, so nobody pays on a tick from an earlier piece.
  useEffect(() => { setRefundOk(false); }, [buySeconds]);
  const [words, setWords] = useState<Words | null>(null);
  const [wordsBusy, setWordsBusy] = useState(false);
  const [draftLyrics, setDraftLyrics] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const urls = useRef<string[]>([]);

  const isPoem = settings.kind === "poem";
  const voiceList = voiceOptions(isPoem ? POEM_VOICES : VOICES, settings.voice);
  const owner = access.owner;

  const playlists = useMyPlaylists();
  // Test pieces are out of the way by default and one tap away when wanted.
  const [showDemo, setShowDemo] = useState(false);
  const library = useQuery({
    queryKey: ["studio-library", showDemo],
    queryFn: async () =>
      (await listMyPieces({ data: { includeDemo: showDemo } } as never)) as {
        pieces: SavedPiece[];
      },
  });
  const credits = useQuery({
    queryKey: ["studio-credits"],
    enabled: !owner,
    queryFn: async () => (await listMyPieceCredits()) as { credits: Credit[] },
  });

  useEffect(() => {
    void listSamples(STUDIO_SHELF_KEY).then(setShelf);
    return () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  // Coming back from checkout: confirm the payment, then the credit is ready.
  useEffect(() => {
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("music_session");
    if (!sessionId) return;
    void (async () => {
      const res = (await confirmPiecePurchase({
        data: { sessionId, environment: getStripeEnvironment() },
      } as never)) as { paid: boolean; seconds?: number };
      if (res.paid) {
        toast.success("Payment received. Compose your piece whenever you are ready.");
        await credits.refetch();
      } else {
        toast.error("We are still confirming that payment.");
      }
      url.searchParams.delete("music_session");
      window.history.replaceState({}, "", url.toString());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof StudioBrief>(key: K, value: StudioBrief[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  /** Reload a saved brief (from the shelf or a library piece) into the desk. */
  function loadBrief(saved: Record<string, unknown> | null | undefined) {
    const prev = (saved ?? {}) as Partial<StudioBrief> & { occasion?: string };
    setSettings({
      ...DEFAULT_SONG_SETTINGS,
      ...DEFAULT_BRIEF_EXTRAS,
      ...prev,
      instruments: Array.isArray(prev.instruments)
        ? prev.instruments.filter((i): i is string => typeof i === "string").slice(0, 8)
        : [],
    } as StudioBrief);
    if (typeof prev.occasion === "string") setOccasion(prev.occasion);
  }

  function toggleInstrument(name: string) {
    setSettings((s) => {
      const has = s.instruments.includes(name);
      if (has) return { ...s, instruments: s.instruments.filter((i) => i !== name) };
      if (s.instruments.length >= 8) return s;
      return { ...s, instruments: [...s.instruments, name] };
    });
  }

  function blobUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    return url;
  }

  /** The paid credit that covers this length, if there is one. */
  function creditFor(seconds: number): Credit | null {
    const list = credits.data?.credits ?? [];
    return list.find((c) => c.seconds >= seconds) ?? null;
  }

  async function compose(seconds: number, approved?: Words, acceptDeviations = false) {
    if (busySeconds !== null) return;
    const audition = seconds <= AUDITION_MAX_SECONDS;
    let purchaseId: string | undefined;
    if (!owner && !audition) {
      const credit = creditFor(seconds);
      if (!credit) {
        setBuySeconds(seconds);
        return;
      }
      purchaseId = credit.id;
    }

    setBusySeconds(seconds);
    const toastId = toast.loading(
      `Composing ${songLengthLabel(seconds)} — ${composeWaitLabel(seconds)}`,
    );
    try {
      const res = (await studioCompose({
        data: {
          ...settings,
          occasion,
          seconds,
          title,
          purchaseId,
          acceptDeviations,
          ...(approved ? { plan: approved.plan, planModel: approved.planModel } : {}),
          ...(remixOf ? { remixOf: remixOf.id } : {}),
          ...(combine
            ? { combineFrom: combine.selection, lockedLyrics: combine.lockedLyrics }
            : {}),
        },
      } as never)) as {

        audioBase64: string | null;
        contentType: string;
        prompt: string;
        lyrics: string;
        missing: string[];
        seconds: number;
        piece: SavedPiece | null;
      };
      const name = title.trim() || `${settings.mood} ${settings.genre} ${isPoem ? "poem" : "song"}`;

      if (res.piece) {
        // A kept piece lives in the account, not just this device.
        setTake({
          id: res.piece.id,
          pieceId: res.piece.id,
          url: res.piece.url ?? "",
          seconds: res.piece.seconds,
          title: res.piece.title,
          prompt: res.prompt,
          missing: res.missing ?? [],
        });
        setRemixOf(null);
        setCombine(null);
        setWords(null);
        await Promise.all([library.refetch(), owner ? Promise.resolve() : credits.refetch()]);
        toast.success(`${songLengthLabel(res.seconds)} saved to your library`, { id: toastId });
        return;
      }

      const bytes = Uint8Array.from(atob(res.audioBase64 ?? ""), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: res.contentType });
      setTake({
        id: crypto.randomUUID(),
        url: blobUrl(blob),
        seconds: res.seconds,
        title: name,
        prompt: res.prompt,
      });
      // The shelf is for auditions only. Anything of a paid length belongs in
      // the library, which survives this browser, so if one ever comes back
      // without a saved piece it is said out loud rather than quietly parked on
      // a device where it can be lost.
      if (res.seconds > AUDITION_MAX_SECONDS) {
        toast.error(
          "This came back without being saved to your library. Download it now, then compose it again so it is kept.",
          { id: toastId, duration: 12000 },
        );
        return;
      }
      setShelf(
        await saveSample({
          id: crypto.randomUUID(),
          eventId: STUDIO_SHELF_KEY,
          createdAt: Date.now(),
          seconds: res.seconds,
          prompt: res.prompt,
          settings: { ...settings, occasion } as Record<string, unknown>,
          title: name,
          artist: "",
          contentType: res.contentType,
          audio: blob,
        }),
      );
      toast.success(`${songLengthLabel(res.seconds)} ready`, { id: toastId });

    } catch (e) {
      toast.error(toUserMessage(e, "Couldn't compose that."), { id: toastId });
    } finally {
      setBusySeconds(null);
    }
  }

  /**
   * Step one: have the composer write the words as text and check them against
   * everything the host asked for. Free, and always before any paid audio.
   */
  async function writeWords(seconds: number) {
    if (wordsBusy || busySeconds !== null) return;
    setWordsBusy(true);
    const toastId = toast.loading("Writing the words. No credits spent yet.");
    try {
      const res = (await studioWords({
        data: {
          ...settings,
          occasion,
          seconds,
          title,
          ...(combine
            ? { combineFrom: combine.selection, lockedLyrics: combine.lockedLyrics }
            : {}),
        },
      } as never)) as Words & { ok: true };
      setWords(res);
      setDraftLyrics(planToText(res.plan));
      setShowPrompt(false);
      if (res.missing.length) {
        toast.error(`Not in the words yet: ${res.missing.join(", ")}. Edit them or rewrite.`, {
          id: toastId,
          duration: 8000,
        });
      } else {
        toast.success("Words ready. Read them, edit anything, then compose.", { id: toastId });
      }
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn't write the words."), { id: toastId });
    } finally {
      setWordsBusy(false);
    }
  }

  /** Approve the words on screen and spend on the audio. */
  async function approveAndCompose(acceptDeviations = false) {
    if (!words) return;
    const audition = words.seconds <= AUDITION_MAX_SECONDS;
    if (!audition && coaching.score < WEAK_BRIEF_SCORE) {
      const ok = window.confirm(
        `This brief is ${coaching.score}/6. Weak briefs make forgettable pieces.\n\n${coaching.tips.join(
          "\n",
        )}\n\nCompose anyway?`,
      );
      if (!ok) return;
    }
    const plan = textToPlan(draftLyrics, words.plan);
    await compose(words.seconds, { ...words, plan }, acceptDeviations);
  }


  /** "It missed what I asked for." Checked on the server, not taken on trust. */
  async function reportMiss(pieceId: string) {
    try {
      const res = (await requestFreeRetry({ data: { pieceId } } as never)) as {
        granted: boolean;
        reason: string;
      };
      if (res.granted) {
        toast.success(res.reason, { duration: 9000 });
        await credits.refetch();
      } else {
        toast.error(res.reason, { duration: 9000 });
      }
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn't check that piece."));
    }
  }

  async function help(want: "poem" | "description") {
    if (writing) return;
    setWriting(true);
    try {
      const res = (await studioWrite({
        data: {
          want,
          words: settings.words,
          genre: settings.genre,
          mood: settings.mood,
          poemStyle: settings.poemStyle,
          occasion,
          seconds: 60,
        },
      } as never)) as { text: string };
      if (want === "poem") set("poemText", res.text);
      else set("words", res.text);
      toast.success(want === "poem" ? "Verse drafted" : "Description sharpened");
    } catch (e) {
      toast.error(toUserMessage(e, "The writing assistant is busy."));
    } finally {
      setWriting(false);
    }
  }

  function download(url: string, name: string) {
    // The audio lives on the storage host, so a cross-origin `download`
    // attribute is ignored and the browser would save the UUID in the path.
    // Storage honours a `download` query parameter by setting the filename
    // header itself, which is what actually gives him "The Title.mp3".
    const file = downloadFileName(name);
    const a = document.createElement("a");
    try {
      const u = new URL(url, window.location.origin);
      u.searchParams.set("download", file);
      a.href = u.toString();
    } catch {
      a.href = url;
    }
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const selectClass =
    "mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink";
  const coaching = briefCoaching(settings);

  return (
    <section
      ref={formRef}
      className="mt-14 rounded-3xl border border-blossom/25 bg-white/70 p-6 sm:p-8"
    >

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blossom">
            {owner ? "Private preview" : "The studio"}
          </p>
          <h2 className="mt-1 font-serif text-2xl text-ink">The studio</h2>
          <p className="mt-1 text-sm text-ink/60">
            {owner
              ? "Unlimited composes and downloads while this is owners only."
              : access.auditionsLeft === null
                ? "Auditions are free."
                : `${access.auditionsLeft} of ${FREE_AUDITIONS_PER_DAY} free auditions left today. The count resets at midnight, UTC.`}
          </p>
        </div>
        <div className="inline-flex rounded-full bg-ink/5 p-1">
          {(["song", "poem", "letter"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                if (k === "letter") {
                  setLetterMode(true);
                  return;
                }
                setLetterMode(false);
                set("kind", k);
                set("voice", k === "poem" ? POEM_VOICES[0]! : VOICES[0]!);
              }}
              className={`min-h-[40px] rounded-full px-4 text-sm font-medium ${
                (k === "letter" ? letterMode : !letterMode && settings.kind === k)
                  ? "bg-blossom text-white"
                  : "text-ink/70"
              }`}
            >
              {k === "song" ? "Song" : k === "poem" ? "Poem" : "Letter"}
            </button>
          ))}
        </div>
      </div>

      {letterMode ? (
        <StudioLetterPanel
          owner={owner}
          credits={credits.data?.credits ?? []}
          onSaved={() => void library.refetch()}
        />
      ) : (
        <>


      {!owner && credits.data?.credits?.length ? (
        <p className="mt-4 rounded-2xl border border-blossom/30 bg-blossom/5 p-4 text-sm text-ink/75">
          You have {credits.data.credits.length} paid{" "}
          {credits.data.credits.length === 1 ? "piece" : "pieces"} waiting. Set the feel,
          then pick the length you paid for.
        </p>
      ) : null}

      {remixOf ? (
        <p className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-blossom/30 bg-blossom/5 p-4 text-sm text-ink/75">
          <span>Fresh take of "{remixOf.title}". Change anything, then compose.</span>
          <button
            type="button"
            onClick={() => setRemixOf(null)}
            className="min-h-[36px] rounded-full px-3 text-xs text-ink/60 ring-1 ring-ink/15 hover:bg-ink/5"
          >
            Start clean instead
          </button>
        </p>
      ) : null}

      {combine ? (
        <div className="mt-4 rounded-2xl border border-blossom/30 bg-blossom/5 p-4 text-sm text-ink/75">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium text-ink">A combination is loaded</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {combine.credits.map((c) => (
                  <li key={`${c.label}-${c.from}`}>
                    {c.label} from "{c.from}"
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink/55">
                A new recording will be made from these instructions. Nothing is lifted out
                of the original recordings.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCombine(null)}
              className="min-h-[36px] rounded-full px-3 text-xs text-ink/60 ring-1 ring-ink/15 hover:bg-ink/5"
            >
              Start clean instead
            </button>
          </div>
        </div>
      ) : (
        <SoundCombinePanel
          pieces={(library.data?.pieces ?? []).map((p) => ({
            id: p.id,
            title: p.title,
            kind: p.kind,
            seconds: p.seconds,
            settings: p.settings ?? null,
            origin: p.origin ?? null,
            hasPlan: p.hasPlan ?? false,
          }))}
          busy={busySeconds !== null || wordsBusy}
          onUse={(input) => {
            loadBrief(input.brief as unknown as Record<string, unknown>);
            setCombine({
              selection: input.selection,
              credits: input.credits,
              lockedLyrics: input.lockedLyrics,
            });
            if (!title.trim()) setTitle(input.title);
            setWords(null);
            toast.success("Combination loaded. Change anything, then pick a length.");
          }}
        />
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-ink/70">Name this piece</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Kendrick Family Reunion Anthem"
            className={selectClass}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">Occasion (optional)</span>
          <input
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            placeholder="2027 Kendrick Family Reunion"
            className={selectClass}
          />
        </label>
      </div>

      <label className="mt-4 block text-sm">
        <span className="text-ink/70">
          What it is about, and how to say the names
        </span>
        <textarea
          value={settings.words}
          onChange={(e) => set("words", e.target.value.slice(0, WORDS_MAX))}
          rows={5}
          maxLength={WORDS_MAX}
          placeholder="For Grandma Ruthie (ROO-thee), 90 years, five generations in one room. Mention the porch light and her peach cobbler."
          className={`${selectClass} resize-y`}
        />
        <span className="mt-1 block text-xs text-ink/45">
          {settings.words.length} of {WORDS_MAX} characters. Say what it is about. Notes to
          us, like "make it a banger", are dropped before the composer sees them.
        </span>
      </label>
      <button
        type="button"
        onClick={() => void help("description")}
        disabled={writing}
        className="mt-2 inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm font-medium text-blossom ring-1 ring-blossom/30 hover:bg-blossom/5 disabled:opacity-60"
      >
        {writing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Make my description stronger
      </button>

      {isPoem ? (
        <div className="mt-6">
          <label className="block text-sm">
            <span className="text-ink/70">The verse, read exactly as written</span>
            <textarea
              value={settings.poemText}
              onChange={(e) => set("poemText", e.target.value)}
              rows={6}
              className={`${selectClass} resize-y`}
            />
          </label>
          <button
            type="button"
            onClick={() => void help("poem")}
            disabled={writing}
            className="mt-2 inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm font-medium text-blossom ring-1 ring-blossom/30 hover:bg-blossom/5 disabled:opacity-60"
          >
            {writing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Write it for me
          </button>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-ink/70">Genre</span>
          <select value={settings.genre} onChange={(e) => set("genre", e.target.value)} className={selectClass}>
            {GENRES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">Mood</span>
          <select value={settings.mood} onChange={(e) => set("mood", e.target.value)} className={selectClass}>
            {MOODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">Voice</span>
          <select value={settings.voice} onChange={(e) => set("voice", e.target.value)} className={selectClass}>
            {voiceList.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        {isPoem ? (
          <label className="block text-sm">
            <span className="text-ink/70">Poem style</span>
            <select
              value={settings.poemStyle}
              onChange={(e) => set("poemStyle", e.target.value)}
              className={selectClass}
            >
              {POEM_STYLES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
        ) : null}
        {(
          [
            ["tempo", "Tempo", "Slow", "Fast"],
            ["bass", "Bass", "Light", "Heavy"],
            ["brightness", "Brightness", "Warm", "Bright"],
          ] as const
        ).map(([key, label, min, max]) => (
          <label key={key} className="block text-sm">
            <span className="text-ink/70">
              {label} <span className="text-ink/40">({min} → {max})</span>
            </span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={settings[key]}
              onChange={(e) => set(key, Number(e.target.value))}
              className="mt-3 w-full accent-blossom"
            />
          </label>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-ink/10 bg-white/70 p-4">
        <button
          type="button"
          onClick={() => setShowBrief((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">
            The brief {showBrief ? "" : `· ${coaching.score}/6`}
          </span>
          <span className="text-sm text-blossom">{showBrief ? "Hide" : "Open"}</span>
        </button>
        {showBrief ? (
          <>
            <p className="mt-2 text-xs text-ink/55">
              This is what makes a piece land. The more specific you are, the more it sounds
              like it was written for that one room.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-ink/70">Who it is for, spelled as it is said</span>
                <input
                  value={settings.honoree}
                  onChange={(e) => set("honoree", e.target.value)}
                  placeholder="Grandma Ruthie (ROO-thee)"
                  className={selectClass}
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink/70">The one moment to build around</span>
                <input
                  value={settings.keyMoment}
                  onChange={(e) => set("keyMoment", e.target.value)}
                  placeholder="She kept the porch light on for every one of us"
                  className={selectClass}
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink/70">Lines, names or in-jokes that must be in it</span>
                <textarea
                  value={settings.mustInclude}
                  onChange={(e) => set("mustInclude", e.target.value)}
                  rows={3}
                  placeholder={"One per line\nFive generations, one porch"}
                  className={`${selectClass} resize-y`}
                />
              </label>
              <div className="grid gap-4">
                {!isPoem ? (
                  <label className="block text-sm">
                    <span className="text-ink/70">A line the room can sing back</span>
                    <input
                      value={settings.refrain}
                      onChange={(e) => set("refrain", e.target.value)}
                      className={selectClass}
                    />
                  </label>
                ) : null}
                <label className="block text-sm">
                  <span className="text-ink/70">Keep out</span>
                  <input
                    value={settings.avoid}
                    onChange={(e) => set("avoid", e.target.value)}
                    placeholder="No mention of the hospital"
                    className={selectClass}
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="text-ink/70">Blend in a second style</span>
                <select
                  value={settings.genreBlend}
                  onChange={(e) => set("genreBlend", e.target.value)}
                  className={selectClass}
                >
                  <option value="">No blend</option>
                  {GENRE_FAMILIES.map((f) => (
                    <optgroup key={f.family} label={f.family}>
                      {f.genres.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-ink/70">Era</span>
                <select value={settings.era} onChange={(e) => set("era", e.target.value)} className={selectClass}>
                  {ERAS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-ink/70">Language</span>
                <select
                  value={settings.language}
                  onChange={(e) => set("language", e.target.value)}
                  className={selectClass}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </label>
              {!isPoem ? (
                <>
                  <label className="block text-sm">
                    <span className="text-ink/70">How the vocal is delivered</span>
                    <select
                      value={settings.vocalTexture}
                      onChange={(e) => set("vocalTexture", e.target.value)}
                      className={selectClass}
                    >
                      {VOCAL_TEXTURES.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="text-ink/70">Shape of the piece</span>
                    <select
                      value={settings.structure}
                      onChange={(e) => set("structure", e.target.value)}
                      className={selectClass}
                    >
                      {SONG_STRUCTURES.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
              <label className="block text-sm sm:col-span-2">
                <span className="text-ink/70">
                  How hard it should hit{" "}
                  <span className="text-ink/40">(fun → tear-jerking)</span>
                </span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={settings.emotion}
                  onChange={(e) => set("emotion", Number(e.target.value))}
                  className="mt-3 w-full accent-blossom"
                />
              </label>
              <label className="flex items-start gap-2 text-sm text-ink/70">
                <input
                  type="checkbox"
                  checked={settings.director}
                  onChange={(e) => set("director", e.target.checked)}
                  className="mt-1 h-4 w-4 accent-blossom"
                />
                <span>
                  Let the AI producer expand the brief first. Usually a better take, adds a
                  few seconds.
                </span>
              </label>
            </div>

            <fieldset className="mt-4">
              <legend className="text-sm text-ink/70">
                Instruments you want to hear{" "}
                <span className="text-ink/40">({settings.instruments.length}/8)</span>
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {INSTRUMENTS.map((i) => {
                  const on = settings.instruments.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleInstrument(i)}
                      aria-pressed={on}
                      className={`min-h-[36px] rounded-full px-3 text-xs font-medium ${
                        on ? "bg-blossom text-white" : "text-ink/70 ring-1 ring-ink/15 hover:bg-ink/5"
                      }`}
                    >
                      {i}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {coaching.tips.length ? (
              <div className="mt-4 rounded-xl bg-blossom/5 p-3">
                <p className="text-xs font-semibold text-ink/70">
                  Brief strength {coaching.score}/6. To make it better:
                </p>
                <ul className="mt-1 space-y-1 text-xs text-ink/60">
                  {coaching.tips.map((t) => (
                    <li key={t}>· {t}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 text-xs text-ink/55">
                This brief is as strong as it gets. Compose away.
              </p>
            )}
          </>
        ) : null}
      </div>

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">
          Compose
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {STUDIO_LENGTHS.map((s) => {
            const audition = s <= AUDITION_MAX_SECONDS;
            const covered = owner || audition || !!creditFor(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => void (isPoem ? compose(s) : writeWords(s))}
                disabled={busySeconds !== null || wordsBusy}
                className={`inline-flex min-h-[44px] flex-col items-center justify-center rounded-full px-5 text-sm font-medium disabled:opacity-60 ${
                  audition
                    ? "text-blossom ring-1 ring-blossom/30 hover:bg-blossom/5"
                    : covered
                      ? "bg-blossom text-white hover:opacity-90"
                      : "text-ink/70 ring-1 ring-ink/20 hover:bg-ink/5"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {busySeconds === s ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {songLengthLabel(s)}
                </span>
                {!owner ? (
                  <span className="text-[11px] font-normal opacity-80">
                    {audition ? "Free" : covered ? "Paid" : priceLabelForSeconds(s, isPoem ? "poem" : "song")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ink/50">
          {isPoem
            ? "Your verse is read exactly as written."
            : "Picking a length writes the words first, free. You read and edit them, then compose the audio."}{" "}
          Short lengths are free auditions and stay on this device. Longer ones take about{" "}
          {composeWaitLabel(240)} and are saved to your library.
        </p>
      </div>

      {words ? (
        <div className="mt-6 rounded-2xl border border-blossom/40 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blossom">
                Step one · the words
              </p>
              <p className="mt-1 font-serif text-lg text-ink">
                {songLengthLabel(words.seconds)} · nothing has been charged yet
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWords(null)}
              className="min-h-[40px] rounded-full px-4 text-sm text-ink/60 ring-1 ring-ink/15 hover:bg-ink/5"
            >
              Start over
            </button>
          </div>

          {words.missing.length ? (
            <div className="mt-4 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
              <p className="text-sm font-medium text-rose-800">
                These are not in the words yet
              </p>
              <p className="mt-1 flex flex-wrap gap-1">
                {words.missing.map((m) => (
                  <span
                    key={m}
                    className="rounded-full bg-white px-2 py-0.5 text-xs text-rose-700 ring-1 ring-rose-200"
                  >
                    {m}
                  </span>
                ))}
              </p>
              <p className="mt-2 text-xs text-rose-700/80">
                Type them in below, or rewrite at no charge.
              </p>
            </div>
          ) : words.required.length ? (
            <p className="mt-4 text-sm text-emerald-700">
              Everything you asked for is in the words: {words.required.join(", ")}.
            </p>
          ) : null}

          {words.leaks.length ? (
            <p className="mt-3 text-sm text-rose-700">
              Still mentions what you asked to leave out: {words.leaks.join(", ")}.
            </p>
          ) : null}

          {words.conflicts.length ? (
            <ul className="mt-3 space-y-1 text-xs text-amber-700">
              {words.conflicts.map((c) => (
                <li key={c}>· {c}</li>
              ))}
            </ul>
          ) : null}

          {words.split.soundDesign.length ? (
            <p className="mt-3 text-xs text-ink/55">{SOUND_DESIGN_NOTE}</p>
          ) : null}

          {words.split.discarded.length ? (
            <details className="mt-3 text-xs text-ink/55">
              <summary className="cursor-pointer">
                Left out of the song ({words.split.discarded.length})
              </summary>
              <ul className="mt-1 space-y-1">
                {words.split.discarded.map((d) => (
                  <li key={d}>· {d}</li>
                ))}
              </ul>
              <p className="mt-1">
                These read as notes to us rather than something to sing, so the composer
                never sees them.
              </p>
            </details>
          ) : null}

          <label className="mt-4 block text-sm">
            <span className="text-ink/70">
              The words, exactly as they will be performed. Edit anything.
            </span>
            <textarea
              value={draftLyrics}
              onChange={(e) => setDraftLyrics(e.target.value)}
              rows={14}
              className={`${selectClass} resize-y font-mono text-[13px] leading-relaxed`}
            />
            <span className="mt-1 block text-xs text-ink/45">
              Keep the [Section] lines. Blank lines separate sections, and each section
              keeps its own timing.
            </span>
          </label>

          {words.deviations?.length ? (
            <div className="mt-4 rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
              <p className="text-sm font-medium text-rose-800">
                The plan disagrees with your settings, so nothing has been charged.
              </p>
              <ul className="mt-2 space-y-1 text-sm text-rose-700">
                {words.deviations.map((d) => (
                  <li key={d.id}>
                    · {d.label} should be {d.chosen}. {d.detail}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-rose-700/80">
                Rewriting is free. Composing anyway may not sound like what you chose.
              </p>
            </div>
          ) : null}

          {words.settings?.length ? (
            <details className="mt-3 text-xs text-ink/55">
              <summary className="cursor-pointer">
                What each of your choices told the composer ({words.settings.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {words.settings.map((s) => (
                  <li key={`${s.label}-${s.chosen}`}>
                    <span className="font-medium text-ink/70">
                      {s.label}: {s.chosen}
                    </span>{" "}
                    {s.direction}
                    {s.verifiable ? "" : " (asserted on every section, but the plan cannot confirm it)"}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <details
            open={showPrompt}
            onToggle={(e) => setShowPrompt((e.currentTarget as HTMLDetailsElement).open)}
            className="mt-3 text-xs text-ink/55"
          >
            <summary className="cursor-pointer">The direction we sent the composer</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-ink/5 p-3">
              {words.prompt}
            </pre>
          </details>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void approveAndCompose()}
              disabled={busySeconds !== null || wordsBusy || Boolean(words.deviations?.length)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-blossom px-5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {busySeconds !== null ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Approve and compose {songLengthLabel(words.seconds)}
              {!owner && words.seconds > AUDITION_MAX_SECONDS && !creditFor(words.seconds)
                ? ` · ${priceLabelForSeconds(words.seconds, isPoem ? "poem" : "song")}`
                : ""}
            </button>
            <button
              type="button"
              onClick={() => void writeWords(words.seconds)}
              disabled={wordsBusy || busySeconds !== null}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-sm font-medium text-blossom ring-1 ring-blossom/30 hover:bg-blossom/5 disabled:opacity-60"
            >
              {wordsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Rewrite the words, no charge
            </button>
            {words.deviations?.length ? (
              <button
                type="button"
                onClick={() => void approveAndCompose(true)}
                disabled={busySeconds !== null || wordsBusy}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-sm font-medium text-ink/60 ring-1 ring-ink/15 hover:bg-ink/5 disabled:opacity-60"
              >
                Compose anyway
              </button>
            ) : null}
          </div>

        </div>
      ) : null}

      {buySeconds !== null && !owner ? (
        <div className="mt-6 rounded-2xl border border-blossom/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink/75">
              {songLengthLabel(buySeconds)} piece · {priceLabelForSeconds(buySeconds, isPoem ? "poem" : "song")} one off
            </p>
            <button
              type="button"
              onClick={() => setBuySeconds(null)}
              className="min-h-[40px] rounded-full px-4 text-sm text-ink/60 ring-1 ring-ink/15 hover:bg-ink/5"
            >
              Not now
            </button>
          </div>
          <div className="mt-3 rounded-xl bg-ink/[0.03] p-4">
            <RefundTerms
              copy={refundCopy}
              acknowledged={refundOk}
              onAcknowledge={setRefundOk}
            />
          </div>
          {refundOk ? (
            <div className="mt-3">
              <EmbeddedCheckoutProvider
                stripe={getStripe()}
                options={{
                  fetchClientSecret: async () => {
                    const res = (await startPiecePurchase({
                      data: {
                        seconds: buySeconds,
                        kind: isPoem ? "poem" : "song",
                        title: title.trim() || null,
                        returnUrl: `${window.location.origin}/music?music_session={CHECKOUT_SESSION_ID}`,
                        environment: getStripeEnvironment(),
                      },
                    } as never)) as { clientSecret: string } | { error: string };
                    if ("error" in res) throw new Error(res.error);
                    return res.clientSecret;
                  },
                }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          ) : (
            <p className="mt-3 text-xs text-ink/45">
              Tick the box above to continue to payment.
            </p>
          )}
        </div>
      ) : null}

      {take ? (
        <div className="mt-8 rounded-2xl border border-blossom/30 bg-blossom/5 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blossom">
            Just composed
          </p>
          <p className="mt-1 font-serif text-lg text-ink">
            {take.title} · {songLengthLabel(take.seconds)}
          </p>
          {take.url ? <audio src={take.url} controls className="mt-3 w-full" /> : null}
          {take.missing?.length ? (
            <div className="mt-3 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
              <p className="text-sm text-rose-800">
                These were missing from the words: {take.missing.join(", ")}.
              </p>
              {take.pieceId ? (
                <button
                  type="button"
                  onClick={() => void reportMiss(take.pieceId!)}
                  className="mt-2 inline-flex min-h-[40px] items-center rounded-full px-4 text-sm font-medium text-rose-700 ring-1 ring-rose-300 hover:bg-white"
                >
                  This missed what I asked for
                </button>
              ) : null}
            </div>
          ) : null}
          {take.url ? (
            <button
              type="button"
              onClick={() => download(take.url, take.title)}
              className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-paper hover:opacity-90"
            >
              <Download className="h-4 w-4" /> Download MP3
            </button>
          ) : null}
        </div>
      ) : null}
        </>
      )}


      <PieceLibrary
        pieces={library.data?.pieces ?? []}
        owner={owner}
        showDemo={showDemo}
        onShowDemoChange={setShowDemo}
        playlists={playlists.data?.playlists ?? []}

        onPlaylistsChanged={() => void playlists.refetch()}
        onChanged={() => void library.refetch()}
        onDownload={download}
        onRemix={(p) => {
          const saved = (p.settings ?? {}) as Record<string, unknown>;
          const thin = Object.keys(saved).length < 10;
          loadBrief(p.settings ?? null);
          setTitle(p.title);
          setRemixOf({ id: p.id, title: p.title });
          formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          if (thin) {
            toast.message(`Fresh take of "${p.title}"`, {
              description:
                "This piece was made on the photo wall, so only a little of its brief was kept. The form is filled in as far as it goes, and the rest is back at the defaults for you to set.",
            });
          } else {
            toast.success(`Fresh take of "${p.title}" loaded into the form`, {
              description: "Change anything you like, then compose. The original stays in your library.",
            });
          }
        }}
      />

      <SoundPlaylistsPanel
        playlists={playlists.data?.playlists ?? []}
        onChanged={() => void playlists.refetch()}
      />

      {shelf.length ? (
        <div className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">
            Your audition shelf ({shelf.length})
          </p>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            Auditions are temporary. They are held in this browser on this device only, they are
            never backed up, and they disappear if you clear your browsing data, switch devices, or
            the browser runs short of room. To keep one, use “Make this a full piece”, which saves
            it to your library.
          </p>
          <ul className="mt-3 space-y-3">
            {shelf.map((s) => {
              const playable = samplePlayable(s);
              const fullLength = s.seconds > AUDITION_MAX_SECONDS ? s.seconds : 60;
              return (
                <li key={s.id} className="rounded-2xl border border-ink/10 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink">
                        {s.title || "Untitled"}{" "}
                        <span className="text-ink/50">· {songLengthLabel(s.seconds)}</span>
                      </p>
                      <p className="text-xs text-ink/50">{sampleAgeLabel(s.createdAt)}</p>
                      {!playable ? (
                        <p className="mt-1 text-xs text-amber-700">
                          The audio for this one is no longer on this device, so it cannot be played
                          or downloaded. Your settings and words are still here, so you can compose
                          it again.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {playable ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setTake({
                                id: s.id,
                                url: blobUrl(s.audio),
                                seconds: s.seconds,
                                title: s.title || "Untitled",
                                prompt: s.prompt,
                              })
                            }
                            className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-blossom ring-1 ring-blossom/30 hover:bg-blossom/5"
                          >
                            <Play className="h-4 w-4" /> Play
                          </button>
                          <button
                            type="button"
                            onClick={() => download(blobUrl(s.audio), s.title || "kenroe-sound")}
                            className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-ink/70 ring-1 ring-ink/15 hover:bg-ink/5"
                          >
                            <Download className="h-4 w-4" /> Download
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          loadBrief(s.settings as Record<string, unknown>);
                          toast.success("Settings loaded");
                        }}
                        className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-ink/70 ring-1 ring-ink/15 hover:bg-ink/5"
                      >
                        Load settings
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          loadBrief(s.settings as Record<string, unknown>);
                          setTitle(s.title || "");
                          void compose(fullLength);
                        }}
                        className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-blossom px-4 text-sm font-medium text-white hover:opacity-90"
                      >
                        <Sparkles className="h-4 w-4" />
                        {playable ? "Make this a full piece" : "Compose again from these settings"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await removeSample(s.id);
                          setShelf(await listSamples(STUDIO_SHELF_KEY));
                        }}
                        className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-ink/50 ring-1 ring-ink/10 hover:bg-ink/5"
                        aria-label={`Remove ${s.title || "sample"}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

      ) : null}
    </section>
  );
}

/** Kept pieces: play, rename, share by link, download, remove. */
function PieceLibrary({
  pieces,
  owner,
  showDemo,
  onShowDemoChange,
  playlists,
  onPlaylistsChanged,
  onChanged,
  onDownload,
  onRemix,
}: {
  pieces: SavedPiece[];
  owner: boolean;
  showDemo: boolean;
  onShowDemoChange: (next: boolean) => void;
  playlists: Parameters<typeof SoundPlaylistsPanel>[0]["playlists"];
  onPlaylistsChanged: () => void;
  onChanged: () => void;
  onDownload: (url: string, name: string) => void;
  onRemix: (piece: SavedPiece) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (!pieces.length && !showDemo) return null;

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center gap-3">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">
          <Library className="h-3.5 w-3.5" aria-hidden /> Your library ({pieces.length})
        </p>
        <button
          type="button"
          onClick={() => onShowDemoChange(!showDemo)}
          className="rounded-full px-3 py-1 text-xs text-ink/60 ring-1 ring-ink/15 hover:bg-ink/5"
        >
          {showDemo ? "Hide test pieces" : "Show test pieces"}
        </button>
      </div>
      {showDemo ? (
        <p className="mt-2 text-xs text-ink/55">
          Test pieces are included below and marked. They stay out of your library and out of every
          report and count.
        </p>
      ) : null}
      {!pieces.length ? (
        <p className="mt-3 text-sm text-ink/60">Nothing here yet.</p>
      ) : null}
      <ul className="mt-3 space-y-3">
        {pieces.map((p) => (
          <li key={p.id} className="rounded-2xl border border-ink/10 bg-white p-4">
            {renaming === p.id ? (
              <div className="flex flex-wrap gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="min-h-[40px] flex-1 rounded-xl border border-ink/15 px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await renamePiece({ data: { id: p.id, title: draft.trim() } } as never);
                      setRenaming(null);
                      onChanged();
                      toast.success("Renamed");
                    } catch {
                      toast.error("Couldn't rename that piece.");
                    }
                  }}
                  className="min-h-[40px] rounded-full bg-blossom px-4 text-sm font-medium text-white"
                >
                  Save name
                </button>
                <button
                  type="button"
                  onClick={() => setRenaming(null)}
                  className="min-h-[40px] rounded-full px-4 text-sm text-ink/60 ring-1 ring-ink/15"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <p className="font-medium text-ink">
                {p.title}{" "}
                <span className="text-ink/50">
                  · {songLengthLabel(p.seconds)} · {p.kind === "poem" ? "Spoken word" : "Song"}
                </span>
                {p.isDemo ? (
                  <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/60">
                    Test piece
                  </span>
                ) : null}
              </p>
            )}
            {p.sources?.length ? (
              <p className="mt-1 text-xs text-ink/55">
                Combined from{" "}
                {p.sources
                  .map((s) =>
                    s.labels.length
                      ? `${s.labels.join(" and ").toLowerCase()} from "${s.title}"`
                      : `"${s.title}"`,
                  )
                  .join(", ")}
                .
              </p>
            ) : null}
            {p.url ? <audio src={p.url} controls preload="none" className="mt-3 w-full" /> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {p.url ? (
                <button
                  type="button"
                  onClick={() => onDownload(p.url!, p.title)}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-ink/70 ring-1 ring-ink/15 hover:bg-ink/5"
                >
                  <Download className="h-4 w-4" /> Download
                </button>
              ) : null}
              <button
                type="button"
                onClick={async () => {
                  const link = pieceShareUrl(window.location.origin, p.shareKey || p.shareToken);
                  try {
                    await navigator.clipboard.writeText(link);
                    toast.success("Listen link copied");
                  } catch {
                    toast.error("Couldn't copy that link.");
                  }
                }}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-blossom ring-1 ring-blossom/30 hover:bg-blossom/5"
              >
                Copy listen link
              </button>
              <button
                type="button"
                onClick={() => onRemix(p)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-blossom ring-1 ring-blossom/30 hover:bg-blossom/5"
              >
                <Wand2 className="h-4 w-4" /> Fresh take
              </button>
              <SoundLengthPanel
                pieceId={p.id}
                title={p.title}
                seconds={p.seconds}
                owner={owner}
                onChanged={onChanged}
              />
              <StudioUseOnEvent pieceId={p.id} title={p.title} url={p.url} />
              <AddToPlaylistMenu
                pieceId={p.id}
                playlists={playlists}
                onChanged={onPlaylistsChanged}
              />
              <button
                type="button"
                onClick={() => {
                  setRenaming(p.id);
                  setDraft(p.title);
                }}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-ink/70 ring-1 ring-ink/15 hover:bg-ink/5"
              >
                Rename
              </button>
              {owner ? (
              <button
                type="button"
                onClick={async () => {
                  const reason = window.prompt(
                    `Take down "${p.title}"? It stops playing and the listen link stops working. The record is kept with your reason.\n\nReason (required):`,
                    "",
                  );
                  if (reason === null) return;
                  if (reason.trim().length < 3) {
                    toast.error("A reason is required.");
                    return;
                  }
                  try {
                    await takedownPiece({ data: { id: p.id, reason: reason.trim() } } as never);
                    onChanged();
                    toast.success("Taken down. The listen link no longer works.");
                  } catch (e) {
                    toast.error(toUserMessage(e, "Couldn't take that piece down."));
                  }
                }}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
              >
                <ShieldAlert className="h-4 w-4" /> Take down
              </button>
              ) : null}
              <button
                type="button"
                onClick={async () => {
                  try {
                    await setPieceDemo({
                      data: { id: p.id, isDemo: !p.isDemo },
                    } as never);
                    onChanged();
                    toast.success(
                      p.isDemo
                        ? `"${p.title}" is back in your library.`
                        : `"${p.title}" moved to demo. It stays out of your library and every count.`,
                    );
                  } catch (e) {
                    toast.error(toUserMessage(e, "Couldn't move that piece."));
                  }
                }}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-ink/60 ring-1 ring-ink/15 hover:bg-ink/5"
              >
                {p.isDemo ? "Move back to my library" : "Move to demo"}
              </button>
              <button

                type="button"
                onClick={async () => {
                  if (!window.confirm(`Remove "${p.title}"? This cannot be undone.`)) return;
                  try {
                    await deletePiece({ data: { id: p.id } } as never);
                    onChanged();
                    toast.success("Piece removed");
                  } catch {
                    toast.error("Couldn't remove that piece.");
                  }
                }}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-ink/50 ring-1 ring-ink/10 hover:bg-ink/5"
                aria-label={`Remove ${p.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {p.licence ? <p className="mt-2 text-xs text-ink/45">{p.licence}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ask Christopher to hand craft a piece. Quoted by email, no instant checkout. */
function ConciergePanel({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState(email);
  const [occasion, setOccasion] = useState("");
  const [brief, setBrief] = useState("");
  const [budget, setBudget] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const field = "mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink";

  if (sent) {
    return (
      <section className="mt-10 rounded-3xl border border-blossom/25 bg-blossom/5 p-6">
        <h2 className="font-serif text-2xl text-ink">Request received</h2>
        <p className="mt-1 text-sm text-ink/70">
          Christopher will reply to {contact} with a quote and next steps.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-10 rounded-3xl border border-ink/10 bg-white/70 p-6">
      <h2 className="font-serif text-2xl text-ink">Have it hand crafted</h2>
      <p className="mt-1 text-sm text-ink/70">
        Real instruments, revisions, and a human ear on every line. From{" "}
        {money(CONCIERGE_FROM_CENTS)}, quoted by email once we know the occasion.
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 min-h-[44px] rounded-full bg-ink px-6 text-sm font-medium text-paper hover:opacity-90"
        >
          Request a quote
        </button>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-ink/70">Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label className="block text-sm">
            <span className="text-ink/70">Email for the quote</span>
            <input value={contact} onChange={(e) => setContact(e.target.value)} className={field} />
          </label>
          <label className="block text-sm">
            <span className="text-ink/70">Occasion</span>
            <input value={occasion} onChange={(e) => setOccasion(e.target.value)} className={field} />
          </label>
          <label className="block text-sm">
            <span className="text-ink/70">Budget (optional)</span>
            <input value={budget} onChange={(e) => setBudget(e.target.value)} className={field} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-ink/70">What you have in mind</span>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              className={`${field} resize-y`}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="button"
              disabled={sending}
              onClick={async () => {
                setSending(true);
                try {
                  await requestConcierge({
                    data: {
                      contactName: name.trim(),
                      contactEmail: contact.trim(),
                      occasion: occasion.trim(),
                      brief: brief.trim(),
                      budget: budget.trim(),
                    },
                  } as never);
                  setSent(true);
                } catch (e) {
                  toast.error(
                    toUserMessage(e, "Couldn't send that request."),
                  );
                } finally {
                  setSending(false);
                }
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-blossom px-6 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send request
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
