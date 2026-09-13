import { useMemo, useState } from "react";
import { CalendarRange, CopyPlus, Link as LinkIcon } from "lucide-react";

import { toast } from "sonner";
import {
  copyGuestsFromEvent,
  listSeriesNames,
  setEventSeries,
  siblingsInSeries,
  useEvents,
  type KEvent,
} from "@/lib/events-store";

/**
 * Series (occasion) grouping, stage one: name the occasion a gathering belongs
 * to, see the other gatherings in it, and seed this guest list from one of them
 * so a reunion weekend is imported once instead of three times.
 */
export function EventSeriesPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const events = useEvents();
  const [name, setName] = useState(event.seriesName ?? "");
  const [copyFrom, setCopyFrom] = useState("");
  const suggestions = useMemo(() => listSeriesNames(events), [events]);
  const siblings = useMemo(() => siblingsInSeries(events, event), [events, event]);
  const copySources = useMemo(
    () => (siblings.length ? siblings : events.filter((e) => e.id !== eventId)),
    [siblings, events, eventId],
  );
  /** Occasion-level headcount across this gathering plus its siblings. */
  const rollup = useMemo(() => {
    const all = [event, ...siblings];
    let going = 0;
    let invited = 0;
    let pending = 0;
    for (const e of all) {
      for (const g of e.guests) {
        invited += 1;
        if (g.status === "yes") going += 1;
        else if (g.status === "pending") pending += 1;
      }
    }
    return { going, invited, pending };
  }, [event, siblings]);
  const occasionLink =
    (typeof window === "undefined" ? "" : window.location.origin) + `/o/${eventId}`;


  const saveName = () => {
    if ((event.seriesName ?? "") === name.trim()) return;
    setEventSeries(eventId, name);
    toast.success(name.trim() ? `Added to "${name.trim()}"` : "Removed from its series");
  };

  const doCopy = () => {
    if (!copyFrom) return;
    const added = copyGuestsFromEvent(eventId, copyFrom);
    if (added === 0) {
      toast.info("Everyone on that list is already here.");
      return;
    }
    toast.success(`Copied ${added} ${added === 1 ? "person" : "people"} over as pending invites.`);
    setCopyFrom("");
  };

  return (
    <section className="space-y-4 rounded-2xl bg-card p-4 ring-1 ring-ink/10 sm:p-5">
      <div className="flex items-start gap-2">
        <CalendarRange className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div>
          <h3 className="font-serif text-lg text-ink">Part of a bigger occasion?</h3>
          <p className="text-xs text-muted-foreground">
            Give the weekend or trip a name, then reuse the same guest list across every
            gathering in it.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          list="series-name-suggestions"
          maxLength={80}
          placeholder="Kendrick Family Reunion 2027"
          aria-label="Occasion name"
          className="min-h-[44px] rounded-xl bg-secondary px-3 text-sm text-ink ring-1 ring-ink/10 focus:outline-none focus:ring-2 focus:ring-ink/30"
        />
        <datalist id="series-name-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={saveName}
          className="min-h-[44px] rounded-full bg-ink px-5 text-xs font-medium text-paper hover:opacity-90"
        >
          Save occasion
        </button>
      </div>

      {siblings.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Also in this occasion
          </p>
          <ul className="space-y-1 text-sm text-ink">
            {siblings.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{s.title || "Untitled gathering"}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {s.guests.filter((g) => g.status === "yes").length} going ·{" "}
                  {s.guests.length} {s.guests.length === 1 ? "guest" : "guests"}
                </span>
              </li>
            ))}
          </ul>
          <p className="pt-1 text-xs text-muted-foreground">
            Across the whole occasion: {rollup.going} going of {rollup.invited} invited
            {rollup.pending > 0 ? `, ${rollup.pending} still to reply` : ""}.
          </p>
        </div>
      )}

      {siblings.length > 0 && (
        <div className="space-y-2 rounded-xl bg-secondary/60 p-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            One link for the whole occasion
          </p>
          <p className="text-xs text-muted-foreground">
            Guests find their name once and reply to every gathering in one tap.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-card px-3 py-2 text-[11px] text-ink ring-1 ring-ink/10">
              {occasionLink}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(occasionLink)
                  .then(() => toast.success("Occasion link copied."))
                  .catch(() => toast.error("Couldn't copy. Select the link and copy it manually."));
              }}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-card px-4 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-ink/5"
            >
              <LinkIcon className="h-3.5 w-3.5" /> Copy link
            </button>
          </div>
        </div>
      )}


      {copySources.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <select
            value={copyFrom}
            onChange={(e) => setCopyFrom(e.target.value)}
            aria-label="Copy guest list from"
            className="min-h-[44px] rounded-xl bg-secondary px-3 text-sm text-ink ring-1 ring-ink/10 focus:outline-none focus:ring-2 focus:ring-ink/30"
          >
            <option value="">Copy the guest list from…</option>
            {copySources.map((s) => (
              <option key={s.id} value={s.id}>
                {(s.title || "Untitled gathering") + ` (${s.guests.length})`}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={doCopy}
            disabled={!copyFrom}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-card px-5 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-ink/5 disabled:opacity-50"
          >
            <CopyPlus className="h-3.5 w-3.5" /> Copy people over
          </button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Copied people arrive as pending invites. RSVPs, payments and send history stay with the
        gathering they belong to.
      </p>
    </section>
  );
}
