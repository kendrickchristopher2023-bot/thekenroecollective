/**
 * Reposition control for user-uploaded photos.
 *
 * Hosts drag the photo inside a preview shaped like the real frame to choose
 * what stays visible, and use a zoom slider when the fix is pulling back
 * rather than shifting. Nothing is re-encoded: the choice is stored as a focal
 * point on the URL (see src/lib/image-focal.ts).
 *
 * Accessibility: dragging is never the only way in. Every adjustment is also
 * reachable with Top / Center / Bottom presets, arrow nudge buttons (which are
 * real focusable buttons, and also respond to arrow keys on the frame itself),
 * a "Fit whole photo" toggle and "Reset to center". All controls are at least
 * 44px tall for touch and for anyone with limited dexterity.
 */
import { useCallback, useRef, useState } from "react";
import { Maximize2, MoveHorizontal, RotateCcw } from "lucide-react";
import {
  DEFAULT_FOCAL,
  type Focal,
  focalImageStyle,
  isDefaultFocal,
  normalizeFocal,
  parseFocalUrl,
  withFocalUrl,
} from "@/lib/image-focal";

/** Renders any stored image URL honoring its focal point. */
export function FocalImage({
  url,
  alt,
  className,
  style,
  loading,
  decoding,
}: {
  url: string | null | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  loading?: "lazy" | "eager";
  decoding?: "async" | "sync" | "auto";
}) {
  const { src, focal } = parseFocalUrl(url);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      style={{ ...focalImageStyle(focal), ...style }}
    />
  );
}

const BTN =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-medium text-ink hover:bg-ink/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-velvet";

export function ImageFocalControl({
  url,
  onChange,
  aspectClassName = "aspect-video",
  round = false,
  label = "Reposition photo",
  hint = "Drag the photo to choose what shows, or use the buttons below.",
}: {
  /** Stored URL, possibly already carrying a focal point. */
  url: string;
  /** Receives the URL with the updated focal point. */
  onChange: (nextUrl: string) => void;
  /** Tailwind aspect class matching the frame this image renders in. */
  aspectClassName?: string;
  /** Circular preview, for avatar-style frames. */
  round?: boolean;
  label?: string;
  hint?: string;
}) {
  const { src, focal: stored } = parseFocalUrl(url);
  const [focal, setFocal] = useState<Focal>(stored);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; from: Focal } | null>(null);

  const commit = useCallback(
    (next: Focal) => {
      const n = normalizeFocal(next);
      setFocal(n);
      onChange(withFocalUrl(url, n));
    },
    [onChange, url],
  );

  if (!src) return null;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (focal.fit === "contain") return;
    const el = frameRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: focal };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = frameRef.current;
    if (!d || d.id !== e.pointerId || !el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    // Dragging the photo right reveals more of its left side, so the focal
    // point moves the opposite way. Divide by scale so zoomed-in drags feel
    // proportional rather than twitchy.
    const dx = ((e.clientX - d.x) / Math.max(1, rect.width)) * 100;
    const dy = ((e.clientY - d.y) / Math.max(1, rect.height)) * 100;
    commit({ ...d.from, x: d.from.x - dx / focal.scale, y: d.from.y - dy / focal.scale });
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }

  function nudge(dx: number, dy: number) {
    commit({ ...focal, x: focal.x + dx, y: focal.y + dy });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 10 : 4;
    const map: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const move = map[e.key];
    if (!move) return;
    e.preventDefault();
    nudge(move[0], move[1]);
  }

  const isDefault = isDefaultFocal(focal);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <MoveHorizontal className="h-4 w-4 text-velvet" aria-hidden="true" />
        {label}
      </div>

      <div
        ref={frameRef}
        role="group"
        aria-label={`${label}. Use the arrow keys, or the buttons below, to move the photo inside the frame.`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={`relative w-full select-none overflow-hidden bg-secondary ring-1 ring-ink/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-velvet ${
          round ? "mx-auto aspect-square max-w-[220px] rounded-full" : `rounded-xl ${aspectClassName}`
        } ${focal.fit === "contain" ? "cursor-default" : "cursor-grab touch-none active:cursor-grabbing"}`}
      >
        <img
          src={src}
          alt="Preview of how this photo will be cropped"
          draggable={false}
          className="pointer-events-none h-full w-full"
          style={focalImageStyle(focal)}
        />
      </div>

      <p className="text-xs text-muted-foreground">{hint}</p>

      {/* Presets: the simplest possible path for anyone who cannot drag. */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Show top", y: 0 },
          { label: "Show middle", y: 50 },
          { label: "Show bottom", y: 100 },
        ].map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => commit({ ...focal, y: p.y, fit: "cover" })}
            aria-pressed={focal.fit === "cover" && focal.y === p.y}
            className={`${BTN} ${focal.fit === "cover" && focal.y === p.y ? "bg-velvet/15 text-velvet" : ""}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Nudge pad */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Move photo:</span>
        <button type="button" className={BTN} onClick={() => nudge(0, -4)} aria-label="Move photo up">
          ↑
        </button>
        <button type="button" className={BTN} onClick={() => nudge(0, 4)} aria-label="Move photo down">
          ↓
        </button>
        <button type="button" className={BTN} onClick={() => nudge(-4, 0)} aria-label="Move photo left">
          ←
        </button>
        <button type="button" className={BTN} onClick={() => nudge(4, 0)} aria-label="Move photo right">
          →
        </button>
      </div>

      {/* Zoom */}
      <div className="space-y-1">
        <label className="flex items-center justify-between text-xs font-medium text-ink">
          <span>Zoom</span>
          <span className="text-muted-foreground">
            {focal.fit === "contain" ? "Whole photo" : `${Math.round(focal.scale * 100)}%`}
          </span>
        </label>
        <input
          type="range"
          min={100}
          max={300}
          step={5}
          value={Math.round(focal.scale * 100)}
          disabled={focal.fit === "contain"}
          onChange={(e) => commit({ ...focal, scale: Number(e.target.value) / 100 })}
          aria-label="Zoom the photo in or out"
          className="h-11 w-full accent-velvet disabled:opacity-40"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${BTN} ${focal.fit === "contain" ? "bg-velvet/15 text-velvet" : ""}`}
          aria-pressed={focal.fit === "contain"}
          onClick={() =>
            commit(
              focal.fit === "contain"
                ? { ...focal, fit: "cover" }
                : { ...focal, fit: "contain", scale: 1 },
            )
          }
        >
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
          {focal.fit === "contain" ? "Fill the frame" : "Fit whole photo"}
        </button>
        <button
          type="button"
          className={BTN}
          disabled={isDefault}
          onClick={() => commit(DEFAULT_FOCAL)}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reset to center
        </button>
      </div>
    </div>
  );
}

/**
 * Self-contained "Reposition" toggle + control. Drop it next to any existing
 * upload UI without that surface having to manage open/closed state.
 */
export function FocalAdjuster({
  url,
  onChange,
  aspectClassName,
  round,
  label,
}: {
  url: string | null | undefined;
  onChange: (nextUrl: string) => void;
  aspectClassName?: string;
  round?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!url) return null;
  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-secondary px-4 text-xs font-medium text-ink hover:bg-ink/10"
      >
        <MoveHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        {open ? "Done adjusting" : "Reposition"}
      </button>
      {open && (
        <div className="mt-3 rounded-xl border border-ink/10 bg-paper/70 p-3">
          <ImageFocalControl
            url={url}
            onChange={onChange}
            aspectClassName={aspectClassName}
            round={round}
            label={label ?? "Reposition photo"}
          />
        </div>
      )}
    </div>
  );
}
