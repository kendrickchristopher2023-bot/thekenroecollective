import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { getEventsSyncState, subscribeEventsSyncState, type EventsSyncState } from "@/lib/events-store";

/**
 * Quiet, non-blocking save-state indicator. It never blocks the page and never
 * shows a red dead-end error, but the host can always tell the difference
 * between "everything is on the server" (nothing shown) and "this change is
 * still only on this device" (visible pill).
 */
export function SyncStatusIndicator() {
  const [state, setState] = useState<EventsSyncState>("idle");

  useEffect(() => {
    setState(getEventsSyncState());
    return subscribeEventsSyncState(() => setState(getEventsSyncState()));
  }, []);

  if (state === "idle") return null;

  const offline = state === "offline";
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2"
    >
      <span
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-sm backdrop-blur ${
          offline
            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "border-border bg-background/90 text-muted-foreground"
        }`}
      >
        {offline ? (
          <CloudOff className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
        )}
        {offline ? "Working offline, changes saved on this device and syncing" : "Syncing changes"}
      </span>
    </div>
  );
}
