import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

/**
 * Illustrated, friendly empty state for lists/pages with no content yet.
 * Always shows a clear "do this next" CTA so users never face a dead screen.
 */
export function EmptyState({
  icon: Icon = Sparkles,
  title,
  description,
  cta,
  secondary,
  tips,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  cta?: { label: string; to?: string; onClick?: () => void };
  secondary?: { label: string; to?: string; onClick?: () => void };
  tips?: string[];
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center rounded-3xl border border-dashed border-velvet/25 bg-paper/60 px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-velvet/10 text-velvet">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="font-serif text-xl text-ink">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>}

      {(cta || secondary) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {cta && (cta.to ? (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <Link to={cta.to as any}
              className="rounded-full bg-velvet px-5 py-2 text-sm font-medium text-white hover:opacity-90">
              {cta.label}
            </Link>
          ) : (
            <button onClick={cta.onClick}
              className="rounded-full bg-velvet px-5 py-2 text-sm font-medium text-white hover:opacity-90">
              {cta.label}
            </button>
          ))}
          {secondary && (secondary.to ? (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <Link to={secondary.to as any}
              className="rounded-full border border-velvet/20 px-5 py-2 text-sm font-medium text-velvet hover:bg-velvet/5">
              {secondary.label}
            </Link>
          ) : (
            <button onClick={secondary.onClick}
              className="rounded-full border border-velvet/20 px-5 py-2 text-sm font-medium text-velvet hover:bg-velvet/5">
              {secondary.label}
            </button>
          ))}
        </div>
      )}

      {tips && tips.length > 0 && (
        <ul className="mt-6 w-full max-w-sm space-y-1.5 text-left text-xs text-muted-foreground">
          {tips.map((t, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-velvet/60" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
