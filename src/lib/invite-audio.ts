/**
 * The invitation's one and only audio authority.
 *
 * Every sound on an invitation page goes through this module: the host's voice
 * note, the invitation read aloud, the event song, a poem, a letter. Nothing
 * creates its own <audio> element any more, because three independent players
 * on one page is what produced music that kept playing while Stop did nothing.
 *
 * The rules it enforces, without exception:
 *  - One sound at a time. Starting anything stops whatever was playing.
 *  - Stop means stop, from any control anywhere on the page.
 *  - Pause resumes from where it left off, never from the beginning.
 *  - Nothing starts without a guest gesture. There is no autoplay path here,
 *    and no other module is allowed to start audio.
 *  - A streaming embed (Apple Music, Spotify, Amazon) belongs to the service,
 *    so we cannot control it. When a guest touches one, we go silent instead of
 *    talking over it.
 */

import { useEffect, useSyncExternalStore } from "react";

export interface InviteAudioTrack {
  /** Stable per source, so a control can tell "mine" from "someone else's". */
  id: string;
  url: string;
  label: string;
}

export interface InviteAudioState {
  trackId: string | null;
  label: string;
  playing: boolean;
  position: number;
  duration: number;
}

const IDLE: InviteAudioState = {
  trackId: null,
  label: "",
  playing: false,
  position: 0,
  duration: 0,
};

let state: InviteAudioState = IDLE;
const listeners = new Set<() => void>();
let el: HTMLAudioElement | null = null;
let endedHandler: (() => void) | null = null;
/** Bumped on every start/stop, so a stale promise or event cannot resurrect audio. */
let generation = 0;

function set(next: Partial<InviteAudioState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function element(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (el) return el;
  const a = new Audio();
  a.preload = "metadata";
  (a as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  a.addEventListener("timeupdate", () => set({ position: a.currentTime }));
  a.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(a.duration)) set({ duration: a.duration });
  });
  a.addEventListener("play", () => set({ playing: true }));
  a.addEventListener("pause", () => set({ playing: false }));
  a.addEventListener("ended", () => {
    const done = endedHandler;
    set({ playing: false, position: 0 });
    // Handed to the sequence, which decides what comes next. Cleared first so a
    // handler that stops us cannot loop back into itself.
    endedHandler = null;
    done?.();
  });
  el = a;
  return a;
}

/** Start a track from the beginning. Anything already playing is stopped. */
export function playTrack(track: InviteAudioTrack, opts?: { onEnded?: () => void }) {
  const a = element();
  if (!a) return;
  generation += 1;
  const mine = generation;
  endedHandler = opts?.onEnded ?? null;
  a.pause();
  a.src = track.url;
  try {
    a.currentTime = 0;
  } catch {
    /* some browsers refuse before metadata; playback still starts at 0 */
  }
  set({ trackId: track.id, label: track.label, playing: false, position: 0, duration: 0 });
  void a
    .play()
    .then(() => {
      if (generation === mine) set({ playing: true });
    })
    .catch(() => {
      if (generation === mine) set({ playing: false });
    });
}

/** Pause the current sound, keeping its place. */
export function pauseAudio() {
  if (!el) return;
  el.pause();
  set({ playing: false, position: el.currentTime });
}

/** Resume the current sound from where it stopped. */
export function resumeAudio() {
  const a = el;
  if (!a || !a.src) return;
  generation += 1;
  const mine = generation;
  void a
    .play()
    .then(() => {
      if (generation === mine) set({ playing: true });
    })
    .catch(() => {
      if (generation === mine) set({ playing: false });
    });
}

/**
 * Silence everything, at once, and forget the sequence. Every Stop control on
 * the page calls this, and so does any gesture on a streaming embed.
 */
export function stopAudio() {
  generation += 1;
  endedHandler = null;
  const a = el;
  if (a) {
    a.pause();
    try {
      a.removeAttribute("src");
      a.load();
    } catch {
      /* ignore */
    }
  }
  state = IDLE;
  listeners.forEach((l) => l());
}

/** Play if this track is paused or idle, pause if it is the one playing. */
export function toggleTrack(track: InviteAudioTrack) {
  if (state.trackId === track.id) {
    if (state.playing) pauseAudio();
    else resumeAudio();
    return;
  }
  playTrack(track);
}

export function seekAudio(seconds: number) {
  const a = el;
  if (!a || !a.src) return;
  try {
    a.currentTime = Math.max(0, seconds);
    set({ position: a.currentTime });
  } catch {
    /* ignore */
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useInviteAudio(): InviteAudioState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => IDLE,
  );
}

/** mm:ss, for progress read-outs. */
export function audioClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * A streaming embed (Apple Music, Spotify, Amazon) is the service's own player
 * inside an iframe, so a tap on it never reaches this page. What does reach us
 * is the window losing focus to that iframe, and that is our cue to go quiet
 * rather than talk over their music. We stop ours; we never touch theirs.
 */
export function useSilenceOnEmbedFocus(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBlur = () => {
      const active = document.activeElement;
      if (!active || active.tagName !== "IFRAME") return;
      const host = ref.current;
      if (host && (host === active || host.contains(active))) stopAudio();
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [ref]);
}
