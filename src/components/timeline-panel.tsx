import { useState } from "react";
import { Plus, Trash2, Clock, Printer } from "lucide-react";
import {
  addTimelineBlock,
  removeTimelineBlock,
  TIMELINE_PRESETS,
  updateTimelineBlock,
  type KEvent,
} from "@/lib/events-store";
import { exportRunOfShowPdf } from "@/lib/report-export";

export function TimelinePanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const [time, setTime] = useState("18:00");
  const [title, setTitle] = useState("");
  const blocks = [...(event.timelineBlocks ?? [])].sort((a, b) => a.time.localeCompare(b.time));

  function add(t?: string, o?: string) {
    const newTitle = t ?? title.trim();
    if (!newTitle) return;
    addTimelineBlock(eventId, { time, title: newTitle, owner: o, durationMin: 30 });
    setTitle("");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-velvet/15 bg-velvet/5 p-4 text-sm text-ink/80">
        💡 Plan the day-of timeline. Add blocks like "Ceremony" or "First dance", assign owners,
        and print a clean run-of-show PDF for your vendors and MC.
      </div>

      <div className="rounded-2xl border border-ink/5 bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-full bg-secondary px-3 py-2 text-sm focus:outline-none"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Block title (e.g. First dance)"
            className="flex-1 rounded-full bg-secondary px-4 py-2 text-sm focus:outline-none"
          />
          <button
            onClick={() => add()}
            className="inline-flex items-center gap-1.5 rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>

        <div className="mt-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Quick add</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TIMELINE_PRESETS.map((p) => (
              <button
                key={p.title}
                onClick={() => add(p.title, p.owner)}
                className="rounded-full bg-secondary px-3 py-1 text-[11px] hover:bg-velvet/10 hover:text-velvet"
              >
                + {p.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-ink/10 p-12 text-center text-sm text-muted-foreground">
          <Clock className="mx-auto mb-2 h-6 w-6 opacity-50" />
          No timeline blocks yet. Use Quick add above to scaffold a typical evening.
        </div>
      ) : (
        <div className="space-y-2">
          {blocks.map((b) => (
            <div key={b.id} className="grid grid-cols-[80px_1fr_auto] items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-ink/5">
              <input
                type="time"
                value={b.time}
                onChange={(e) => updateTimelineBlock(eventId, b.id, { time: e.target.value })}
                className="rounded-full bg-secondary px-2 py-1.5 text-xs"
              />
              <div className="space-y-1">
                <input
                  value={b.title}
                  onChange={(e) => updateTimelineBlock(eventId, b.id, { title: e.target.value })}
                  className="w-full bg-transparent font-serif text-base outline-none"
                />
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <input
                    value={b.owner ?? ""}
                    onChange={(e) => updateTimelineBlock(eventId, b.id, { owner: e.target.value })}
                    placeholder="Owner (MC, DJ, vendor…)"
                    className="rounded bg-secondary px-2 py-0.5"
                  />
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      min={5}
                      max={300}
                      value={b.durationMin ?? 30}
                      onChange={(e) => updateTimelineBlock(eventId, b.id, { durationMin: Number(e.target.value) || 30 })}
                      className="w-14 rounded bg-secondary px-1.5 py-0.5"
                    />
                    min
                  </label>
                  <input
                    value={b.notes ?? ""}
                    onChange={(e) => updateTimelineBlock(eventId, b.id, { notes: e.target.value })}
                    placeholder="Notes"
                    className="flex-1 rounded bg-secondary px-2 py-0.5"
                  />
                </div>
              </div>
              <button
                onClick={() => removeTimelineBlock(eventId, b.id)}
                className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => exportRunOfShowPdf(event)}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
        >
          <Printer className="h-4 w-4" /> Export run-of-show PDF
        </button>
      </div>
    </div>
  );
}
