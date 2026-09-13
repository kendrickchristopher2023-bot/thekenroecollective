/**
 * Owner-level RSVP health. A high "opened but never answered" rate is a signal
 * that the RSVP flow is failing, which is exactly the failure that stayed
 * invisible until a guest phoned the host about it.
 */
import { useEffect, useState } from "react";
import { getInviteOpenHealth, type InviteHealthEvent } from "@/lib/invite-opens.functions";
import { OPEN_NO_ANSWER_ALERT_RATE } from "@/lib/invite-opens";
import { formatTimestamp } from "@/lib/datetime";

export function InviteHealthPanel() {
  const [rows, setRows] = useState<InviteHealthEvent[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getInviteOpenHealth()
      .then((res) => {
        if (!alive) return;
        setRows(res.events);
        setGeneratedAt(res.generatedAt);
      })
      .catch(() => alive && setError("Could not load invitation health."));
    return () => {
      alive = false;
    };
  }, []);

  const flagged = (rows ?? []).filter((r) => r.redFlag);

  return (
    <div className="mt-6 rounded-xl border border-ink/5 bg-card p-5">
      <h3 className="font-serif text-xl">Invitation health</h3>
      <p className="text-xs text-muted-foreground">
        Guests who opened a personal invitation link and never answered. A high rate points at the RSVP flow, not the
        guests. Tracking started {formatTimestamp("2026-08-27T00:00:00.000Z")}; earlier events show no history.
      </p>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {!rows && !error ? <p className="mt-3 text-sm text-muted-foreground">Loading…</p> : null}

      {flagged.length > 0 ? (
        <div className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {flagged.length} event{flagged.length === 1 ? "" : "s"} above the {Math.round(OPEN_NO_ANSWER_ALERT_RATE * 100)}%
          opened-without-answering threshold. Check the RSVP flow on {flagged.map((f) => f.title).join(", ")}.
        </div>
      ) : null}

      {rows && rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No invitation opens recorded yet.</p>
      ) : null}

      {rows && rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="py-2">Event</th>
                <th className="py-2">Guests</th>
                <th className="py-2">Opened</th>
                <th className="py-2">Opened, no answer</th>
                <th className="py-2">Rate</th>
                <th className="py-2">Opened 3+ times</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.eventId} className="border-t border-ink/5">
                  <td className="py-2">{r.title}</td>
                  <td className="py-2">{r.guests}</td>
                  <td className="py-2">{r.opened}</td>
                  <td className="py-2">{r.openedNoAnswer}</td>
                  <td className={`py-2 font-medium ${r.redFlag ? "text-destructive" : ""}`}>
                    {Math.round(r.rate * 100)}%
                  </td>
                  <td className="py-2">{r.repeatOpeners}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {generatedAt ? (
        <p className="mt-3 text-[11px] text-muted-foreground">Generated {formatTimestamp(generatedAt)}</p>
      ) : null}
    </div>
  );
}
