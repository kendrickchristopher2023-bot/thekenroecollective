// Floating tier preview switcher. Only renders for owner accounts.
// Draggable — position persists per-user.
import { useEffect, useState } from "react";
import { meEntitlements } from "@/lib/pricing.functions";
import { isDemoRuntime } from "@/lib/demo-mode";
import { useAuthReady } from "@/hooks/use-auth-ready";
import { getPreviewTier, setPreviewTier, usePreviewTier, type PreviewTier } from "@/lib/preview-tier";
import { useDraggable } from "@/lib/use-draggable";

const TIERS: { id: Exclude<PreviewTier, null>; label: string }[] = [
  { id: "postcard", label: "Postcard" },
  { id: "whisper", label: "Whisper" },
  { id: "host", label: "Host" },
  { id: "atelier", label: "Atelier" },
];

function labelFor(t: PreviewTier, isOwner: boolean): string {
  if (!t) return isOwner ? "Owner view" : "Preview tier";
  return `Previewing: ${t.charAt(0).toUpperCase()}${t.slice(1)}`;
}

export function OwnerTierPreview() {
  const { ready: authReady, user } = useAuthReady();
  const [isOwner, setIsOwner] = useState(false);
  // In the demo environment anyone signed in can flip tiers, so prospects can
  // see what each plan looks like. Resolved in an effect to avoid SSR mismatch.
  const [isDemo, setIsDemo] = useState(false);
  const [open, setOpen] = useState(false);
  const preview = usePreviewTier();
  const { ref, style, handleProps } = useDraggable("kenroes:pos:owner-preview", () => {
    if (typeof window === "undefined") return { x: 16, y: 700 };
    const isMobile = window.innerWidth < 768;
    // On mobile stack under the Back/Undo pill on the left so they don't collide.
    if (isMobile) return { x: 8, y: 160 };
    return { x: 16, y: window.innerHeight - 120 };
  });

  useEffect(() => {
    setIsDemo(isDemoRuntime());
  }, []);

  useEffect(() => {
    let alive = true;
    if (!authReady) return;
    if (!user) {
      setIsOwner(false);
      return;
    }
    async function check() {
      try {
        const r = await meEntitlements();
        if (alive) setIsOwner(r.isOwner === true);
      } catch {
        if (alive) setIsOwner(false);
      }
    }

    check();
    return () => {
      alive = false;
    };
  }, [authReady, user?.id]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref]);

  if (!isOwner && !(isDemo && authReady && user)) return null;

  function pick(t: PreviewTier) {
    setOpen(false);
    setPreviewTier(t);
  }

  const label = labelFor(preview, isOwner);

  return (
    <div ref={ref} style={style} className="z-[60] flex items-center gap-1 print:hidden select-none">
      <span
        {...handleProps}
        className="inline-flex h-7 w-5 items-center justify-center rounded-full bg-background/80 text-foreground/40 shadow hover:text-foreground/70 active:cursor-grabbing"
        title="Drag to move"
        aria-label="Drag handle"
      >
        ⋮⋮
      </span>
      <div className="relative flex flex-col items-start gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`rounded-full border border-border px-3 py-1.5 text-xs font-medium shadow-lg transition ${
            preview
              ? "bg-amber-500 text-black hover:bg-amber-400"
              : "bg-background text-foreground hover:bg-accent"
          }`}
        >
          {label}
        </button>
        {open && (
          <div className="absolute bottom-full left-0 mb-2 rounded-lg border border-border bg-popover p-3 shadow-xl">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Preview as tier
            </div>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => pick(null)}
                className={`rounded-md px-3 py-1.5 text-left text-sm transition ${
                  preview === null
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                {isOwner ? "Owner (full access)" : "My plan (no preview)"}
              </button>
              {TIERS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pick(t.id)}
                  className={`rounded-md px-3 py-1.5 text-left text-sm transition ${
                    preview === t.id
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-accent"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-2 max-w-[16rem] text-[10px] leading-tight text-muted-foreground">
              UI-only preview. Your account permissions are unchanged.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export { getPreviewTier };
