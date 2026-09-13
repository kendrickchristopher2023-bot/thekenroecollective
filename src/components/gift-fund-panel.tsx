import { Link } from "@tanstack/react-router";
import {
  giftFundTotal,
  markContributionThanked,
  setGiftFund,
  type KEvent,
} from "@/lib/events-store";
import { formatTimestamp } from "@/lib/datetime";

export function GiftFundPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const fund = event.giftFund ?? {
    enabled: false,
    label: "Honeymoon Fund",
    currency: "USD",
    presetAmounts: [25, 50, 100, 250],
    contributions: [],
  };
  const total = giftFundTotal(event);
  const pct = fund.goal && fund.goal > 0 ? Math.min(100, Math.round((total / fund.goal) * 100)) : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl">Gift contributions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Let guests chip in toward a honeymoon, down payment, or any fund. Powered by Stripe — money goes straight to your connected account.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fund.enabled}
              onChange={(e) => setGiftFund(eventId, { enabled: e.target.checked })}
              className="size-4 accent-velvet"
            />
            <span>Enabled</span>
          </label>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Fund name">
            <input
              value={fund.label}
              onChange={(e) => setGiftFund(eventId, { label: e.target.value })}
              placeholder="Honeymoon Fund"
              className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
            />
          </Field>
          <Field label="Goal (USD, optional)">
            <input
              type="number"
              min={0}
              value={fund.goal ?? ""}
              onChange={(e) =>
                setGiftFund(eventId, {
                  goal: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="5000"
              className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
            />
          </Field>
          <Field label="Description for guests" className="sm:col-span-2">
            <textarea
              rows={2}
              value={fund.description ?? ""}
              onChange={(e) => setGiftFund(eventId, { description: e.target.value })}
              placeholder="Help us start married life on the beach."
              className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
            />
          </Field>
          <Field label="Suggested amounts (comma separated)" className="sm:col-span-2">
            <input
              value={(fund.presetAmounts ?? []).join(", ")}
              onChange={(e) =>
                setGiftFund(eventId, {
                  presetAmounts: e.target.value
                    .split(",")
                    .map((s) => Number(s.trim()))
                    .filter((n) => Number.isFinite(n) && n > 0),
                })
              }
              placeholder="25, 50, 100, 250"
              className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
            />
          </Field>
          <Field label="Thank-you note (shown after contribution)" className="sm:col-span-2">
            <textarea
              rows={2}
              value={fund.thankYouNote ?? ""}
              onChange={(e) => setGiftFund(eventId, { thankYouNote: e.target.value })}
              placeholder="Thank you — your generosity means the world."
              className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
            />
          </Field>
        </div>
      </div>

      {fund.enabled && (
        <div className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Progress</p>
              <p className="mt-1 font-serif text-3xl">
                ${total.toLocaleString()}
                {fund.goal ? <span className="text-base text-muted-foreground"> / ${fund.goal.toLocaleString()}</span> : null}
              </p>
            </div>
            <Link
              to="/gift/$eventId"
              params={{ eventId }}
              search={{ session_id: undefined }}
              className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-white hover:bg-velvet"
            >
              Open guest page →
            </Link>
          </div>
          {fund.goal ? (
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-velvet transition-all" style={{ width: `${pct}%` }} />
            </div>
          ) : null}

          <div className="mt-6">
            <h3 className="text-sm font-medium">Contributions</h3>
            {fund.contributions.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No contributions yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink/5">
                {fund.contributions.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="font-medium">{c.name} · ${c.amount.toLocaleString()}</p>
                      {c.message && <p className="text-xs text-muted-foreground">"{c.message}"</p>}
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {formatTimestamp((c.at))}
                      </p>
                    </div>
                    {c.thanked ? (
                      <span className="text-xs text-emerald-700">Thanked</span>
                    ) : (
                      <button
                        onClick={() => markContributionThanked(eventId, c.id)}
                        className="rounded-full bg-secondary px-3 py-1 text-xs hover:bg-secondary/70"
                      >
                        Mark thanked
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
