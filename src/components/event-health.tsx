import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import type { KEvent } from "@/lib/events-store";
import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";

type Signal = {
  id: string;
  label: string;
  tone: "good" | "warn" | "bad";
  fixTo?: string;
  fixLabel?: string;
};

function computeSignals(events: KEvent[]): Signal[] {
  const out: Signal[] = [];
  const now = Date.now();
  const upcoming = events.filter((e) => +new Date(e.date) >= now - 86400000);

  const pendingCount = upcoming.reduce(
    (n, e) => n + (e.guests?.filter((g) => g.status === "pending").length ?? 0),
    0,
  );
  if (pendingCount > 0) {
    out.push({
      id: "pending-rsvps",
      label: `${pendingCount} guest${pendingCount === 1 ? "" : "s"} haven't RSVP'd`,
      tone: pendingCount > 10 ? "bad" : "warn",
    });
  }

  const missingDietary = upcoming.reduce((n, e) => {
    const yes = e.guests?.filter((g) => g.status === "yes") ?? [];
    return n + yes.filter((g) => !g.dietary || g.dietary.trim() === "").length;
  }, 0);
  if (missingDietary > 0) {
    out.push({
      id: "dietary",
      label: `${missingDietary} confirmed guest${missingDietary === 1 ? "" : "s"} missing dietary info`,
      tone: "warn",
    });
  }

  const missingAddress = upcoming.filter((e) => !e.address || e.address.trim() === "");
  if (missingAddress.length > 0) {
    out.push({
      id: "address",
      label: `${missingAddress.length} event${missingAddress.length === 1 ? "" : "s"} missing a venue address`,
      tone: "warn",
      fixTo: `/events/${missingAddress[0].id}`,
      fixLabel: "Add address",
    });
  }

  const noGuests = upcoming.filter((e) => (e.guests?.length ?? 0) === 0);
  if (noGuests.length > 0) {
    out.push({
      id: "no-guests",
      label: `${noGuests.length} event${noGuests.length === 1 ? "" : "s"} without a guest list`,
      tone: "warn",
      fixTo: `/events/${noGuests[0].id}`,
      fixLabel: "Add guests",
    });
  }

  if (out.length === 0 && upcoming.length > 0) {
    out.push({ id: "all-clear", label: "Everything looks great — nothing needs attention.", tone: "good" });
  }
  return out;
}

export function EventHealth({ events }: { events: KEvent[] }) {
  const signals = useMemo(() => computeSignals(events), [events]);
  if (events.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl bg-card p-5 ring-1 ring-ink/5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-velvet">Event Health</span>
        <span className="text-xs text-muted-foreground">— what needs your attention</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {signals.map((s) => (
          <li
            key={s.id}
            className={`flex items-start justify-between gap-3 rounded-xl px-3 py-2 ring-1 ${
              s.tone === "good"
                ? "bg-emerald-50/60 ring-emerald-200 dark:bg-emerald-950/20 dark:ring-emerald-900"
                : s.tone === "bad"
                  ? "bg-rose-50/60 ring-rose-200 dark:bg-rose-950/20 dark:ring-rose-900"
                  : "bg-amber-50/60 ring-amber-200 dark:bg-amber-950/20 dark:ring-amber-900"
            }`}
          >
            <div className="flex min-w-0 items-start gap-2">
              {s.tone === "good" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
              ) : s.tone === "bad" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700 dark:text-rose-400" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
              )}
              <span className="text-sm text-ink">{s.label}</span>
            </div>
            {s.fixTo && (
              <Link to={s.fixTo} className="shrink-0 text-xs font-medium text-velvet hover:underline">
                {s.fixLabel ?? "Fix"} →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
