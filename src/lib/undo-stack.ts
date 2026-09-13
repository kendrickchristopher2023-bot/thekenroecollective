// Global undo stack. Any call to `undoableAction` also pushes here so the
// floating Back/Undo pill can trigger the most recent undo anywhere in the app.
import { useSyncExternalStore } from "react";

export type UndoEntry = {
  id: string;
  label: string;
  expiresAt: number;
  undo: () => void | Promise<void>;
};

let stack: UndoEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  const now = Date.now();
  stack = stack.filter((e) => e.expiresAt > now);
  listeners.forEach((l) => l());
}

export function pushUndo(entry: Omit<UndoEntry, "id">) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  stack = [...stack, { ...entry, id }];
  emit();
  const ms = Math.max(0, entry.expiresAt - Date.now());
  setTimeout(emit, ms + 50);
  return id;
}

export function popLatestUndo(): UndoEntry | null {
  const now = Date.now();
  const live = stack.filter((e) => e.expiresAt > now);
  if (!live.length) return null;
  const latest = live[live.length - 1];
  stack = live.filter((e) => e.id !== latest.id);
  emit();
  return latest;
}

export function clearUndo(id: string) {
  stack = stack.filter((e) => e.id !== id);
  emit();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useLatestUndo(): UndoEntry | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      const now = Date.now();
      const live = stack.filter((e) => e.expiresAt > now);
      return live.length ? live[live.length - 1] : null;
    },
    () => null,
  );
}
