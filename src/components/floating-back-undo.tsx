// Floating pill in the bottom-left with Back and Undo.
// Draggable — position persists per-user. Hidden on the home page.
import { useRouter, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { useLatestUndo } from "@/lib/undo-stack";
import { useEffect, useState } from "react";
import { useDraggable } from "@/lib/use-draggable";

export function FloatingBackUndo() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const latest = useLatestUndo();
  const [canGoBack, setCanGoBack] = useState(false);

  const { ref, style, handleProps } = useDraggable("kenroes:pos:back-undo", () => {
    if (typeof window === "undefined") return { x: 16, y: 740 };
    const isMobile = window.innerWidth < 768;
    // On mobile place beneath the sticky nav on the left so it stays clear of
    // the concierge (bottom-right) and onboarding checklist (bottom-left).
    if (isMobile) return { x: 8, y: 110 };
    return { x: 16, y: window.innerHeight - 60 };
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCanGoBack(window.history.length > 1);
  }, [pathname]);

  if (pathname === "/") return null;

  const onBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      void router.navigate({ to: "/gatherings" });
    }
  };

  const onUndo = async () => {
    if (!latest) return;
    try {
      await latest.undo();
      toast.success("Undone");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't undo");
    }
  };

  return (
    <div
      ref={ref}
      style={style}
      data-notranslate
      className="z-40 flex items-center gap-1 rounded-full border border-ink/10 bg-paper/95 px-1 py-1.5 text-sm shadow-lg backdrop-blur-md print:hidden select-none"
      role="toolbar"
      aria-label="Navigation helpers"
    >
      <span
        {...handleProps}
        className="inline-flex h-11 w-11 cursor-grab items-center justify-center text-ink/40 hover:text-ink/70 active:cursor-grabbing"
        title="Drag to move"
        aria-label="Drag handle"
      >
        ⋮⋮
      </span>
      <button
        type="button"
        onClick={onBack}
        disabled={!canGoBack}
        className="inline-flex min-h-11 items-center gap-1 rounded-full px-4 py-2 font-medium text-ink transition hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
        title="Go back"
      >
        <span aria-hidden>←</span>
        <span>Back</span>
      </button>
      <span className="h-4 w-px bg-ink/15" aria-hidden />
      <button
        type="button"
        onClick={onUndo}
        disabled={!latest}
        className="inline-flex min-h-11 items-center gap-1 rounded-full px-4 py-2 font-medium text-ink transition hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
        title={latest ? `Undo: ${latest.label}` : "Nothing to undo"}
      >
        <span aria-hidden>↶</span>
        <span>Undo</span>
      </button>
    </div>
  );
}
