import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * Keeps a composer's typed content alive across navigation and reloads.
 *
 * Same class of bug as the thank-you card overwrite: a host types a long
 * message, taps away for one detail, and the panel remounts with empty (or
 * regenerated default) fields. This stores the in-progress values locally,
 * restores them once after hydration, and hands back a `clear()` for the
 * success path so a sent message never comes back as a ghost draft.
 *
 * Local-only on purpose: it never touches the synced event record, so it
 * cannot overwrite server-side content.
 */
export function useLocalDraft<T extends Record<string, unknown>>(
  key: string,
  value: T,
  onRestore: (value: T) => void,
  isEmpty: (value: T) => boolean,
): () => void {
  const restored = useRef(false);
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;
  const emptyRef = useRef(isEmpty);
  emptyRef.current = isEmpty;

  // Effects only run in the browser, so reading storage here (not in a state
  // initializer) keeps SSR and the first client render identical.
  useEffect(() => {
    restored.current = false;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        if (parsed && typeof parsed === "object" && !emptyRef.current(parsed)) restoreRef.current(parsed);
      }
    } catch {
      // private mode / quota / corrupt entry — drafts are best effort
    }
    restored.current = true;
  }, [key]);

  const serialized = useMemo(() => {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }, [value]);

  useEffect(() => {
    if (!restored.current || !serialized) return;
    try {
      if (emptyRef.current(value)) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, serialized);
    } catch {
      // ignore
    }
    // `value` is intentionally read through the serialized snapshot
  }, [key, serialized]); // eslint-disable-line react-hooks/exhaustive-deps

  return useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, [key]);
}
