import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Play, X } from "lucide-react";
import { pickFilmCut, type SiteFilm } from "@/lib/site-films";

export type FilmDoorwayTarget = { name: string; href: string; is_external: boolean };

export type OpenFilmOptions = {
  film: SiteFilm;
  /** "watch": opened from the Watch button. "doorway": intercepted card click. */
  mode: "watch" | "doorway";
  venture?: FilmDoorwayTarget;
  /** Element to return focus to when the player closes. */
  opener: HTMLElement | null;
};

export type FilmPlayerHandle = { open: (opts: OpenFilmOptions) => void };

type Phase = "playing" | "blocked" | "ended";

type PlayerState = {
  open: boolean;
  film: SiteFilm | null;
  mode: "watch" | "doorway";
  venture: FilmDoorwayTarget | null;
  cut: "horizontal" | "vertical";
  phase: Phase;
};

const CLOSED: PlayerState = {
  open: false,
  film: null,
  mode: "watch",
  venture: null,
  cut: "horizontal",
  phase: "playing",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

/**
 * Full-screen film player for the ventures hub.
 *
 * The <video> element is always mounted (hidden, no src) so that `play()` can
 * be called synchronously inside the click that opened it. That is what lets
 * iPhone Safari start with sound. Nothing downloads until `open()` sets a src.
 */
export const FilmPlayer = forwardRef<FilmPlayerHandle>(function FilmPlayer(_, ref) {
  const [state, setState] = useState<PlayerState>(CLOSED);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();

  const close = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.removeAttribute("poster");
      v.load();
    }
    setState(CLOSED);
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener && typeof opener.focus === "function") {
      window.setTimeout(() => opener.focus(), 0);
    }
  }, []);

  /** Leave the film and go to the venture. Used by Skip, Close and Esc in doorway mode. */
  const venture = state.venture;
  const skipToVenture = useCallback(() => {
    close();
    if (!venture) return;
    if (venture.is_external) {
      window.open(venture.href, "_blank", "noopener,noreferrer");
    } else {
      void navigate({ to: venture.href });
    }
  }, [venture, close, navigate]);

  const dismiss = useCallback(() => {
    if (state.mode === "doorway" && state.phase !== "ended") skipToVenture();
    else close();
  }, [state.mode, state.phase, state.venture, skipToVenture, close]);

  const startPlayback = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const p = v.play();
    if (p && typeof p.then === "function") {
      p.then(() => setState((s) => (s.open ? { ...s, phase: "playing" } : s))).catch(() =>
        setState((s) => (s.open ? { ...s, phase: "blocked" } : s)),
      );
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      open: ({ film, mode, venture, opener }) => {
        const v = videoRef.current;
        if (!v) return;
        const cut = pickFilmCut();
        openerRef.current = opener;
        v.muted = false;
        v.poster = cut === "vertical" ? film.posterVertical : film.posterHorizontal;
        v.src = cut === "vertical" ? film.vertical : film.horizontal;
        v.currentTime = 0;
        setState({ open: true, film, mode, venture: venture ?? null, cut, phase: "playing" });
        // Inside the user's click, so iOS allows sound.
        startPlayback();
      },
    }),
    [startPlayback],
  );

  // Focus, Esc, focus trap and scroll lock while open.
  useEffect(() => {
    if (!state.open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
        return;
      }
      if (e.key !== "Tab" || !overlayRef.current) return;
      const nodes = Array.from(
        overlayRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !overlayRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !overlayRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [state.open, dismiss]);

  const onEnded = () => {
    if (state.mode === "doorway" && state.venture && !state.venture.is_external) {
      skipToVenture();
      return;
    }
    setState((s) => ({ ...s, phase: "ended" }));
    window.setTimeout(() => closeRef.current?.focus(), 0);
  };

  const watchAgain = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    setState((s) => ({ ...s, phase: "playing" }));
    startPlayback();
  };

  const { film, mode, cut, phase } = state;
  const doorway = mode === "doorway" && venture;
  const closeLabel = doorway && phase !== "ended" ? `Skip to ${venture.name}` : "Close";
  const btn =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold";

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={film ? `${film.title} film` : "Film"}
      hidden={!state.open}
      className="fixed inset-0 z-[120] bg-ink/95 text-paper backdrop-blur-sm"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 0.75rem)",
        paddingRight: "max(env(safe-area-inset-right), 0.75rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)",
        paddingLeft: "max(env(safe-area-inset-left), 0.75rem)",
      }}
    >
      <div className="relative flex h-full w-full items-center justify-center">
        <video
          ref={videoRef}
          controls
          playsInline
          preload="none"
          controlsList="nodownload"
          onEnded={onEnded}
          aria-label={film ? `${film.title} film` : undefined}
          className={`h-auto max-h-full max-w-full rounded-lg bg-ink shadow-2xl ${
            phase === "ended" ? "opacity-40" : ""
          }`}
          style={{
            objectFit: "contain",
            aspectRatio: cut === "vertical" ? "9 / 16" : "16 / 9",
            // Size the box to the film's ratio so the poster fills it edge to edge.
            width:
              cut === "vertical"
                ? "min(100%, calc((100dvh - 1.5rem) * 9 / 16))"
                : "min(100%, calc((100dvh - 1.5rem) * 16 / 9))",
          }}
        />

        {phase === "blocked" && film ? (
          <button
            type="button"
            onClick={startPlayback}
            aria-label={`Play ${film.title} film`}
            className="absolute inset-0 m-auto flex h-24 w-24 items-center justify-center rounded-full bg-paper text-velvet shadow-xl transition-transform hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-gold"
          >
            <Play className="ml-1 h-10 w-10" aria-hidden />
          </button>
        ) : null}

        {phase === "ended" && film ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-serif text-2xl text-paper">{film.title}</p>
            {doorway && venture.is_external ? (
              <a
                href={venture.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                className={`${btn} bg-gold text-ink hover:bg-gold/90`}
              >
                Continue to {venture.name}
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </a>
            ) : null}
            <button type="button" onClick={watchAgain} className={`${btn} bg-paper text-velvet hover:bg-paper/90`}>
              <Play className="h-4 w-4" aria-hidden />
              Watch again
            </button>
          </div>
        ) : null}

        <button
          ref={closeRef}
          type="button"
          onClick={dismiss}
          aria-label={closeLabel}
          className={`${btn} absolute right-2 top-2 bg-paper/95 text-ink shadow-lg hover:bg-paper`}
        >
          {doorway && phase !== "ended" ? (
            <>
              {closeLabel}
              {venture.is_external ? (
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              ) : (
                <span aria-hidden>→</span>
              )}
            </>
          ) : (
            <>
              <X className="h-4 w-4" aria-hidden />
              Close
            </>
          )}
        </button>
      </div>
    </div>
  );
});
