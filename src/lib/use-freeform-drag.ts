// Drag + resize for free-form design items.
// IMPORTANT: drag state lives in refs and the latest items/handlers are read
// through refs too. An earlier version kept `mode`/`activeId` as locals inside
// an effect whose dep array included the items array — every pointermove
// updated an item, which re-ran the effect, which reset the drag state to
// null. Result: an item nudged once and then froze. Do not put the items array
// back in this effect's dependency list.
import { useEffect, useRef } from "react";
import type { FreeformItem } from "@/lib/design-render";

export function useFreeformDrag(opts: {
  hostRef: React.RefObject<HTMLElement | null>;
  items: FreeformItem[];
  onUpdate: (id: string, patch: Partial<FreeformItem>) => void;
  onSelect: (id: string | null) => void;
}) {
  const latest = useRef(opts);
  latest.current = opts;

  useEffect(() => {
    const host = opts.hostRef.current;
    if (!host) return;

    let mode: "move" | "resize" | null = null;
    let activeId: string | null = null;
    let start = { x: 0, y: 0, ix: 0, iy: 0, iw: 0, ih: 0 };

    function svgEl(): SVGSVGElement | null {
      return (latest.current.hostRef.current?.querySelector("svg") as SVGSVGElement | null) ?? null;
    }

    function toSvg(e: PointerEvent) {
      const svg = svgEl();
      const ctm = svg?.getScreenCTM();
      if (!svg || !ctm) return { x: 0, y: 0 };
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const p = pt.matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    }

    function onDown(e: PointerEvent) {
      const target = e.target as Element | null;
      if (!target || !svgEl()?.contains(target)) return;
      const handle = target.closest("[data-ff-handle]");
      const group = target.closest("[data-ff-id]");
      if (!group) {
        latest.current.onSelect(null);
        return;
      }
      const id = group.getAttribute("data-ff-id")!;
      const it = latest.current.items.find((i) => i.id === id);
      latest.current.onSelect(id);
      if (!it) return;
      const p = toSvg(e);
      activeId = id;
      mode = handle ? "resize" : "move";
      start = { x: p.x, y: p.y, ix: it.x, iy: it.y, iw: it.w, ih: it.h };
      e.preventDefault();
    }

    function onMove(e: PointerEvent) {
      if (!mode || !activeId) return;
      const p = toSvg(e);
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      if (mode === "move") {
        latest.current.onUpdate(activeId, { x: Math.round(start.ix + dx), y: Math.round(start.iy + dy) });
      } else {
        latest.current.onUpdate(activeId, {
          w: Math.max(20, Math.round(start.iw + dx)),
          h: Math.max(20, Math.round(start.ih + dy)),
        });
      }
      e.preventDefault();
    }

    function onUp() {
      mode = null;
      activeId = null;
    }

    host.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // Bind once per host: all mutable data is read from `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
