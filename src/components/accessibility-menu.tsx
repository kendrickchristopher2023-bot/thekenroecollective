import { useEffect, useState } from "react";

const SIZE_KEY = "kcc.a11y.textSize";
const CONTRAST_KEY = "kcc.a11y.highContrast";

const SIZES = [
  { id: "sm", label: "Small", scale: "93.75%" },   // 15px
  { id: "md", label: "Default", scale: "100%" },   // 16px
  { id: "lg", label: "Large", scale: "115%" },     // ~18.4px
  { id: "xl", label: "Extra Large", scale: "130%" }, // ~20.8px
] as const;

type SizeId = (typeof SIZES)[number]["id"];

function applyTextSize(id: SizeId) {
  if (typeof document === "undefined") return;
  const size = SIZES.find((s) => s.id === id) ?? SIZES[1];
  document.documentElement.style.fontSize = size.scale;
}

function applyContrast(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("high-contrast", on);
}

/** Shared text-size / high-contrast state, so both the standalone menu and
 * the consolidated desktop "Display settings" menu use the same source of
 * truth instead of duplicating this logic. */
export function useAccessibilityPrefs() {
  const [size, setSizeState] = useState<SizeId>("md");
  const [contrast, setContrastState] = useState(false);

  useEffect(() => {
    try {
      const savedSize = (localStorage.getItem(SIZE_KEY) as SizeId | null) ?? "md";
      const savedContrast = localStorage.getItem(CONTRAST_KEY) === "1";
      setSizeState(savedSize);
      setContrastState(savedContrast);
      applyTextSize(savedSize);
      applyContrast(savedContrast);
    } catch { /* ignore */ }
  }, []);

  function pickSize(id: SizeId) {
    setSizeState(id);
    applyTextSize(id);
    try { localStorage.setItem(SIZE_KEY, id); } catch { /* ignore */ }
  }
  function toggleContrast() {
    setContrastState((prev) => {
      const next = !prev;
      applyContrast(next);
      try { localStorage.setItem(CONTRAST_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  return { size, contrast, pickSize, toggleContrast, SIZES };
}
