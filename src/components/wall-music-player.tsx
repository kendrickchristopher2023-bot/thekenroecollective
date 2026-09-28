// Soundtrack for the Photo Wall.
//
// Muted until someone deliberately starts it (browsers block autoplay audio
// anyway, and nobody wants a wall that starts blaring on its own). Once
// started it runs all night: tracks are scheduled through Web Audio with a
// per-pair crossfade, and the list loops seamlessly when there is less music
// than there are photos.
//
// Streaming links (Spotify / Apple / Amazon) are shown as a launch card only.
// Those services do not licence their audio for playback under a third-party
// slideshow, so we never fetch or proxy the stream.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listWallMusic } from "@/lib/photo-wall.functions";
import {
  EMBED_EXCLUSIVE_NOTE,
  LINK_PROVIDER_LABELS,
  analyseSamples,
  closingFadeSec,
  entryOffsetSec,
  equalPowerCurve,
  isMoment,
  loudnessGain,
  musicEmbed,
  segmentSchedule,
  songLengthLabel,
  transitionPlan,

  type LinkProvider,
  type TrackConditioning,
} from "@/lib/wall-soundtrack";



export type Track = {
  id: string;
  title: string;
  artist: string | null;
  url: string;
  crossfadeMs: number;
  bpm: number | null;
  energy: number | null;
};

/**
 * A piece that plays once rather than looping: a letter read aloud, or a poem
 * the host placed as a moment. It has its own play button, it ducks the
 * soundtrack while it runs, and it never repeats.
 */
type Moment = {
  id: string;
  title: string;
  url: string;
  seconds: number | null;
  kind: string;
};

type LinkCard = {
  id: string;
  url: string;
  provider: LinkProvider;
  title: string;
  artUrl: string | null;
};

const VOLUME_KEY = "kenroe.wall.volume";
/** Dispatch these on window to dip the music, e.g. while a voice note plays. */
export const DUCK_EVENT = "kenroe:wall-music-duck";
export const UNDUCK_EVENT = "kenroe:wall-music-unduck";
/** Dispatch when the wall closes or the slideshow ends: fades the music down. */
export const CLOSE_EVENT = "kenroe:wall-music-close";


