import { toast } from "sonner";
import { pushUndo, clearUndo } from "@/lib/undo-stack";

/**
 * Run a destructive action with a 5-second "Undo" window.
 *
 * @example
 *   undoableAction({
 *     label: "Event archived",
 *     commit: async () => { await archiveEvent(id); },
 *     undo: async () => { await restoreEvent(id); },
 *   });
 *
 * The `commit` runs immediately so the UI updates; if the user hits Undo
 * within the window, `undo` runs to restore. If you need to defer the
 * commit (e.g. true "send later" emails), pass `deferMs`.
 */
export function undoableAction(opts: {
  label: string;
  description?: string;
  commit: () => void | Promise<void>;
  undo: () => void | Promise<void>;
  /** How long the on-screen toast stays visible. */
  durationMs?: number;
  /**
   * How long the entry stays usable from menu-based entry points (the mobile
   * action dock's "Undo last action"). Independent of the toast duration:
   * reaching a menu item takes longer than tapping the toast.
   */
  stackDurationMs?: number;
  deferMs?: number;
}) {
  const duration = opts.durationMs ?? 5000;
  const stackDuration = Math.max(duration, opts.stackDurationMs ?? 18000);

  // Immediate path: run commit now, surface Undo toast.
  if (!opts.deferMs) {
    void Promise.resolve(opts.commit()).catch((e) => {
      console.error("[undoableAction] commit failed", e);
    });
    const undoId = pushUndo({
      label: opts.label,
      expiresAt: Date.now() + stackDuration,
      undo: opts.undo,
    });
    toast(opts.label, {
      description: opts.description,
      duration,
      action: {
        label: "Undo",
        onClick: () => {
          clearUndo(undoId);
          void Promise.resolve(opts.undo()).catch((e) => {
            console.error("[undoableAction] undo failed", e);
            toast.error("Couldn't undo — please retry");
          });
        },
      },
    });
    return;
  }

  // Deferred path: hold the commit until the toast expires, allow cancel.
  let cancelled = false;
  toast(opts.label, {
    description: opts.description ?? `Undoing in ${Math.round(duration / 1000)}s`,
    duration,
    action: {
      label: "Undo",
      onClick: () => {
        cancelled = true;
      },
    },
  });
  setTimeout(() => {
    if (cancelled) return;
    void Promise.resolve(opts.commit()).catch((e) => {
      console.error("[undoableAction] deferred commit failed", e);
      toast.error("Action failed");
    });
  }, duration);
}
