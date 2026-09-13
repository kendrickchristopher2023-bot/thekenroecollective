import { useEffect, useMemo, useRef, useState } from "react";
import type { RevealPayload } from "@/lib/ecards.schemas";
import { getEcardTheme } from "@/lib/ecard-themes";
import { MONTAGE_MOODS, useMontageMusic } from "@/components/ecard-delight";
import { resolveMedia } from "@/components/ecard-media";

export type MontageCuration = {
  intro: string;
  outro: string;
  order: string[];
};

type Item = RevealPayload["contributions"][number];

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

type Slide =
  | { kind: "intro"; id: string; text: string }
  | { kind: "outro"; id: string; text: string }
  | { kind: "message"; id: string; item: Item };

const MESSAGE_MS = 6200;
const MEDIA_MS = 8200;
const CARD_MS = 4600;

/**
 * Cinematic in-app montage. Auto-plays through the messages with cross-fades,
 * a gentle Ken Burns drift on photos, inline video, and AI written intro and
 * closing cards. Playback only, there is no video file rendered or exported.
 */
export function EcardMontage({
  reveal,
  curation,
  onExit,
}: {
  reveal: RevealPayload;
  curation: MontageCuration | null;
  onExit?: () => void;
}) {
  const theme = getEcardTheme(reveal.theme);
  const reduced = usePrefersReducedMotion();
  const music = useMontageMusic();

  const slides = useMemo<Slide[]>(() => {
    const items = reveal.contributions;
    const byId = new Map(items.map((i) => [i.id, i]));
    const ordered: Item[] = [];
    for (const id of curation?.order ?? []) {
      const found = byId.get(id);
      if (found) {
        ordered.push(found);
        byId.delete(id);
      }
    }
    for (const left of items) if (byId.has(left.id)) ordered.push(left);

    const intro =
      curation?.intro?.trim() ||
      `A card for ${reveal.recipient_name}, from everyone who wanted to say something.`;
    const outro = curation?.outro?.trim() || `With love, from all of us.`;

    return [
      { kind: "intro", id: "__intro", text: intro } as Slide,
      ...ordered.map((item) => ({ kind: "message", id: item.id, item }) as Slide),
      { kind: "outro", id: "__outro", text: outro } as Slide,
    ];
  }, [reveal, curation]);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [audioMs, setAudioMs] = useState<number | null>(null);
  const startedAt = useRef<number>(Date.now());

  const slide = slides[Math.min(index, slides.length - 1)]!;
  const isVoiceNote = slide.kind === "message" && Boolean(resolveMedia(slide.item).audio);
  const duration =
    slide.kind !== "message"
      ? CARD_MS
      : !resolveMedia(slide.item).any
        ? MESSAGE_MS
        : isVoiceNote
          ? (audioMs ?? MEDIA_MS)
          : MEDIA_MS;

  const goNext = () => {
    setProgress(0);
    setIndex((i) => (i + 1 >= slides.length ? i : i + 1));
  };
  const goPrev = () => {
    setProgress(0);
    setIndex((i) => Math.max(0, i - 1));
  };

  const atEnd = index >= slides.length - 1;

  useEffect(() => {
    startedAt.current = Date.now();
    setProgress(0);
    setAudioMs(null);
  }, [index]);


  useEffect(() => {
    if (!playing || atEnd) return;
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      const pct = Math.min(1, elapsed / duration);
      setProgress(pct);
      if (pct >= 1) {
        startedAt.current = Date.now();
        setIndex((i) => (i + 1 >= slides.length ? i : i + 1));
      }
    }, 100);
    return () => window.clearInterval(tick);
  }, [playing, atEnd, duration, slides.length]);

  useEffect(() => {
    if (atEnd) setPlaying(false);
  }, [atEnd]);

  const surface = { background: theme.surface, color: theme.ink } as const;

  return (
    <div className="w-full">
      <div
        className={`relative overflow-hidden rounded-3xl p-6 shadow-sm sm:p-10 ${
          reduced ? "ecard-fade" : "ecard-crossfade"
        }`}
        key={slide.id}
        style={surface}
        aria-live="polite"
      >
        {slide.kind === "message" ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wider" style={{ opacity: 0.55 }}>
              {slide.item.contributor_name}
            </p>
            {slide.item.message && (
              <p
                className="mt-3 whitespace-pre-wrap text-lg leading-relaxed sm:text-xl"
                style={{ fontFamily: theme.display }}
              >
                {slide.item.message}
              </p>
            )}
            {(() => {
              const m = resolveMedia(slide.item);
              if (!m.any) return null;
              return (
                <div className="mt-4 space-y-4">
                  {m.audio && (
                    <div>
                      <p className="text-sm font-medium" style={{ opacity: 0.7 }}>
                        Voice note
                      </p>
                      <audio
                        key={`${slide.id}-audio`}
                        src={m.audio}
                        autoPlay={playing}
                        controls
                        preload="metadata"
                        aria-label={`Voice note from ${slide.item.contributor_name}`}
                        className="mt-2 w-full"
                        onLoadedMetadata={(e) => {
                          const secs = e.currentTarget.duration;
                          if (Number.isFinite(secs) && secs > 0) setAudioMs(secs * 1000 + 1200);
                        }}
                      />
                    </div>
                  )}
                  {m.video && (
                    <video
                      src={m.video}
                      autoPlay={playing}
                      controls
                      playsInline
                      className="max-h-80 w-full rounded-2xl bg-black object-contain"
                    />
                  )}
                  {m.image && (
                    <div className="overflow-hidden rounded-2xl">
                      <img
                        src={m.image}
                        alt={`Photo from ${slide.item.contributor_name}`}
                        className={`max-h-80 w-full object-cover ${reduced ? "" : "ecard-kenburns"}`}
                      />
                    </div>
                  )}
                  {m.gif && (
                    <div className="overflow-hidden rounded-2xl">
                      <img
                        src={m.gif}
                        alt={`GIF from ${slide.item.contributor_name}`}
                        className="max-h-80 w-full object-cover"
                      />
                    </div>
                  )}
                </div>
              );
            })()}

          </>
        ) : (
          <div className="py-6 text-center">
            <p className="text-4xl" aria-hidden>
              {theme.motif}
            </p>
            <p
              className="mx-auto mt-4 max-w-xl text-xl leading-relaxed sm:text-2xl"
              style={{ fontFamily: theme.display }}
            >
              {slide.text}
            </p>
            {slide.kind === "outro" && (
              <p className="mt-4 text-xs uppercase tracking-wider" style={{ opacity: 0.55 }}>
                Group eCards by The Kenroe Collective
              </p>
            )}
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="mt-5" style={{ color: theme.ink }}>
        <div
          className="h-2 w-full overflow-hidden rounded-full"
          style={{ background: `${theme.ink}22` }}
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={slides.length}
          aria-valuenow={index + 1}
          aria-label="Montage progress"
        >
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{
              width: `${((index + (atEnd ? 1 : progress)) / slides.length) * 100}%`,
              background: theme.accent,
            }}
          />
        </div>
        <p className="mt-2 text-sm" style={{ opacity: 0.7 }}>
          Card {Math.min(index + 1, slides.length)} of {slides.length}
        </p>
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-3" style={{ color: theme.ink }}>
        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0}
          className="inline-flex min-h-12 min-w-[7rem] items-center justify-center rounded-full border px-5 text-base font-medium disabled:opacity-40"
          style={{ borderColor: `${theme.ink}33` }}
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => {
            if (atEnd) {
              setIndex(0);
              setPlaying(true);
              return;
            }
            setPlaying((p) => !p);
            startedAt.current = Date.now() - progress * duration;
          }}
          className="inline-flex min-h-12 min-w-[9rem] items-center justify-center rounded-full px-6 text-base font-semibold"
          style={{ background: theme.accent, color: theme.accentInk }}
        >
          {atEnd ? "Play again" : playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={atEnd}
          className="inline-flex min-h-12 min-w-[7rem] items-center justify-center rounded-full border px-5 text-base font-medium disabled:opacity-40"
          style={{ borderColor: `${theme.ink}33` }}
        >
          Next
        </button>
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="inline-flex min-h-12 items-center justify-center rounded-full border px-5 text-base font-medium"
            style={{ borderColor: `${theme.ink}33` }}
          >
            Read them one by one
          </button>
        )}
      </div>

      {/* Music */}
      <div
        className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border p-3"
        style={{ borderColor: `${theme.ink}22`, color: theme.ink }}
      >
        <button
          type="button"
          onClick={music.toggle}
          aria-pressed={music.playing}
          className="inline-flex min-h-12 items-center justify-center rounded-full border px-5 text-base font-medium"
          style={{ borderColor: `${theme.ink}33` }}
        >
          {music.playing ? "Turn music off" : "Turn music on"}
        </button>
        <span className="text-sm" style={{ opacity: 0.7 }}>
          Music is off until you turn it on.
        </span>
        <div className="flex flex-wrap gap-2">
          {MONTAGE_MOODS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => music.setMood(m.id)}
              aria-pressed={music.mood === m.id}
              className="inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium"
              style={
                music.mood === m.id
                  ? { background: theme.accent, color: theme.accentInk, borderColor: theme.accent }
                  : { borderColor: `${theme.ink}33` }
              }
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="inline-flex min-h-11 cursor-not-allowed items-center rounded-full border px-4 text-sm font-medium opacity-45"
          style={{ borderColor: `${theme.ink}33` }}
        >
          Download as video (coming soon)
        </button>
      </div>
    </div>
  );
}
