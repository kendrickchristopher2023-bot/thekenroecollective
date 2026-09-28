import { useEffect, useState } from "react";
import { AlertTriangle, Check, Wand2 } from "lucide-react";
import {
  evaluateDecorativeContrast,
  evaluateTextContrast,
  normalizeHexColor,
} from "@/lib/color-contrast";

/**
 * One control shape for every invite color role (card, frame, text) so the
 * design step reads as a single color system instead of three unrelated
 * pickers. Swatches, a color wheel, and a typed hex all write the same value.
 *
 * `contrastAgainst` turns on the readability safeguard: it warns (never blocks)
 * and offers a one-click same-hue shade that clears 4.5:1.
 */
export function ColorField({
  label,
  hint,
  value,
  swatches,
  onChange,
  onReset,
  resetLabel = "Match card color",
  contrastAgainst,
  contrastKind = "text",
  idPrefix,
}: {
  label: string;
  hint?: string;
  /** Undefined = inherit (no explicit color stored). */
  value: string | undefined;
  swatches: string[];
  onChange: (hex: string) => void;
  onReset?: () => void;
  resetLabel?: string;
  /** Effective background behind this color, enables the contrast check. */
  contrastAgainst?: string;
  contrastKind?: "text" | "decorative";
  idPrefix: string;
}) {
  const [draft, setDraft] = useState(value ?? "");

  // Keep the typed hex in step with external changes (theme presets, reset)
  // without stomping the host mid-keystroke.
  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const verdict = contrastAgainst
    ? contrastKind === "text"
      ? evaluateTextContrast(value, contrastAgainst)
      : evaluateDecorativeContrast(value, contrastAgainst)
    : null;

  const commit = (raw: string) => {
    const hex = normalizeHexColor(raw);
    if (hex) onChange(hex);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={`${idPrefix}-hex`} className="text-sm font-medium">
          {label}
        </label>
        {onReset && value ? (
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-muted-foreground underline decoration-dotted"
          >
            {resetLabel}
          </button>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {swatches.map((s) => {
          const active = normalizeHexColor(value) === normalizeHexColor(s);
          return (
            <button
              key={s}
              type="button"
              aria-label={`Use ${s}`}
              aria-pressed={active}
              onClick={() => onChange(normalizeHexColor(s) ?? s)}
              className={`size-7 rounded-full ring-1 ring-ink/15 transition ${active ? "ring-2 ring-offset-2 ring-velvet" : ""}`}
              style={{ backgroundColor: s }}
            />
          );
        })}
        <input
          id={`${idPrefix}-wheel`}
          type="color"
          aria-label={`${label} color wheel`}
          value={normalizeHexColor(value) ?? "#111111"}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className="size-8 cursor-pointer rounded-full border border-ink/10 bg-transparent p-0"
        />
        <input
          id={`${idPrefix}-hex`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(draft);
            }
          }}
          placeholder="#5b1a3a"
          spellCheck={false}
          className="w-28 rounded-full bg-card px-3 py-1.5 text-xs ring-1 ring-ink/10"
        />
      </div>

      {verdict ? (
        <div
          className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs ${
            verdict.level === "pass"
              ? "bg-emerald-500/10 text-emerald-800"
              : "bg-amber-500/10 text-amber-900"
          }`}
        >
          {verdict.level === "pass" ? (
            <Check className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{verdict.message}</span>
          {verdict.suggestion ? (
            <button
              type="button"
              onClick={() => onChange(verdict.suggestion!)}
              className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 font-medium ring-1 ring-ink/10"
            >
              <Wand2 className="size-3" aria-hidden="true" />
              Use a readable shade
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
