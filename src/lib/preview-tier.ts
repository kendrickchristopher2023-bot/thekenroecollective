// Owner-only "preview as tier" override. Purely client-side — it changes
// what UI gates render so an owner can verify what each paying tier sees.
// Does NOT change server-side authorization (owners still have full DB access).
import { useEffect, useState } from "react";

export type PreviewTier = "postcard" | "whisper" | "host" | "atelier" | null;

const KEY = "kenroes:preview-tier";
const EVENT = "kenroes:preview-tier-changed";

export function getPreviewTier(): PreviewTier {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY);
  if (v === "postcard" || v === "whisper" || v === "host" || v === "atelier") return v;
  return null;
}

export function setPreviewTier(tier: PreviewTier) {
  if (typeof window === "undefined") return;
  if (tier === null) window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, tier);
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Subscribe to preview-tier changes (same tab + cross-tab via storage). Returns an unsubscribe function. */
export function onPreviewTierChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function usePreviewTier(): PreviewTier {
  // Initialize to null so SSR markup matches the first client render.
  // Reading localStorage in useState would produce a hydration mismatch
  // (React error #418/#419) when an owner has a preview tier persisted.
  const [tier, setTier] = useState<PreviewTier>(null);
  useEffect(() => {
    setTier(getPreviewTier());
    const onChange = () => setTier(getPreviewTier());
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return tier;
}
