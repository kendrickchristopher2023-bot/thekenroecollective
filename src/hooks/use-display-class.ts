import { useEffect, useState } from "react";

/**
 * Which kind of screen the Photo Wall is being shown on. This is deliberately
 * about physical viewing distance, not the operating system: a laptop plugged
 * into a projector should read as "tv", and a big tablet held in the hand
 * should not.
 */
export type DisplayClass = "phone" | "tablet" | "laptop" | "tv";

/** What a host can force from the wall's size control. */
export type DisplayChoice = "auto" | DisplayClass;

const STORE_KEY = "kenroe:wall-display";

/** Read the current screen and decide which of the four looks fits it. */
export function detectDisplayClass(): DisplayClass {
  if (typeof window === "undefined") return "laptop";
  const w = window.innerWidth;
  const fine = window.matchMedia?.("(pointer: fine)").matches ?? true;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  // A mouse or trackpad means someone is sitting at the machine, so even a wide
  // 1920 laptop stays laptop-sized. Only genuinely huge canvases read as TV.
  if (w >= 2400) return "tv";
  // Big screen driven without a mouse: a TV, projector or kiosk. The 1600px
  // floor keeps large handheld tablets (iPad Pro landscape ≈ 1366-1376, touch
  // only) out of the TV look — they're held in the hand, not across a room.
  if (w >= 1600 && !fine) return "tv";
  if (w >= 1024) return "laptop";
  if (w >= 640 || (coarse && w >= 600)) return "tablet";
  return "phone";
}


export function readDisplayChoice(): DisplayChoice {
  if (typeof window === "undefined") return "auto";
  try {
    const v = window.localStorage.getItem(STORE_KEY);
    if (v === "phone" || v === "tablet" || v === "laptop" || v === "tv" || v === "auto") return v;
  } catch {
    /* storage blocked: auto is a fine default */
  }
  return "auto";
}

export function writeDisplayChoice(choice: DisplayChoice) {
  try {
    window.localStorage.setItem(STORE_KEY, choice);
  } catch {
    /* nothing to do; the session still works */
  }
}

/**
 * Size the wall to the screen it's on. `forced` wins over everything (that is
 * how the existing ?tv=1 link keeps working), then the host's remembered
 * choice, then automatic detection. Server render always starts at "laptop" and
 * the real value lands after hydration so nothing mismatches.
 */
export function useDisplayClass(forced?: DisplayClass): {
  display: DisplayClass;
  choice: DisplayChoice;
  setChoice: (next: DisplayChoice) => void;
} {
  const [choice, setChoiceState] = useState<DisplayChoice>("auto");
  const [detected, setDetected] = useState<DisplayClass>("laptop");

  useEffect(() => {
    setChoiceState(readDisplayChoice());
    const sync = () => setDetected(detectDisplayClass());
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  const setChoice = (next: DisplayChoice) => {
    setChoiceState(next);
    writeDisplayChoice(next);
  };

  const display = forced ?? (choice === "auto" ? detected : choice);
  return { display, choice, setChoice };
}
