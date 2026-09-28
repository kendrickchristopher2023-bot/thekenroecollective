import { useEffect, useState } from "react";
import { LANGUAGES, type LangCode } from "@/lib/i18n";

export function LanguagePicker({
  value,
  onChange,
  disabled,
  className,
  ariaLabel,
}: {
  value: string | null | undefined;
  onChange: (next: LangCode) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = (value as LangCode) || "en";
  const classes =
    className ??
    "rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm focus:border-velvet focus:outline-none disabled:opacity-70";

  if (!mounted) {
    return <span aria-hidden="true" className={classes}>{LANGUAGES.find((l) => l.code === current)?.native ?? "English"}</span>;
  }

  return (
    <select
      aria-label={ariaLabel ?? "Language"}
      disabled={disabled}
      value={current}
      onChange={(e) => onChange(e.target.value as LangCode)}
      className={classes}
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.native} ({l.label})
        </option>
      ))}
    </select>
  );
}
