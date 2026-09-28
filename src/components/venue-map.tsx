import { useMemo, useRef, useState } from "react";
import { LayoutGrid, Move, RotateCcw } from "lucide-react";
import {
  autoArrangeVenueMap,
  clearVenueMapPositions,
  setTablePosition,
  type Guest,
  type KEvent,
  type SeatingTable,
} from "@/lib/events-store";

const ELEMENT_ICON: Record<string, string> = {
  dance_floor: "💃",
  dj_booth: "🎧",
  buffet: "🍽️",
  bar: "🍸",
  stage: "🎤",
  gift_table: "🎁",
  photo_booth: "📸",
  entrance: "🚪",
};

function partySize(g: Guest) {
  return Math.max(1, (g.adults ?? 1) + (g.children ?? 0));
}

/**
 * Fallback grid position for a table the host has never dragged, so the map is
 * usable the moment it opens instead of stacking everything at one corner.
 */
function fallbackPosition(index: number, total: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows = Math.ceil(total / cols);
  return {
    x: (((index % cols) + 0.5) / cols) * 100,
    y: ((Math.floor(index / cols) + 0.5) / rows) * 100,
  };
}

/**
 * Drag-and-drop venue floor plan. Tables and venue elements keep a percentage
 * position on the event, so the layout survives a reload and matches the room
 * the host is actually standing in.
 */
export function VenueMap({ event, eventId }: { event: KEvent; eventId: string }) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const all = event.seatingTables ?? [];

  const placed = useMemo(
    () =>
      all.map((t, i) => {
        const fb = fallbackPosition(i, all.length);
        return {
          table: t,
          x: t.x ?? fb.x,
          y: t.y ?? fb.y,
        };
      }),
    [all],
  );

  const seatsUsed = (t: SeatingTable) =>
    t.guestIds
      .map((id) => event.guests.find((g) => g.id === id))
      .filter((g): g is Guest => !!g)
      .reduce((n, g) => n + partySize(g), 0);

  const moveTo = (id: string, clientX: number, clientY: number) => {
    const box = boardRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return;
    setTablePosition(
      eventId,
      id,
      ((clientX - box.left) / box.width) * 100,
      ((clientY - box.top) / box.height) * 100,
    );
  };

  const nudge = (t: SeatingTable, index: number, dx: number, dy: number) => {
    const fb = fallbackPosition(index, all.length);
    setTablePosition(eventId, t.id, (t.x ?? fb.x) + dx, (t.y ?? fb.y) + dy);
  };

  if (!all.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-serif text-lg text-ink">Venue map</h3>
          <p className="text-xs text-muted-foreground">
            Drag each table or element where it sits in the room. Arrow keys nudge a selected
            item, hold Shift for bigger steps.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => autoArrangeVenueMap(eventId)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-card px-4 py-2 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-ink/5"
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Auto arrange
          </button>
          <button
            type="button"
            onClick={() => clearVenueMapPositions(eventId)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-card px-4 py-2 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-ink/5"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset layout
          </button>
        </div>
      </div>

      <div
        ref={boardRef}
        className="relative w-full overflow-hidden rounded-2xl bg-secondary/40 ring-1 ring-ink/10"
        style={{
          aspectRatio: "3 / 2",
          backgroundImage:
            "linear-gradient(to right, rgba(120,120,120,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,120,120,0.12) 1px, transparent 1px)",
          backgroundSize: "8% 12%",
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          e.preventDefault();
          moveTo(dragging, e.clientX, e.clientY);
        }}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
      >
        {placed.map(({ table: t, x, y }, index) => {
          const isElement = t.kind === "element";
          const used = isElement ? 0 : seatsUsed(t);
          const round = !isElement && (t.shape === "round" || t.shape === "sweetheart");
          return (
            <button
              key={t.id}
              type="button"
              aria-label={`${t.label} position`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                setDragging(t.id);
              }}
              onPointerUp={() => setDragging(null)}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 5 : 1;
                if (e.key === "ArrowLeft") nudge(t, index, -step, 0);
                else if (e.key === "ArrowRight") nudge(t, index, step, 0);
                else if (e.key === "ArrowUp") nudge(t, index, 0, -step);
                else if (e.key === "ArrowDown") nudge(t, index, 0, step);
                else return;
                e.preventDefault();
              }}
              className={`absolute flex min-h-[56px] min-w-[56px] max-w-[30%] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none flex-col items-center justify-center gap-0.5 px-2 py-1 text-center ring-1 transition ${
                round ? "rounded-full" : "rounded-xl"
              } ${
                isElement
                  ? "bg-ink/5 ring-ink/15 text-muted-foreground"
                  : "bg-card ring-ink/20 text-ink"
              } ${dragging === t.id ? "z-10 scale-105 ring-2 ring-ink/40" : ""}`}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <span className="text-[11px] font-medium leading-tight">
                {isElement ? `${ELEMENT_ICON[t.elementType ?? ""] ?? "▫️"} ` : ""}
                {t.label}
              </span>
              {!isElement && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {used}/{t.capacity}
                </span>
              )}
            </button>
          );
        })}
        <span className="pointer-events-none absolute bottom-2 right-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Move className="h-3 w-3" /> drag to place
        </span>
      </div>
    </div>
  );
}
