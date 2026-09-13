// Reusable celebratory "you just finished this" panel with a contextual,
// non-blocking upgrade suggestion. See src/lib/completion-moments.ts for the
// moment definitions. This component NEVER gates or hides existing work.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Sparkles, X } from "lucide-react";
import { getEntitlements } from "@/lib/entitlements-client";
import { TIERS } from "@/lib/tier-config";
import {
  isMomentDismissActive,
  momentDismissValue,
  momentSeenKey,
  shouldShowUpgrade,
  type CompletionMomentDef,
  type MomentTier,
} from "@/lib/completion-moments";


function useMomentTier(): { tier: MomentTier | null; isOwner: boolean } {
  const { data } = useQuery({
    queryKey: ["entitlements", "for-gates"],
    queryFn: getEntitlements,
    staleTime: 60_000,
  });
  if (!data) return { tier: null, isOwner: false };
  return { tier: (data.tier as MomentTier) ?? null, isOwner: !!data.isOwner && !data.previewing };
}

export function CompletionMoment({
  moment,
  eventId,
  className,
}: {
  moment: CompletionMomentDef | null;
  eventId: string;
  className?: string;
}) {
  const { tier, isOwner } = useMomentTier();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const key = moment ? momentSeenKey(moment.id, eventId) : "";

  useEffect(() => {
    if (!key) return;
    try {
      const raw = window.localStorage.getItem(key);
      const active = isMomentDismissActive(raw);
      if (raw && !active) window.localStorage.removeItem(key);
      setDismissed(active);
    } catch {
      setDismissed(false);
    }
  }, [key]);

  if (!moment || dismissed === null) return null;

  const showUpgrade = shouldShowUpgrade(tier, moment.targetTier, isOwner);
  const target = TIERS[moment.targetTier];
  const price = target?.monthlyPrice ?? 0;

  function dismiss() {
    try {
      window.localStorage.setItem(key, momentDismissValue());
    } catch {
      /* private mode */
    }
    setDismissed(true);
  }


  function reopen() {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* private mode */
    }
    setDismissed(false);
  }

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={reopen}
        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl border border-ink/10 bg-secondary/30 px-4 py-2.5 text-left text-xs text-muted-foreground hover:border-velvet/30 ${className ?? ""}`}
      >
        <span className="truncate">{moment.title}</span>
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </button>
    );
  }

  return (
    <section
      className={`relative overflow-hidden rounded-3xl border border-velvet/20 bg-gradient-to-b from-velvet/[0.07] to-transparent p-5 sm:p-6 ${className ?? ""}`}
      aria-label={moment.title}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 grid size-11 place-items-center rounded-full text-ink/40 hover:bg-ink/5 hover:text-ink"
      >
        <X className="size-4" aria-hidden />
      </button>

      <p className="flex items-center gap-1.5 pr-10 text-[10px] font-semibold uppercase tracking-[0.2em] text-velvet">
        <Sparkles className="size-3.5" aria-hidden />
        {moment.eyebrow}
      </p>
      <h3 className="mt-1 pr-10 font-serif text-xl leading-snug text-ink sm:text-2xl">{moment.title}</h3>
      <p className="mt-1.5 max-w-prose text-sm text-ink/70">{moment.body}</p>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {moment.stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-paper/70 px-3 py-2.5 text-center">
            <dd className="font-serif text-xl text-ink">{s.value}</dd>
            <dt className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</dt>
          </div>
        ))}
      </dl>

      {showUpgrade ? (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-ink/10 bg-paper/50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Yours already{tier ? ` (${TIERS[tier]?.name ?? "your plan"})` : ""}
              </p>
              <ul className="mt-2 space-y-1.5">
                {moment.youHave.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-ink/75">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                    <span className="min-w-0">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-velvet/25 bg-velvet/[0.06] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-velvet">
                What {target?.name ?? moment.targetTier} adds for this
              </p>
              <ul className="mt-2 space-y-1.5">
                {moment.unlocks.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-ink/80">
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-velvet" aria-hidden />
                    <span className="min-w-0">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              to="/pricing"
              search={
                {
                  category: "events",
                  billing: "monthly",
                  highlight: moment.targetTier,
                } as never
              }
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:opacity-90"
            >
              See {target?.name ?? moment.targetTier}
              {price > 0 ? ` — $${price}/mo` : ""}
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/15 px-5 py-2.5 text-sm font-medium text-ink hover:bg-ink/5"
            >
              {moment.continueLabel ?? "Not now"}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Nothing you have built goes away if you stay free.
          </p>
        </>
      ) : (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:opacity-90"
          >
            Looks good
          </button>
          <p className="text-xs text-muted-foreground">
            Your plan already covers everything on this list.
          </p>
        </div>
      )}
    </section>
  );
}
