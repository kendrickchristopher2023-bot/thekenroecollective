import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { fetchPublicEvent, type KEvent } from "@/lib/events-store";
import { useEventRealtime } from "@/hooks/use-event-realtime";
import { getPhotoWallAccess } from "@/lib/branding.functions";
import { listEventPhotos } from "@/lib/photo-wall.functions";
import { CLOSE_EVENT, WallMusicPlayer } from "@/components/wall-music-player";
import { slideMsForTrack } from "@/lib/wall-soundtrack";
import { useDisplayClass, type DisplayChoice } from "@/hooks/use-display-class";
import { PACE_LABELS, PACE_STEPS, WALL_CHROME, readPace, writePace } from "@/lib/wall-chrome";

export const Route = createFileRoute("/wall/$eventId/")({
  head: ({ params }) => ({
    meta: [
      { title: "Live Photo Wall — The Kenroe Collective" },
      { name: "description", content: "Auto-refreshing slideshow of guest photos." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Live Photo Wall" },
      { property: "og:description", content: "An auto-refreshing slideshow of guest photos from the event." },
      { property: "og:url", content: `https://thekenroecollective.com/wall/${params.eventId}` },
    ],
    links: [{ rel: "canonical", href: `https://thekenroecollective.com/wall/${params.eventId}` }],
  }),
  validateSearch: (search: Record<string, unknown>): { tv?: "1" } =>
    search.tv === "1" || search.tv === true ? { tv: "1" } : {},
  component: WallPage,
});

// Realtime keeps the wall current; the poll is a safety net for flaky venue wifi.
const REFRESH_MS = 20_000;

type Photo = { id: string; url: string; label: string | null };

function WallPage() {
  const { eventId } = Route.useParams();
  const { tv } = Route.useSearch();
  // ?tv=1 stays a hard override so existing TV links keep behaving; otherwise the
  // wall sizes itself to whatever screen it opened on.
  const { display, choice, setChoice } = useDisplayClass(tv === "1" ? "tv" : undefined);
  const isTv = display === "tv";
  const chrome = WALL_CHROME[display];
  const [pace, setPace] = useState(1);
  const [paused, setPaused] = useState(false);
  const [fill, setFill] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const compactControls = display === "phone";
  const stageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => setPace(readPace()), []);

  /** A laptop wall looks best without the browser frame around it. */
  function toggleFullscreen() {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void el.requestFullscreen?.();
    } catch {
      /* unsupported: the wall still fills the window */
    }
  }
  const [event, setEvent] = useState<KEvent | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [index, setIndex] = useState(0);
  const [qr, setQr] = useState<string | null>(null);
  const [uploadUrl, setUploadUrl] = useState("");
  const [access, setAccess] = useState<boolean | undefined>(undefined);
  const [idle, setIdle] = useState(false);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getPhotoWallAccess({ data: { eventId } })
      .then((r) => { if (!cancelled) setAccess(r.allowed); })
      .catch(() => { if (!cancelled) setAccess(false); });
    return () => { cancelled = true; };
  }, [eventId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/wall/${eventId}/upload`;
    setUploadUrl(url);
    QRCode.toDataURL(url, { width: 420, margin: 1, errorCorrectionLevel: "M" }).then(setQr).catch(() => {});
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    fetchPublicEvent(eventId).then((e) => { if (!cancelled) setEvent(e ?? null); });
    return () => { cancelled = true; };
  }, [eventId]);

  /**
   * When the wall is closed, or the slideshow runs out of photos to show, ask
   * the soundtrack to fade down over its closing fade rather than cut off.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fade = () => window.dispatchEvent(new Event(CLOSE_EVENT));
    window.addEventListener("pagehide", fade);
    return () => window.removeEventListener("pagehide", fade);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (photos.length === 0) window.dispatchEvent(new Event(CLOSE_EVENT));
  }, [photos.length]);

  const onRealtimeEvent = useCallback((next: KEvent | null) => setEvent(next), []);
  useEventRealtime(eventId, onRealtimeEvent);

  const load = useCallback(async () => {
    try {
      const rows = await listEventPhotos({ data: { eventId } });
      setLoadError(false);
      setPhotos(rows.map((r) => ({ id: r.id, url: r.url, label: r.label })));
      rows.forEach((r) => seen.current.add(r.id));
    } catch {
      setLoadError(true);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(t);
  }, [load]);

  // A guest who just uploaded should see their own photo within a second or two.
  useEffect(() => {
    const channel = supabase
      .channel(`wall-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_photos", filter: `event_id=eq.${eventId}` },
        () => void load(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [eventId, load]);

  const [bpm, setBpm] = useState<number | null>(null);

  useEffect(() => {
    if (photos.length < 2 || paused) return;
    // Snap the interval to whole bars of the playing track so photos change on
    // the beat instead of drifting against the music. The host's pace choice
    // stretches or shortens the base hold for this screen size.
    const t = window.setInterval(
      () => setIndex((i) => (i + 1) % photos.length),
      slideMsForTrack(Math.round(chrome.rotateMs * pace), bpm),
    );
    return () => window.clearInterval(t);
  }, [photos.length, chrome.rotateMs, pace, paused, bpm]);

  // Keyboard and TV-remote control: step through photos, space holds on one.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (photos.length === 0) return;
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % photos.length);
      else if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + photos.length) % photos.length);
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length]);


  // Keep the display awake and, once nobody is touching it, let the photo have
  // the screen. This used to be TV-only; a laptop on a stand deserves it too.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let lock: any = null;
    const request = async () => {
      try { lock = await (navigator as any).wakeLock?.request?.("screen"); } catch { /* unsupported */ }
    };
    void request();
    const onVisible = () => { if (document.visibilityState === "visible") void request(); };
    document.addEventListener("visibilitychange", onVisible);
    let timer = window.setTimeout(() => setIdle(true), 3000);
    const bump = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 3000);
    };
    window.addEventListener("mousemove", bump);
    window.addEventListener("keydown", bump);
    window.addEventListener("touchstart", bump);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("mousemove", bump);
      window.removeEventListener("keydown", bump);
      window.removeEventListener("touchstart", bump);
      window.clearTimeout(timer);
      try { lock?.release?.(); } catch { /* noop */ }
    };
  }, []);

  const current = photos[index % Math.max(photos.length, 1)];
  const title = event?.title || "Live Photo Wall";
  const empty = photos.length === 0;
  const shortUrl = useMemo(() => uploadUrl.replace(/^https?:\/\//, ""), [uploadUrl]);

  if (access === undefined) {
    return <div className="h-screen w-screen bg-black" />;
  }

  if (access === false) {
    return (
      <div className="relative flex h-screen w-screen flex-col items-center justify-center bg-black px-8 text-center text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-400/80">Photo Wall</p>
        <h1 className="mt-2 font-serif text-4xl">Not enabled for this event</h1>
        <p className="mt-4 max-w-md text-white/70">
          Photo Wall is included with the Atelier plan. The event host can turn it on from their plan settings.
        </p>
        <Link
          to="/invite/$eventId"
          params={{ eventId }}
          className="mt-6 rounded-full bg-white/10 px-4 py-2 text-xs text-white/80 backdrop-blur hover:bg-white/20"
        >
          ← Back to invite
        </Link>
      </div>
    );
  }

  return (
    <div
      ref={stageRef}
      className={`relative h-[100dvh] w-screen overflow-hidden bg-black text-white ${
        idle ? "cursor-none" : ""
      }`}
    >
      {/* Blurred copy of the same photo fills the frame so portrait shots don't
          sit in black bars on a widescreen TV. */}
      {current && (
        <img
          key={`bg-${current.id}`}
          src={current.url}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-3xl"
        />
      )}
      {current && (
        <img
          key={current.id}
          src={current.url}
          alt={current.label ? `Photo shared by ${current.label}` : "Guest-submitted photo"}
          className={`absolute inset-0 h-full w-full animate-in fade-in duration-1000 ${
            fill ? "object-cover" : "object-contain"
          } ${isTv && !fill ? "wall-kenburns" : ""}`}
        />
      )}

      {empty && loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-400/80">Photo Wall</p>
          <h1 className="mt-2 font-serif text-4xl">Couldn't load photos</h1>
          <p className="mt-4 max-w-md text-white/70">
            We're having trouble reaching photo storage right now. This will retry automatically,
            and if it keeps happening, check your connection or try refreshing.
          </p>
        </div>
      )}

      {empty && !loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">Photo Wall</p>
          <h1 className={`mt-2 font-serif ${chrome.emptyTitle}`}>{title}</h1>
          <p className={`mt-4 max-w-xl text-white/70 ${chrome.emptyBody}`}>
            No photos yet. Scan to add the first one.
          </p>
          {qr && (
            <img
              src={qr}
              alt="Upload QR"
              className={`mt-8 max-w-[70vw] rounded-2xl bg-white p-4 ${chrome.emptyQr}`}
            />
          )}
          <p className={`mt-4 break-all text-white/60 ${chrome.emptyBody}`}>{shortUrl}</p>
        </div>
      )}

      {/* One overlay layer, padded from the screen edges and the phone's safe
          areas, so nothing clips or lands under the browser bar. */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <div
          className={`flex h-full flex-col justify-between ${chrome.pad} ${
            isTv ? "pb-32" : "pb-24"
          }`}
        >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          {!empty && (
            <div
              className={`pointer-events-auto min-w-0 rounded-2xl bg-black/50 backdrop-blur transition-opacity duration-500 ${
                chrome.cardPad
              } ${idle ? "opacity-0" : "opacity-100"}`}
            >
              <p
                className={`font-semibold uppercase tracking-[0.3em] text-white/60 ${chrome.kicker}`}
              >
                Photo Wall
              </p>
              <p className={`truncate font-serif leading-tight ${chrome.title}`}>{title}</p>
            </div>
          )}
          {/* On a phone the controls would eat the photo, so they collapse
              behind one button and open on demand. */}
          {compactControls && (
            <button
              type="button"
              onClick={() => setPanelOpen((o) => !o)}
              aria-expanded={panelOpen}
              className={`pointer-events-auto rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/80 backdrop-blur transition-opacity duration-500 ${
                idle ? "opacity-0" : "opacity-100"
              }`}
            >
              {panelOpen ? "Close" : "Display"}
            </button>
          )}
          <div
            style={compactControls && !panelOpen ? { display: "none" } : undefined}
            className={`pointer-events-auto flex flex-wrap items-center justify-end gap-2 transition-opacity duration-500 ${
              idle ? "opacity-0" : "opacity-100"
            } ${compactControls && panelOpen ? "col-span-2 mt-2" : ""}`}
          >
            <label className="sr-only" htmlFor="wall-size">
              Screen size
            </label>
            <select
              id="wall-size"
              value={tv === "1" ? "tv" : choice}
              onChange={(e) => setChoice(e.target.value as DisplayChoice)}
              className="rounded-full bg-black/70 px-3 py-1.5 text-xs text-white backdrop-blur [color-scheme:dark]"
              style={{ colorScheme: "dark" }}
            >
              <option value="auto" className="bg-neutral-900 text-white">Fit this screen</option>
              <option value="phone" className="bg-neutral-900 text-white">Phone</option>
              <option value="tablet" className="bg-neutral-900 text-white">Tablet</option>
              <option value="laptop" className="bg-neutral-900 text-white">Laptop</option>
              <option value="tv" className="bg-neutral-900 text-white">TV</option>
            </select>
            <label className="sr-only" htmlFor="wall-pace">
              Time between photos
            </label>
            <select
              id="wall-pace"
              value={String(pace)}
              onChange={(e) => {
                const next = Number(e.target.value);
                setPace(next);
                writePace(next);
              }}
              className="rounded-full bg-black/70 px-3 py-1.5 text-xs text-white backdrop-blur [color-scheme:dark]"
              style={{ colorScheme: "dark" }}
            >
              {PACE_STEPS.map((p) => (
                <option key={p} value={String(p)} className="bg-neutral-900 text-white">
                  {PACE_LABELS[String(p)]} ({Math.round((chrome.rotateMs * p) / 1000)}s)
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/80 backdrop-blur hover:bg-white/20"
            >
              {paused ? "Resume slides" : "Hold this photo"}
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/80 backdrop-blur hover:bg-white/20"
            >
              Fullscreen
            </button>
            <button
              type="button"
              onClick={() => setFill((f) => !f)}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/80 backdrop-blur hover:bg-white/20"
            >
              {fill ? "Show whole photo" : "Fill the screen"}
            </button>
            <Link
              to="/wall/$eventId/upload"
              params={{ eventId }}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/80 backdrop-blur hover:bg-white/20"
            >
              + Add photos
            </Link>
            <Link
              to="/invite/$eventId"
              params={{ eventId }}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/70 backdrop-blur hover:bg-white/20"
            >
              ← Back to invite
            </Link>
          </div>
        </div>

        {/* Bottom-left stack. The music transport sits centred above it and the
            AI concierge keeps the bottom-right corner, so nothing overlaps. */}
        {!empty && (
          <div
            className={`pointer-events-auto flex flex-col items-start gap-2 transition-opacity duration-500 ${
              idle ? "opacity-0" : "opacity-100"
            }`}
          >
            {!chrome.compactQr && qr && (
              <div className={`flex items-end gap-3 rounded-2xl bg-black/60 backdrop-blur ${chrome.cardPad}`}>
                <img
                  src={qr}
                  alt="Scan to add photos"
                  className={`shrink-0 rounded-xl bg-white ${chrome.qrPad} ${chrome.qr}`}
                />
                <div className="min-w-0 max-w-[min(60vw,340px)] leading-snug">
                  <p className={`font-semibold text-white ${chrome.title}`}>Scan to add your photos</p>
                  <p className={`mt-1 break-all text-white/60 ${chrome.emptyBody}`}>{shortUrl}</p>
                </div>
              </div>
            )}
            <div className={`rounded-full bg-black/50 text-white/70 backdrop-blur ${chrome.counter}`}>
              {(index % photos.length) + 1} / {photos.length}
              {paused ? <span className="ml-3 text-white/50">Holding</span> : null}
              {current?.label ? <span className="ml-3 text-white/50">{current.label}</span> : null}
            </div>
          </div>
        )}
        </div>
      </div>


      <WallMusicPlayer
        eventId={eventId}
        compact={!isTv}
        hidden={idle}
        onTempo={setBpm}
        noCrossfade={!!event?.wallNoCrossfade}
        silent={!!event?.wallSilent}
      />
    </div>
  );
}
