// Draggable floating element hook. Persists position per storage key.
// Returns a style + drag handle props. Falls back to default corner when
// no saved position exists. Constrained to viewport.
import { useCallback, useEffect, useRef, useState } from "react";

export type Pos = { x: number; y: number };

function clampToViewport(p: Pos, el: HTMLElement | null): Pos {
  if (typeof window === "undefined") return p;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const rect = el?.getBoundingClientRect();
  const ew = rect?.width ?? 200;
  const eh = rect?.height ?? 40;
  return {
    x: Math.min(Math.max(4, p.x), Math.max(4, w - ew - 4)),
    y: Math.min(Math.max(4, p.y), Math.max(4, h - eh - 4)),
  };
}

export function useDraggable(storageKey: string, defaultPos: () => Pos) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const posRef = useRef<Pos | null>(null);
  const dragging = useRef<{ dx: number; dy: number } | null>(null);

  const setSafePos = useCallback((next: Pos | null) => {
    posRef.current = next;
    setPos(next);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Pos;
        setSafePos(clampToViewport(parsed, ref.current));
        return;
      }
    } catch {}
    setSafePos(clampToViewport(defaultPos(), ref.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      const current = posRef.current;
      if (current) setSafePos(clampToViewport(current, ref.current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setSafePos]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined" || !ref.current) return;
    const observer = new ResizeObserver(() => {
      const current = posRef.current;
      if (current) setSafePos(clampToViewport(current, ref.current));
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [setSafePos]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!ref.current) return;
    // Ignore drags starting on interactive controls
    const target = e.target as HTMLElement;
    const explicitHandle = target.closest("[data-drag-handle]");
    if (!explicitHandle && target.closest("button, a, select, input, textarea, [role='listbox']")) return;
    const rect = ref.current.getBoundingClientRect();
    dragging.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const next = clampToViewport(
      { x: e.clientX - dragging.current.dx, y: e.clientY - dragging.current.dy },
      ref.current,
    );
    setSafePos(next);
  }, [setSafePos]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      const current = posRef.current;
      if (current) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(current));
        } catch {}
      }
    },
    [storageKey],
  );

  const style: React.CSSProperties = pos
    ? { position: "fixed", left: pos.x, top: pos.y, right: "auto", bottom: "auto", touchAction: "none" }
    : { position: "fixed", visibility: "hidden", touchAction: "none" };

  const handleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    style: { cursor: "grab" as const, touchAction: "none" as const },
  };

  return { ref, style, handleProps };
}
