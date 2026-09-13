import { useEffect, useRef, useState } from "react";
import { saveEventsNow } from "@/lib/events-store";

type State = "idle" | "saving" | "saved" | "error";

/**
 * Explicit save trigger that sits alongside autosave. It does not implement a
 * second save mechanism: it flushes the same pending-push queue autosave uses
 * and surfaces the result so a failed cloud sync becomes a retryable action
 * instead of something the host only notices later.
 */
export function SaveNowButton({
  eventId,
  className,
  label = "Save",
  size = "md",
}: {
  eventId?: string;
  className?: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const run = async () => {
    if (state === "saving") return;
    setState("saving");
    const ok = await saveEventsNow(eventId);
    setState(ok ? "saved" : "error");
    if (ok) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 2500);
    }
  };

  const pad = size === "sm" ? "px-3 py-1.5 text-[11px]" : "px-4 py-2 text-xs";
  const tone =
    state === "error"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : state === "saved"
        ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-700"
        : "border-ink/15 bg-background text-foreground hover:bg-secondary/40";

  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <button
        type="button"
        onClick={run}
        disabled={state === "saving"}
        aria-label={state === "error" ? "Retry saving to the cloud" : "Save now"}
        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border font-medium transition disabled:opacity-70 ${pad} ${tone}`}
      >
        {state === "saving" && <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />}
        {state === "saved" && <span aria-hidden>✓</span>}
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Retry save" : label}
      </button>
      {state === "error" && (
        <span role="status" className="text-[11px] text-destructive">
          Couldn't sync to the cloud. Saved on this device only.
        </span>
      )}
    </span>
  );
}
