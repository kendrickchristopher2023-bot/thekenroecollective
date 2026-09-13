/**
 * The shared audio controls on an invitation: a track player for one piece of
 * audio, and the mini bar that follows the guest down the page.
 *
 * Neither owns any audio. They ask the page's single controller, which is the
 * whole point: on a phone the panel at the top scrolls away in a second, and a
 * guest left with music they cannot reach is the exact complaint that produced
 * this file.
 */

import { Pause, Play, Square } from "lucide-react";
import {
  audioClock,
  pauseAudio,
  resumeAudio,
  stopAudio,
  toggleTrack,
  useInviteAudio,
  type InviteAudioTrack,
} from "@/lib/invite-audio";

/** Words, not just icons, and a tap target big enough for a thumb. */
export function InviteTrackPlayer({
  track,
  accent,
  className,
}: {
  track: InviteAudioTrack;
  accent?: string | null;
  className?: string;
}) {
  const audio = useInviteAudio();
  const mine = audio.trackId === track.id;
  const playing = mine && audio.playing;
  const ink = accent || "#5c1d1d";
  const pct = mine && audio.duration ? Math.min(100, (audio.position / audio.duration) * 100) : 0;

  return (
    <div className={className ?? ""}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => toggleTrack(track)}
          aria-label={playing ? `Pause ${track.label}` : `Play ${track.label}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white shadow-sm"
          style={{ backgroundColor: ink }}
        >
          {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          {playing ? "Pause" : mine && audio.position > 0 ? "Continue" : "Play"}
        </button>
        <button
          type="button"
          onClick={stopAudio}
          disabled={!mine}
          aria-label={`Stop ${track.label}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold text-ink disabled:opacity-40"
          style={{ borderColor: `${ink}55` }}
        >
          <Square className="h-3.5 w-3.5" aria-hidden />
          Stop
        </button>
        <span className="text-xs text-muted-foreground" aria-live="off">
          {audioClock(mine ? audio.position : 0)} / {audioClock(mine ? audio.duration : 0)}
        </span>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink/10"
        role="progressbar"
        aria-label={`${track.label} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className="h-full rounded-full" style={{ backgroundColor: ink, width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * The persistent control. It exists only while something of ours is loaded, so
 * it never sits there as decoration, and Stop from here reaches everything.
 */
export function InviteAudioMiniBar({ accent }: { accent?: string | null }) {
  const audio = useInviteAudio();
  if (!audio.trackId) return null;
  const ink = accent || "#5c1d1d";
  const pct = audio.duration ? Math.min(100, (audio.position / audio.duration) * 100) : 0;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t-2 bg-white/95 px-3 py-2 shadow-[0_-6px_20px_rgba(0,0,0,0.12)] backdrop-blur print:hidden"
      style={{ borderColor: ink }}
      role="region"
      aria-label="Audio controls"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{audio.label}</p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
            <div className="h-full rounded-full" style={{ backgroundColor: ink, width: `${pct}%` }} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => (audio.playing ? pauseAudio() : resumeAudio())}
          className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-white"
          style={{ backgroundColor: ink }}
        >
          {audio.playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          {audio.playing ? "Pause" : "Continue"}
        </button>
        <button
          type="button"
          onClick={stopAudio}
          className="inline-flex min-h-11 items-center gap-1 rounded-full border-2 px-3 text-sm font-semibold text-ink"
          style={{ borderColor: `${ink}55` }}
        >
          <Square className="h-3.5 w-3.5" aria-hidden />
          Stop
        </button>
      </div>
    </div>
  );
}