export function WallMusicPlayer({
  eventId,
  tracks: trackProp,
  compact,
  hidden,
  onTempo,
  noCrossfade,
  silent,
}: {
  /** Reads the wall's own soundtrack. Omit when passing tracks directly. */
  eventId?: string;
  /**
   * A ready-made ordered list, used by a shared playlist. When this is given
   * the player skips the wall read and plays exactly these, with the same
   * crossfade, silence trimming and loudness matching as the wall.
   */
  tracks?: Track[];
  compact?: boolean;
  hidden?: boolean;
  /** Fires with the playing track's tempo so slides can change on the beat. */
  onTempo?: (bpm: number | null) => void;
  /** Host chose clean gaps between songs (a ceremony) instead of blending. */
  noCrossfade?: boolean;
  /**
   * Host is running this wall without sound tonight: the music comes from the
   * room instead. Songs stay attached to the event, they just don't play here.
   */
  silent?: boolean;

}) {

  const [tracks, setTracks] = useState<Track[]>([]);
  const [links, setLinks] = useState<LinkCard[]>([]);
  const [moments, setMoments] = useState<Moment[]>([]);
  /** Which moment is playing right now, if any. */
  const [momentId, setMomentId] = useState<string | null>(null);
  const momentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.6);
  const [ducked, setDucked] = useState(false);
  /** Which streaming link's official player is open, if any. */
  const [openLink, setOpenLink] = useState<string | null>(null);
  const openLinkCard = links.find((l) => l.id === openLink) ?? null;
  const openEmbed = useMemo(
    () => (openLinkCard ? musicEmbed(openLinkCard.url) : null),
    [openLinkCard],
  );


  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  /** Per-track trim, level and loudness, measured once after decoding. */
  const condRef = useRef<Map<string, TrackConditioning>>(new Map());

  const activeRef = useRef<{ source: AudioBufferSourceNode; gain: GainNode }[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(0);
  const stoppedRef = useRef(true);
  const volumeRef = useRef(0.6);
  /** Level to come back to when the host unmutes from the wall screen. */
  const preMuteRef = useRef(0.6);

  const tempoRef = useRef(onTempo);
  tempoRef.current = onTempo;

  useEffect(() => {
    let cancelled = false;
    if (trackProp) {
      setTracks(trackProp);
      setLinks([]);
      return;
    }
    if (!eventId) return;
    listWallMusic({ data: { eventId } })
      .then((rows) => {
        if (cancelled) return;
        setMoments(
          rows
            .filter((r) => r.url && isMoment(r.settings))
            .map((r) => ({
              id: r.id,
              title: r.title,
              url: r.url as string,
              seconds: r.seconds,
              kind: String((r.settings as { kind?: unknown } | null)?.kind ?? "letter"),
            })),
        );
        setTracks(
          rows
            .filter((r) => r.url && !isMoment(r.settings))
            .map((r) => ({
              id: r.id,
              title: r.title,
              artist: r.artist,
              url: r.url as string,
              crossfadeMs: r.crossfadeMs ?? 2500,
              bpm: r.bpm,
              energy: r.energy,
            })),
        );
        setLinks(
          rows
            .filter((r) => r.link)
            .map((r) => ({
              id: r.id,
              url: r.link!.url,
              provider: (r.link!.provider as LinkProvider) ?? "spotify",
              title: r.link!.title,
              artUrl: r.link!.artUrl,
            })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId, trackProp]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = Number(window.localStorage.getItem(VOLUME_KEY));
    if (Number.isFinite(saved) && saved > 0 && saved <= 1) {
      setVolume(saved);
      volumeRef.current = saved;
    }
  }, []);

  const targetGain = useMemo(() => (ducked ? volume * 0.18 : volume), [ducked, volume]);

  useEffect(() => {
    volumeRef.current = targetGain;
    const master = masterRef.current;
    const ctx = ctxRef.current;
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 0.25);
    }
    if (typeof window !== "undefined") window.localStorage.setItem(VOLUME_KEY, String(volume));
  }, [targetGain, volume]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const duck = () => setDucked(true);
    const unduck = () => setDucked(false);
    window.addEventListener(DUCK_EVENT, duck);
    window.addEventListener(UNDUCK_EVENT, unduck);
    return () => {
      window.removeEventListener(DUCK_EVENT, duck);
      window.removeEventListener(UNDUCK_EVENT, unduck);
    };
  }, []);

  const loadBuffer = useCallback(async (ctx: AudioContext, track: Track) => {
    const cached = buffersRef.current.get(track.id);
    if (cached) return cached;
    const res = await fetch(track.url);
    if (!res.ok) throw new Error("track unavailable");
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    buffersRef.current.set(track.id, buffer);
    // Measured once per track: where the music really starts and stops, and
    // the gain that puts it on a level with everything else in the list.
    if (!condRef.current.has(track.id)) {
      try {
        condRef.current.set(track.id, analyseSamples(buffer));
      } catch {
        /* fall back to untrimmed, unity-gain playback */
      }
    }
    return buffer;
  }, []);

  /** Head/tail trim and level for a track, with safe defaults. */
  const conditioningFor = useCallback((track: Track, buffer: AudioBuffer) => {
    const measured = condRef.current.get(track.id);
    if (measured) return measured;
    return {
      headSec: 0,
      tailSec: 0,
      playableSec: buffer.duration,
      energy: track.energy ?? 0.5,
      gain: loudnessGain(track.energy),
    };
  }, []);

  /** Cut every scheduled node dead. Used on unmount and before a skip. */
  const killNodes = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    for (const node of activeRef.current) {
      try {
        node.source.stop();
      } catch {
        /* already ended */
      }
    }
    activeRef.current = [];
  }, []);

  const stopAll = useCallback(() => {
    stoppedRef.current = true;
    killNodes();
    indexRef.current = 0;
    setPlaying(false);
    setPaused(false);
    setNowPlaying(null);
    tempoRef.current?.(null);
  }, [killNodes]);

  /**
   * Ends the soundtrack by riding the master fader down instead of cutting the
   * audio off. Used by the Stop button (a short, obvious fade) and when the
   * wall is closed or the slideshow finishes (a long one, up to 20s).
   */
  const fadeOutAndStop = useCallback(
    (seconds: number) => {
      const ctx = ctxRef.current;
      const master = masterRef.current;
      if (!ctx || !master || stoppedRef.current) {
        stopAll();
        return;
      }
      // No more handovers once we are on the way out.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      stoppedRef.current = true;
      const fade = Math.max(0.5, seconds);
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      setNowPlaying("Fading out");
      window.setTimeout(() => {
        killNodes();
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(volumeRef.current, ctx.currentTime);
        indexRef.current = 0;
        setPlaying(false);
        setPaused(false);
        setNowPlaying(null);
        tempoRef.current?.(null);
      }, fade * 1000 + 120);
    },
    [killNodes, stopAll],
  );

  /**
   * Plays the track at `indexRef`, then schedules the next one to start a
   * crossfade before this one ends. Wraps round the list forever.
   *
   * Silence at the head and tail is skipped rather than faded through, the
   * incoming track enters on a downbeat when its tempo reading is trustworthy,
   * and each track carries its own level so the list sounds even.
   */
  const playFrom = useCallback(
    async (ctx: AudioContext, master: GainNode) => {
      if (stoppedRef.current || tracks.length === 0) return;
      const track = tracks[indexRef.current % tracks.length]!;
      let buffer: AudioBuffer;
      try {
        buffer = await loadBuffer(ctx, track);
      } catch {
        // Skip a track we cannot decode rather than stalling the wall.
        indexRef.current += 1;
        if (indexRef.current % tracks.length !== 0 || tracks.length === 1) {
          timerRef.current = setTimeout(() => void playFrom(ctx, master), 400);
        }
        return;
      }
      if (stoppedRef.current) return;

      const cond = conditioningFor(track, buffer);
      // Start on the first downbeat after the trimmed head when the tempo
      // estimate is solid; otherwise at the first audible moment.
      const offset = Math.min(
        Math.max(0, buffer.duration - 0.5),
        entryOffsetSec(cond.headSec, track.bpm, track.bpm !== null),
      );
      const playable = Math.max(0.5, buffer.duration - offset - cond.tailSec);

      // Where we hand over to whatever plays next, worked out from both tracks'
      // tempo and energy so the overlap lands on whole bars.
      const next = tracks[(indexRef.current + 1) % tracks.length]!;
      const plan = transitionPlan(
        { bpm: track.bpm, energy: cond.energy, seconds: playable },
        { bpm: next.bpm, energy: next.energy, seconds: null },
        { noCrossfade: !!noCrossfade },
      );
      // Looping a single track: keep the overlap short so we aren't layering a
      // recording on top of itself for seconds at a time, and hold the fades
      // inside that overlap. A 4.5s tail against a 1.2s handover would leave the
      // old copy audible under the restart, which is exactly what a short AI
      // song on repeat all night must never do. The arithmetic lives in
      // segmentSchedule so it can be tested instead of trusted.
      const isRepeat = next.id === track.id;
      const sched = segmentSchedule({
        playableSec: playable,
        plan,
        isRepeat,
        ...(noCrossfade ? { noCrossfade: true } : {}),
      });
      const overlap = sched.overlapSec;
      const fadeIn = sched.fadeInSec;
      const fadeOut = sched.fadeOutSec;




      const gain = ctx.createGain();
      gain.connect(master);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);

      const level = Math.max(0.2, Math.min(1.8, cond.gain));
      const start = ctx.currentTime + 0.05;
      // Equal-power curves: no loudness dip in the middle of the handover, and
      // the incoming track rises faster than the outgoing one decays, so its
      // opening bars are heard properly instead of being faded through.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.setValueCurveAtTime(
        equalPowerCurve("in").map((v) => v * level) as unknown as Float32Array,
        start,
        Math.max(0.05, fadeIn),
      );
      const outAt = start + Math.max(fadeIn + 0.2, playable - overlap);
      gain.gain.setValueAtTime(level, outAt);
      gain.gain.setValueCurveAtTime(
        equalPowerCurve("out").map((v) => v * level) as unknown as Float32Array,
        outAt,
        fadeOut,
      );
      source.start(start, offset);
      source.stop(outAt + Math.max(overlap, fadeOut) + 0.1);

      activeRef.current = [
        ...activeRef.current.filter((n) => n.source !== source),
        { source, gain },
      ];
      source.onended = () => {
        activeRef.current = activeRef.current.filter((n) => n.source !== source);
      };

      setNowPlaying(track.artist ? `${track.title} — ${track.artist}` : track.title);
      tempoRef.current?.(track.bpm);

      indexRef.current += 1;
      // In no-crossfade mode the next song waits for the tail to finish plus a
      // clean gap, so distinct songs never bleed into each other. A single track
      // repeating is not two songs, so it gets a short breath instead of the full
      // gap: a nine-tenths-of-a-second hole every 30 seconds reads as a fault.
      const handoverAt = start + sched.handoverSec;
      const nextInMs = Math.max(600, (handoverAt - ctx.currentTime) * 1000);


      timerRef.current = setTimeout(() => void playFrom(ctx, master), nextInMs);
    },
    [conditioningFor, loadBuffer, noCrossfade, tracks],
  );


  const start = useCallback(async () => {
    if (tracks.length === 0) return;
    let ctx = ctxRef.current;
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      ctxRef.current = ctx;
      const master = ctx.createGain();
      master.gain.value = volumeRef.current;
      master.connect(ctx.destination);
      masterRef.current = master;
    }
    await ctx.resume();
    stoppedRef.current = false;
    setPlaying(true);
    setPaused(false);
    await playFrom(ctx, masterRef.current!);
  }, [playFrom, tracks.length]);

  /**
   * Pause/resume by suspending the audio context: the clock freezes, so the
   * scheduled crossfade into the next track simply waits too.
   */
  const togglePause = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx || !playing) return;
    if (paused) {
      await ctx.resume();
      setPaused(false);
    } else {
      await ctx.suspend();
      setPaused(true);
    }
  }, [paused, playing]);

  /**
   * Skip to the next or previous track. indexRef always points at the NEXT
   * track once playback is rolling, so "next" uses it as-is and "previous"
   * steps back two. From a stopped state this starts playback at the ends.
   */
  const skip = useCallback(
    (delta: 1 | -1) => {
      const ctx = ctxRef.current;
      const master = masterRef.current;
      if (tracks.length === 0) return;
      if (!ctx || !master || stoppedRef.current) {
        indexRef.current = delta === 1 ? 0 : tracks.length - 1;
        void start();
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      for (const node of activeRef.current) {
        try {
          node.source.stop();
        } catch {
          /* already ended */
        }
      }
      activeRef.current = [];
      const n = tracks.length;
      indexRef.current = (((indexRef.current - 1 + delta) % n) + n) % n;
      setPaused(false);
      void ctx.resume();
      void playFrom(ctx, master);
    },
    [tracks.length, playFrom, start],
  );

  useEffect(() => stopAll, [stopAll]);

  /**
   * The wall page dispatches CLOSE_EVENT when the slideshow ends or the wall is
   * shut down. Ride the music down over the closing fade instead of cutting it.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onClose = () => {
      if (stoppedRef.current) return;
      fadeOutAndStop(closingFadeSec(null));
    };
    window.addEventListener(CLOSE_EVENT, onClose);
    return () => window.removeEventListener(CLOSE_EVENT, onClose);
  }, [fadeOutAndStop]);

  /**
   * The host turned the wall's sound off (or turns it off mid-event from the
   * setup panel, which reaches this screen over realtime). Ride the music down
   * rather than cutting it, and leave every track attached to the event.
   */
  useEffect(() => {
    if (!silent) return;
    if (!stoppedRef.current) fadeOutAndStop(3);
  }, [silent, fadeOutAndStop]);

  /**
   * Start a moment. The soundtrack ducks right down while it runs (a letter is
   * listened to, not scored), and it comes back up when the reading ends. It is
   * never scheduled into the loop, so it plays exactly once.
   */
  const playMoment = useCallback(
    (moment: Moment) => {
      momentAudioRef.current?.pause();
      const audio = new Audio(moment.url);
      audio.loop = false;
      audio.volume = 1;
      momentAudioRef.current = audio;
      setMomentId(moment.id);
      setDucked(true);
      const done = () => {
        setDucked(false);
        setMomentId((current) => (current === moment.id ? null : current));
      };
      audio.onended = done;
      audio.onerror = done;
      void audio.play().catch(done);
    },
    [],
  );

  const stopMoment = useCallback(() => {
    const audio = momentAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    momentAudioRef.current = null;
    setDucked(false);
    setMomentId(null);
  }, []);

  /** Never leave a reading playing behind a closed wall. */
  useEffect(() => () => momentAudioRef.current?.pause(), []);

  if (tracks.length === 0 && links.length === 0 && moments.length === 0) return null;


  return (
    <div
      className={`pointer-events-auto absolute left-1/2 z-20 -translate-x-1/2 transition-opacity duration-500 ${
        hidden ? "pointer-events-none opacity-0" : "opacity-100"
      } ${compact ? "bottom-6" : "bottom-8"}`}
    >
      <div className="flex max-w-[92vw] flex-wrap items-center justify-center gap-3 rounded-full bg-black/60 px-4 py-2 backdrop-blur">
        {tracks.length > 0 && silent && (
          <span className="whitespace-nowrap text-xs text-white/70">
            Sound off for tonight. Your {tracks.length === 1 ? "song is" : "songs are"} still saved.
          </span>
        )}

        {tracks.length > 0 && !silent && (
          <>

            {!playing ? (
              <button
                type="button"
                onClick={() => void start()}
                aria-label="Start soundtrack"
                className="flex h-9 items-center gap-2 rounded-full bg-white/15 px-3 text-sm text-white hover:bg-white/25"
              >
                <span aria-hidden>▶</span>
                <span className="whitespace-nowrap">Start soundtrack</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => skip(-1)}
                  aria-label="Previous track"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm text-white hover:bg-white/25"
                >
                  <span aria-hidden>⏮</span>
                </button>
                <button
                  type="button"
                  onClick={() => void togglePause()}
                  aria-label={paused ? "Resume soundtrack" : "Pause soundtrack"}
                  className="flex h-9 items-center gap-2 rounded-full bg-white/15 px-3 text-sm text-white hover:bg-white/25"
                >
                  <span aria-hidden>{paused ? "▶" : "❚❚"}</span>
                  <span className="whitespace-nowrap">{paused ? "Resume" : "Pause"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => fadeOutAndStop(6)}
                  aria-label="Stop soundtrack"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm text-white hover:bg-white/25"
                >
                  <span aria-hidden>⏹</span>
                </button>
                <button
                  type="button"
                  onClick={() => skip(1)}
                  aria-label="Next track"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm text-white hover:bg-white/25"
                >
                  <span aria-hidden>⏭</span>
                </button>
              </>
            )}
            <span className="max-w-[200px] truncate text-xs text-white/70">
              {nowPlaying ?? `${tracks.length} track${tracks.length === 1 ? "" : "s"} on repeat`}
              {paused ? " (paused)" : ""}
            </span>
            {/* Volume lives on the wall itself, not only in setup: when someone
                gives a toast the host is standing at the screen, not at a laptop. */}
            <button
              type="button"
              onClick={() => {
                if (volume > 0) {
                  preMuteRef.current = volume;
                  setVolume(0);
                } else {
                  setVolume(preMuteRef.current || 0.6);
                }
              }}
              aria-label={volume > 0 ? "Mute music" : "Unmute music"}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm text-white hover:bg-white/25"
            >
              <span aria-hidden>{volume > 0 ? "🔊" : "🔇"}</span>
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              aria-label="Music volume"
              onChange={(e) => setVolume(Number(e.target.value))}
              className="h-1 w-24 accent-white"
            />
            <span className="w-9 text-right text-xs tabular-nums text-white/70">
              {Math.round(volume * 100)}%
            </span>

          </>
        )}

        {/* A letter, or a poem placed as a moment: its own play button, clearly
            the reading rather than the music, and it plays through once. */}
        {!silent &&
          moments.map((moment) => (
          <button
            key={moment.id}
            type="button"
            aria-label={
              momentId === moment.id
                ? `Stop ${moment.title}`
                : `Play ${moment.title}, ${moment.kind === "poem" ? "a poem" : "a letter"} read aloud`
            }
            onClick={() => (momentId === moment.id ? stopMoment() : playMoment(moment))}
            className="flex items-center gap-2 rounded-full bg-white/15 py-1 pl-1 pr-3 text-xs text-white hover:bg-white/25"
          >
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-[11px]"
            >
              {momentId === moment.id ? "⏹" : "▶"}
            </span>
            <span className="max-w-[190px] truncate text-left">
              {momentId === moment.id ? "Playing" : "Play"} the{" "}
              {moment.kind === "poem" ? "poem" : "letter"}
              <span className="block truncate text-[10px] text-white/60">
                {moment.title}
                {moment.seconds ? ` · ${songLengthLabel(Math.round(moment.seconds))}` : ""}
              </span>
            </span>
          </button>
        ))}
        {moments.length > 0 && !silent && (
          <span className="max-w-[240px] text-[10px] leading-tight text-white/55">
            Read aloud once, all the way through. The music dips while it plays and comes
            back afterwards.
          </span>
        )}

        {/* Each streaming playlist gets its own play button, separate from the
            wall's own transport above. Starting one fades the wall's soundtrack
            out, because these services never permit their music to be mixed
            with, or timed to, anything else. */}
        {links.map((link) => (
          <button
            key={link.id}
            type="button"
            aria-label={`Play ${link.title} on ${LINK_PROVIDER_LABELS[link.provider]}`}
            onClick={() => {
              if (!stoppedRef.current) fadeOutAndStop(2);
              setOpenLink(link.id);
            }}
            className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 text-xs text-white hover:bg-white/20"
          >
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-[11px]"
            >
              ▶
            </span>
            {link.artUrl ? (
              <img src={link.artUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15"
              >
                ♪
              </span>
            )}
            <span className="max-w-[180px] truncate text-left">
              {link.title}
              <span className="block text-[10px] text-white/60">
                Play from {LINK_PROVIDER_LABELS[link.provider]}
              </span>
            </span>
          </button>
        ))}
        {links.length > 0 && (
          <span className="max-w-[240px] text-[10px] leading-tight text-white/55">
            Plays in the service's own player. Guests hear previews unless they are
            signed in, and it does not blend with the wall's soundtrack.
          </span>
        )}
      </div>

      {openLinkCard && (
        <div className="pointer-events-auto absolute bottom-full left-1/2 mb-3 w-[min(92vw,26rem)] -translate-x-1/2 rounded-2xl bg-black/85 p-3 text-white backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium">{openLinkCard.title}</p>
            <button
              type="button"
              onClick={() => setOpenLink(null)}
              aria-label="Close playlist player"
              className="rounded-full bg-white/15 px-2 text-xs hover:bg-white/25"
            >
              ✕
            </button>
          </div>
          {openEmbed ? (
            <>
              <iframe
                title={`${LINK_PROVIDER_LABELS[openLinkCard.provider]} player`}
                src={openEmbed.src}
                height={Math.min(openEmbed.height, 300)}
                allow="autoplay *; encrypted-media *; clipboard-write"
                sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms"
                loading="lazy"
                className="mt-2 w-full rounded-xl border-0 bg-white/5"
              />
              <p className="mt-2 text-[10px] leading-snug text-white/60">
                {openEmbed.note} {EMBED_EXCLUSIVE_NOTE}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[11px] leading-snug text-white/70">
              This link can't play here. Open it in{" "}
              {LINK_PROVIDER_LABELS[openLinkCard.provider]} instead.
            </p>
          )}
          <a
            href={openLinkCard.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex rounded-full bg-white/15 px-3 py-1 text-[11px] hover:bg-white/25"
          >
            Open in {LINK_PROVIDER_LABELS[openLinkCard.provider]} ↗
          </a>
        </div>
      )}

    </div>
  );
}
