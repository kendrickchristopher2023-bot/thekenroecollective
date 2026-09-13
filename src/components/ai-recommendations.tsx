import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Sparkles, X, ArrowRight } from "lucide-react";
import type { KEvent } from "@/lib/events-store";

type Rec = {
  id: string;
  title: string;
  body: string;
  cta: { label: string; to: string };
  tone: "info" | "warn" | "good";
};

function deriveRecs(events: KEvent[]): Rec[] {
  const recs: Rec[] = [];
  const now = Date.now();

  if (events.length === 0) {
    recs.push({
      id: "first-event",
      title: "Start your first gathering",
      body: "I can walk you through it — occasion, vibe, guests, date. Three minutes.",
      cta: { label: "Create event", to: "/events/new" },
      tone: "info",
    });
    return recs;
  }

  for (const e of events) {
    const days = Math.round((+new Date(e.date) - now) / 86400000);
    const total = e.guests?.length ?? 0;
    const yes = e.guests?.filter((g) => g.status === "yes").length ?? 0;
    const pending = e.guests?.filter((g) => g.status === "pending" || g.status === "maybe").length ?? 0;

    if (days >= 0 && days <= 21 && total > 0 && pending / total > 0.3) {
      recs.push({
        id: `remind-${e.id}`,
        title: `${e.title}: ${pending} guests haven't RSVP'd`,
        body: `Event is ${days} day${days === 1 ? "" : "s"} out. A quick reminder usually lifts response 25–40%.`,
        cta: { label: "Send reminder", to: `/events/${e.id}` },
        tone: "warn",
      });
    }

    if (days >= -1 && days <= 1 && yes > 0) {
      recs.push({
        id: `photowall-${e.id}`,
        title: `${e.title} is happening now`,
        body: "Turn on the Photo Wall so guests can drop photos into a live slideshow. $9 unlock.",
        cta: { label: "Enable Photo Wall", to: `/events/${e.id}` },
        tone: "good",
      });
    }

    if (days < -1 && days > -14 && yes > 0) {
      recs.push({
        id: `thanks-${e.id}`,
        title: `${e.title}: send thank-you cards`,
        body: `${yes} guest${yes === 1 ? "" : "s"} showed up. Send personalized thank-yous in under 5 minutes.`,
        cta: { label: "Open Thank-you Cards", to: `/events/${e.id}` },
        tone: "good",
      });
    }
  }

  return recs.slice(0, 4);
}

export function AiRecommendations({ events }: { events: KEvent[] }) {
  const recs = useMemo(() => deriveRecs(events), [events]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("kc_recs_dismissed");
      if (raw) setDismissed(new Set(JSON.parse(raw)));
    } catch {/* ignore */}
  }, []);

  const visible = recs.filter((r) => !dismissed.has(r.id));
  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try { sessionStorage.setItem("kc_recs_dismissed", JSON.stringify([...next])); } catch {/* ignore */}
  };

  return (
    <section className="mb-8 rounded-2xl border border-velvet/15 bg-gradient-to-br from-velvet/5 via-paper to-paper p-5">
      <header className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-velvet" />
        <h2 className="text-sm font-semibold tracking-wide uppercase text-velvet">Recommendations</h2>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {visible.map((r) => (
          <li
            key={r.id}
            className="group relative rounded-xl border border-velvet/10 bg-card p-4 shadow-sm transition hover:shadow-md"
          >
            <button
              type="button"
              onClick={() => dismiss(r.id)}
              className="absolute right-2 top-2 rounded-full p-1 text-ink/40 hover:bg-velvet/5 hover:text-ink"
              aria-label="Dismiss recommendation"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <h3 className="pr-6 text-sm font-medium text-ink">{r.title}</h3>
            <p className="mt-1 text-xs text-ink/70">{r.body}</p>
            <Link
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              to={r.cta.to as any}
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-velvet hover:underline"
            >
              {r.cta.label} <ArrowRight className="h-3 w-3" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
