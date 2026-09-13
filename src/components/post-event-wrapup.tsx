import { useMemo } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { downloadCsv } from "@/lib/admin-table";
import type { KEvent } from "@/lib/events-store";
import { wrapUpEvent, wrapUpCsv } from "@/lib/post-event-analytics";

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function timeOf(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-background/60 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-serif text-2xl leading-none">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/**
 * Post-event wrap-up: final attendance against what was expected, no-shows,
 * walk-ins and the money position, in one place after the party.
 */
export function PostEventWrapUp({ event }: { event: KEvent }) {
  const w = useMemo(() => wrapUpEvent(event), [event]);

  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-serif text-lg">Post-event wrap-up</h4>
          <p className="text-xs text-muted-foreground">
            Final numbers once the doors close. Attendance comes from door check-ins, so scan or tap guests in to keep
            this honest.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={() =>
            downloadCsv(`${(event.title || "event").replace(/\W+/g, "_")}-wrap-up.csv`, wrapUpCsv(event, w))
          }
        >
          <Download className="mr-2 h-4 w-4" aria-hidden />
          Download CSV
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Invited" value={w.invited} hint={`${w.responded} replied (${w.responseRate}%)`} />
        <Stat label="Expected heads" value={w.expectedHeads} hint={`${w.yes} yes · ${w.maybe} maybe`} />
        <Stat
          label="Arrived"
          value={w.arrivedHeads}
          hint={`${w.attendanceRate}% of expected · ${w.walkInHeads} walk-in`}
        />
        <Stat label="No-shows" value={w.noShowHeads} hint={`${w.noShows.length} parties never arrived`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="No reply" value={w.pending} hint={`${w.no} declined · ${w.waitlisted} waitlisted`} />
        <Stat label="Kids / pets on site" value={`${w.kids} / ${w.pets}`} />
        <Stat
          label="Needs logged"
          value={`${w.dietaryNotes} / ${w.accessibilityNotes}`}
          hint="Dietary / accessibility"
        />
        <Stat
          label="Collected"
          value={money(w.collected, w.currency)}
          hint={`${money(w.outstanding, w.currency)} outstanding of ${money(w.billed, w.currency)}`}
        />
      </div>

      <div className="text-xs text-muted-foreground">
        First arrival {timeOf(w.firstArrivalAt)} · last arrival {timeOf(w.lastArrivalAt)}
        {w.surpriseArrivals > 0 && ` · ${w.surpriseArrivals} arrived after declining`}
      </div>

      {w.noShows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Guests who said yes or maybe but never checked in</caption>
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2">Never arrived</th>
                <th scope="col" className="py-2">RSVP</th>
                <th scope="col" className="py-2 text-right">Heads</th>
              </tr>
            </thead>
            <tbody>
              {w.noShows.slice(0, 25).map((r) => (
                <tr key={r.id} className="border-b border-ink/5">
                  <td className="py-2">{r.name}</td>
                  <td className="py-2 capitalize">{r.status}</td>
                  <td className="py-2 text-right">{r.heads}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {w.noShows.length > 25 && (
            <p className="pt-2 text-xs text-muted-foreground">
              Showing 25 of {w.noShows.length}. The CSV has every row.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
