/**
 * "Play this invitation" — the one control a guest actually touches.
 *
 * The invitation itself is readable the moment the page loads; nothing here
 * gates it. This is an offer, and it is built for the guest who needs it most:
 * a thumb-sized target, words on every button, captions at reading size, and
 * an instant stop.
 *
 * The order never changes: the host's own voice note, then the invitation read
 * aloud, then the music. Each part names itself on screen as it starts.
 *
 * A streaming playlist cannot be started programmatically (the service's own
 * embedded player owns that), so it is offered as something to press rather
 * than promised as something that will play.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getInvitePerformance, type InvitePerformance } from "@/lib/invite-narration.functions";
import {
  narrationChoice,
  narrationLengthLabel,
  setNarrationChoice,
  type NarrationChoice,
} from "@/lib/invite-narration";
import {
  pauseAudio,
  playTrack,
  resumeAudio,
  stopAudio,
  useInviteAudio,
} from "@/lib/invite-audio";

/** Every id this panel owns is prefixed, so it can tell its own audio apart. */
const OWN = "perf:";

type StepKind = "voice" | "narration" | "music";

interface Step {
  kind: StepKind;
  label: string;
  url: string;
  /** Best estimate until the browser reports the real thing. */
  seconds: number;
}

function firstName(name: string | null | undefined): string {
  const n = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  return n.length > 1 ? n : "";
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Captions advance in proportion to the words, so they track the voice. */
function captionIndex(paragraphs: string[], fraction: number): number {
  if (paragraphs.length === 0) return -1;
  const counts = paragraphs.map((p) => p.split(/\s+/).filter(Boolean).length || 1);
  const total = counts.reduce((a, b) => a + b, 0);
  let seen = 0;
  for (let i = 0; i < counts.length; i++) {
    seen += counts[i]!;
    if (fraction <= seen / total) return i;
  }
  return paragraphs.length - 1;
}

export function InvitePerformanceControl({
  eventId,
  hostName,
  accent,
  onStart,
}: {
  eventId: string;
  hostName?: string | null;
  accent?: string | null;
  /** Fired once each time a guest presses play from the beginning. */
  onStart?: () => void;
}) {
  const load = useServerFn(getInvitePerformance);
  const { data } = useQuery({
    queryKey: ["invite-performance", eventId],
    queryFn: async () => (await load({ data: { eventId } })) as InvitePerformance,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const [choice, setChoice] = useState<NarrationChoice>("unset");
  useEffect(() => setChoice(narrationChoice()), []);

  // The panel holds no audio of its own. It asks the page's one controller and
  // reads the answer back, which is what makes Stop anywhere mean stop here.
  const audio = useInviteAudio();
  const [stepIndex, setStepIndex] = useState(-1); // -1 = not started
  const [durations, setDurations] = useState<Record<number, number>>({});
  const mine = stepIndex >= 0 && audio.trackId === `${OWN}${stepIndex}`;
  const playing = mine && audio.playing;
  const elapsedInStep = mine ? audio.position : 0;

  const steps = useMemo<Step[]>(() => {
    if (!data) return [];
    const out: Step[] = [];
    if (data.voiceNoteUrl) {
      const who = firstName(hostName);
      out.push({
        kind: "voice",
        label: who ? `A note from ${who}` : "A note from your host",
        url: data.voiceNoteUrl,
        seconds: 25,
      });
    }
    if (data.narration.url) {
      out.push({
        kind: "narration",
        label: "Your invitation",
        url: data.narration.url,
        seconds: data.narration.seconds || 45,
      });
    }
    const m = data.music;
    if (m) {
      const named = m.title?.trim();
      out.push({
        kind: "music",
        label: named
          ? `${named}`
          : m.kind === "song"
            ? "Music for this invitation"
            : m.kind === "letter"
              ? "A letter, read aloud"
              : "A poem, read aloud",
        url: m.url,
        seconds: 60,
      });
    }
    return out;
  }, [data, hostName]);

  const playlist = data?.playlist ?? null;

  const paragraphs = data?.narration.paragraphs ?? [];

  const stepSeconds = useCallback(
    (i: number) => durations[i] ?? steps[i]?.seconds ?? 0,
    [durations, steps],
  );
  const totalSeconds = useMemo(
    () => steps.reduce((sum, _s, i) => sum + stepSeconds(i), 0),
    [steps, stepSeconds],
  );
  const elapsedTotal = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < Math.max(0, stepIndex); i++) sum += stepSeconds(i);
    return sum + elapsedInStep;
  }, [stepIndex, elapsedInStep, stepSeconds]);

  const current = stepIndex >= 0 ? steps[stepIndex] : undefined;

  // Load the real length of each part up front, so the button can promise a
  // duration rather than a guess.
  useEffect(() => {
    if (steps.length === 0) return;
    let live = true;
    steps.forEach((s, i) => {
      const probe = new Audio();
      probe.preload = "metadata";
      probe.src = s.url;
      probe.addEventListener("loadedmetadata", () => {
        if (!live || !Number.isFinite(probe.duration)) return;
        setDurations((d) => ({ ...d, [i]: probe.duration }));
      });
    });
    return () => {
      live = false;
    };
  }, [steps]);

  // The sequence advances from the controller's "ended", one part at a time.
  // Nothing is scheduled ahead, so two parts can never overlap.
  const stepsRef = useRef<Step[]>(steps);
  stepsRef.current = steps;

  const playStep = useCallback((i: number) => {
    const s = stepsRef.current[i];
    if (!s) {
      stopAudio();
      setStepIndex(-1);
      return;
    }
    setStepIndex(i);
    playTrack(
      { id: `${OWN}${i}`, url: s.url, label: s.label },
      {
        onEnded: () => {
          if (i + 1 < stepsRef.current.length) playStep(i + 1);
          else {
            stopAudio();
            setStepIndex(-1);
          }
        },
      },
    );
  }, []);

  const start = () => {
    setNarrationChoice("yes");
    setChoice("yes");
    if (steps.length > 0) {
      onStart?.();
      playStep(0);
    }
  };

  const stop = () => {
    stopAudio();
    setStepIndex(-1);
  };

  const pauseOrResume = () => {
    if (playing) pauseAudio();
    else if (mine) resumeAudio();
    else if (stepIndex >= 0) playStep(stepIndex);
  };

  const next = () => {
    if (stepIndex + 1 < steps.length) playStep(stepIndex + 1);
    else stop();
  };

  // A guest who starts the song card, or anything else, has left the guided
  // sequence. Follow them out rather than pretending we are still running.
  useEffect(() => {
    if (stepIndex < 0) return;
    if (audio.trackId && !audio.trackId.startsWith(OWN)) setStepIndex(-1);
  }, [audio.trackId, stepIndex]);

  // The real length of the part now playing, straight from the controller.
  useEffect(() => {
    if (!mine || !audio.duration) return;
    setDurations((prev) =>
      prev[stepIndex] === audio.duration ? prev : { ...prev, [stepIndex]: audio.duration },
    );
  }, [mine, audio.duration, stepIndex]);


  // Nothing to perform: no button at all, rather than an empty promise.
  if (!data?.available || steps.length === 0) return null;

  const ink = accent || "#5c1d1d";
  const captionAt =
    current?.kind === "narration" && paragraphs.length > 0
      ? captionIndex(paragraphs, stepSeconds(stepIndex) ? elapsedInStep / stepSeconds(stepIndex) : 0)
      : -1;

  // They already said they would rather read it. One quiet way back in, and we
  // never ask again.
  if (choice === "no" && stepIndex < 0) {
    return (
      <section className="mx-auto max-w-3xl px-6 pt-4 print:hidden">
        <button
          type="button"
          onClick={start}
          className="min-h-11 rounded-full px-4 text-base font-medium underline underline-offset-4"
          style={{ color: ink }}
        >
          Have this invitation read to me
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label="Listen to this invitation"
      className="mx-auto max-w-3xl px-4 pt-4 print:hidden sm:px-6"
    >
      <div className="rounded-3xl border-2 bg-white p-5 shadow-lg" style={{ borderColor: ink }}>

        {stepIndex < 0 ? (
          <>
            <h2 className="text-2xl font-bold leading-tight text-ink sm:text-3xl">
              Play this invitation
            </h2>
            <p className="mt-2 text-base leading-relaxed text-ink/80">
              We'll play the voice note, read the invitation aloud, then the music.
              About {narrationLengthLabel(totalSeconds)} in total.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={start}
                className="min-h-14 flex-1 rounded-2xl px-6 text-lg font-bold text-white shadow-md"
                style={{ backgroundColor: ink }}
              >
                ▶ Play this invitation
              </button>
              <button
                type="button"
                onClick={() => {
                  setNarrationChoice("no");
                  setChoice("no");
                }}
                className="min-h-14 flex-1 rounded-2xl border-2 px-6 text-lg font-semibold text-ink"
                style={{ borderColor: `${ink}55` }}
              >
                I'll read it myself
              </button>
            </div>
            <ol className="mt-4 space-y-1 text-sm text-ink/70">
              {steps.map((s, i) => (
                <li key={s.kind}>
                  {i + 1}. {s.label} ({narrationLengthLabel(stepSeconds(i))})
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/60">
              Now playing {stepIndex + 1} of {steps.length}
            </p>
            <h2 className="mt-1 text-2xl font-bold leading-tight text-ink" aria-live="polite">
              {current?.label}
            </h2>

            <div
              className="mt-3 h-3 w-full overflow-hidden rounded-full bg-ink/10"
              role="progressbar"
              aria-label="Playback progress"
              aria-valuemin={0}
              aria-valuemax={Math.round(totalSeconds)}
              aria-valuenow={Math.round(elapsedTotal)}
            >
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  backgroundColor: ink,
                  width: `${totalSeconds ? Math.min(100, (elapsedTotal / totalSeconds) * 100) : 0}%`,
                }}
              />
            </div>
            <p className="mt-1 text-sm text-ink/70">
              {clock(elapsedTotal)} of {clock(totalSeconds)}
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={pauseOrResume}
                className="min-h-14 flex-1 rounded-2xl px-5 text-lg font-bold text-white shadow-md"
                style={{ backgroundColor: ink }}
              >
                {playing ? "❚❚ Pause" : "▶ Continue"}
              </button>
              <button
                type="button"
                onClick={stop}
                className="min-h-14 flex-1 rounded-2xl border-2 px-5 text-lg font-semibold text-ink"
                style={{ borderColor: `${ink}55` }}
              >
                ■ Stop
              </button>
              {stepIndex + 1 < steps.length ? (
                <button
                  type="button"
                  onClick={next}
                  className="min-h-14 flex-1 rounded-2xl border-2 px-5 text-lg font-semibold text-ink"
                  style={{ borderColor: `${ink}55` }}
                >
                  Skip to {steps[stepIndex + 1]?.label}
                </button>
              ) : null}
            </div>

            {captionAt >= 0 ? (
              <div className="mt-4 rounded-2xl bg-ink/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/60">
                  Captions
                </p>
                <p className="mt-2 text-lg leading-relaxed text-ink" aria-live="polite">
                  {paragraphs[captionAt]}
                </p>
              </div>
            ) : null}
          </>
        )}

        {playlist ? (
          <a
            href={playlist.url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl border-2 px-5 text-center text-base font-semibold text-ink"
            style={{ borderColor: `${ink}55` }}
          >
            ♪ Open the playlist{playlist.title ? `: ${playlist.title}` : ""}
          </a>
        ) : null}
      </div>
    </section>
  );
}
