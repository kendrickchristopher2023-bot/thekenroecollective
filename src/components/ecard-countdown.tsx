import { useEffect, useState } from "react";

/**
 * Live countdown to an eCard reveal date, color coded by how long is left:
 * 90+ days uses the Projects accent (cyprus), 31 to 89 days uses gold,
 * 30 days or less uses the Events accent (velvet). Color is never the only
 * signal: every variant also carries a text label.
 */

export type CountdownTone = "cyprus" | "gold" | "velvet";

export type CountdownState = {
  done: boolean;
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  tone: CountdownTone;
};

export function revealCountdownState(targetMs: number, nowMs: number): CountdownState {
  const totalMs = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tone: CountdownTone = days >= 90 ? "cyprus" : days >= 31 ? "gold" : "velvet";
  return { done: totalMs <= 0, totalMs, days, hours, minutes, seconds, tone };
}

export function useRevealCountdown(revealDate: string | null | undefined): CountdownState | null {
  const targetMs = revealDate ? new Date(revealDate).getTime() : Number.NaN;
  const valid = Number.isFinite(targetMs);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!valid) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [valid, targetMs]);

  if (!valid) return null;
  return revealCountdownState(targetMs, now);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "87 days, 14:22:09" or "14:22:09" when under a day. */
export function formatCountdown(s: CountdownState): string {
  const clock = `${pad(s.hours)}:${pad(s.minutes)}:${pad(s.seconds)}`;
  if (s.days <= 0) return clock;
  return `${s.days} ${s.days === 1 ? "day" : "days"}, ${clock}`;
}

/** Short form for compact badges: "87 days" or "14h 22m". */
export function formatCountdownShort(s: CountdownState): string {
  if (s.days >= 1) return `${s.days} ${s.days === 1 ? "day" : "days"}`;
  if (s.hours >= 1) return `${s.hours}h ${pad(s.minutes)}m`;
  return `${s.minutes}m ${pad(s.seconds)}s`;
}

import { useLocalDate, useLocalDateTime } from "@/lib/ecards-time";

export { useLocalDate, useLocalDateTime };



const TONE_CLASSES: Record<CountdownTone, { panel: string; text: string; dot: string }> = {
  cyprus: {
    panel: "border-cyprus/35 bg-cyprus/10",
    text: "text-cyprus",
    dot: "bg-cyprus",
  },
  gold: {
    panel: "border-gold/45 bg-gold/15",
    text: "text-ink",
    dot: "bg-gold",
  },
  velvet: {
    panel: "border-velvet/35 bg-velvet/10",
    text: "text-velvet",
    dot: "bg-velvet",
  },
};

const TONE_LABEL: Record<CountdownTone, string> = {
  cyprus: "Plenty of time",
  gold: "Getting closer",
  velvet: "Reveal is soon",
};

export function RevealCountdown({
  revealDate,
  revealed,
  messageCount,
}: {
  revealDate: string;
  revealed: boolean;
  /** Optional collected message count, shown alongside the time remaining. */
  messageCount?: number;
}) {
  const state = useRevealCountdown(revealDate);
  const revealLocal = useLocalDateTime(revealDate);
  const isDone = revealed || !state || state.done;
  const countLabel =
    typeof messageCount === "number"
      ? `${messageCount} ${messageCount === 1 ? "message" : "messages"}`
      : null;

  if (isDone) {
    return (
      <div className="rounded-2xl border-2 border-cyprus/35 bg-cyprus/10 p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyprus">Revealed</p>
        <p className="mt-2 font-display text-2xl text-ink sm:text-3xl">
          {countLabel ? `${countLabel}, revealed` : "This card has been revealed"}
        </p>
        <p className="mt-2 text-base text-ink/75">
          Reveal time {revealLocal}. Shown in your own time zone. The keepsake page stays available.
        </p>
      </div>
    );
  }

  const tone = TONE_CLASSES[state.tone];
  return (
    <div className={`rounded-2xl border-2 p-5 sm:p-6 ${tone.panel}`}>
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-ink/70">
        <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} aria-hidden />
        Countdown to reveal, {TONE_LABEL[state.tone]}
      </p>
      <p
        className={`mt-2 font-display text-3xl leading-tight sm:text-4xl ${tone.text}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {countLabel ? `${countLabel}, reveals in ` : "Reveals in "}
        {formatCountdown(state)}
      </p>
      <p className="mt-2 text-base text-ink/75">
        Reveal time {revealLocal}. Shown in your own time zone.
      </p>
    </div>
  );
}


export function RevealCountdownBadge({
  revealDate,
  revealed,
}: {
  revealDate: string;
  revealed: boolean;
}) {
  const state = useRevealCountdown(revealDate);
  if (revealed || !state || state.done) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-cyprus/35 bg-cyprus/10 px-3 py-1 text-sm font-medium text-cyprus">
        <span className="h-2 w-2 rounded-full bg-cyprus" aria-hidden />
        Revealed
      </span>
    );
  }
  const tone = TONE_CLASSES[state.tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${tone.panel} ${tone.text}`}
    >
      <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden />
      Reveals in {formatCountdownShort(state)}
    </span>
  );
}


/**
 * Contributor-facing countdown for the public signing page (/c/:slug).
 * Same thresholds and colors as the organizer countdown, framed as a friendly
 * deadline, with an optional social-proof line built only from the public
 * contribution count (never any message content).
 */
export function ContributorRevealCountdown({
  revealDate,
  contributionCount,
}: {
  revealDate: string;
  contributionCount?: number;
}) {
  const state = useRevealCountdown(revealDate);
  const revealLocal = useLocalDateTime(revealDate);
  if (!state || state.done) return null;

  const tone = TONE_CLASSES[state.tone];
  const others = typeof contributionCount === "number" ? contributionCount : null;
  const social =
    others && others > 0
      ? others === 1
        ? "Join 1 other person who has already signed."
        : `Join ${others} others who have already signed.`
      : "Be the first to sign this card.";

  return (
    <div className={`mt-5 rounded-2xl border-2 p-5 sm:p-6 ${tone.panel}`}>
      <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.16em] text-ink/70">
        <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} aria-hidden />
        {TONE_LABEL[state.tone]}
      </p>
      <p className="mt-2 font-display text-xl leading-snug text-ink sm:text-2xl">
        Add your message before it is revealed
      </p>
      <p
        className={`mt-1 font-display text-2xl leading-tight sm:text-3xl ${tone.text}`}
        aria-live="polite"
        aria-atomic="true"
      >
        Reveals in {formatCountdown(state)}
      </p>
      <p className="mt-2 text-base text-ink/75">
        Reveal time {revealLocal}. Shown in your own time zone.
      </p>
      <p className="mt-1 text-base font-medium text-ink/80">{social}</p>
    </div>
  );
}
