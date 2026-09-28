import { useEffect, useState } from "react";

/**
 * Beginner ("simple") vs expert ("all tools") mode.
 *
 * Simple mode never removes a capability: it only hides optional wizard steps
 * and advanced panels behind an explicit switch, so a first-time or
 * non-technical host sees the short path (what/when/where, hosts, look,
 * guests, send, save) instead of eleven steps.
 *
 * Stored in localStorage and broadcast with a window event so every mounted
 * consumer stays in sync without a reload.
 */
export type UiMode = "simple" | "expert";

const KEY = "kcc.ui.mode";
const EVENT = "kcc:ui-mode";

export function readUiMode(): UiMode {
  if (typeof window === "undefined") return "simple";
  try {
    return localStorage.getItem(KEY) === "expert" ? "expert" : "simple";
  } catch {
    return "simple";
  }
}

export function setUiMode(mode: UiMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));
  }
}

export function useUiMode() {
  // Start in the SSR-safe default and read storage after mount, so the first
  // paint can never hydration-mismatch.
  const [mode, setMode] = useState<UiMode>("simple");

  useEffect(() => {
    setMode(readUiMode());
    const onChange = () => setMode(readUiMode());
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return {
    mode,
    simple: mode === "simple",
    expert: mode === "expert",
    setMode: (next: UiMode) => {
      setMode(next);
      setUiMode(next);
    },
    toggle: () => {
      const next: UiMode = readUiMode() === "simple" ? "expert" : "simple";
      setMode(next);
      setUiMode(next);
    },
  };
}
