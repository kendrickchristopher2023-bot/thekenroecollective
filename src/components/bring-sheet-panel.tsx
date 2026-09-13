import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthReady } from "@/hooks/use-auth-ready";

import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import {
  BRING_CATEGORIES,
  BRING_TEMPLATES,
  bringCsvRows,
  bringTotals,
  groupByCategory,
  slotsRemaining,
  stillNeededSummary,
  toCsv,
  type BringItem,
  rsvpLabel,
} from "@/lib/bring-sheet";

import {
  downloadBringTemplate,
  exportBringSheetDocx,
  exportBringSheetPdf,
  exportBringSheetXlsx,
  parseBringTemplateFile,
} from "@/lib/bring-sheet-export";
import { isStaleChunkError } from "@/lib/lazy-chunk";
import { CompletionMoment } from "@/components/completion-moment";
import { buildBringSheetMoment } from "@/lib/completion-moments";

import {
  addBringItem,
  addBringTemplate,
  deleteBringItem,
  listBringItems,
  nudgeBringSheet,
  removeBringClaim,
  updateBringItem,
} from "@/lib/bring-sheet.functions";
import { updateEvent, type KEvent } from "@/lib/events-store";
import { confirmDialog } from "@/lib/confirm-dialog";


/**
 * Host panel for the potluck sign-up sheet. Available on every tier, including
 * free Postcard, so it deliberately has no upgrade gate.
 */
export function BringSheetPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  // The wizard's KEvent payload carries no id field, so calls that read it off
  // the event were sending undefined and the host saw an empty sheet. The route
  // already knows the id, so it is passed in explicitly.

  const [items, setItems] = useState<BringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [slots, setSlots] = useState(1);
  const [note, setNote] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | "docx" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);


  const enabled = event.bringSheetEnabled === true;
  const allowSuggestions = event.bringSheetAllowSuggestions !== false;
  const showNames = event.bringSheetShowNames !== false;

  // Wait for the Supabase session before fetching. listBringItems is an
  // authenticated server fn, so firing it on mount raced session hydration:
  // the bearer was not attached yet, the call 401'd, the catch below swallowed
  // it, and the host saw an empty "Nothing listed yet" sheet even when items
  // and claims existed. Keyed on auth readiness so it runs once we have one.
  const { ready: authReady, user } = useAuthReady();

  useEffect(() => {
    if (!authReady || !user) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const r = await listBringItems({ data: { eventId: eventId } });
        if (alive) setItems(r.items);
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [eventId, authReady, user?.id]);


  const totals = useMemo(() => bringTotals(items), [items]);
  const groups = useMemo(() => groupByCategory(items), [items]);
  const shareUrl =
    typeof window === "undefined" ? "" : `${window.location.origin}/bring/${eventId}`;

  function setSetting(patch: Partial<KEvent>) {
    updateEvent(eventId, patch as any);
  }

  async function add() {
    if (!name.trim()) {
      toast.error("Name the item first.");
      return;
    }
    setBusy(true);
    try {
      const r = await addBringItem({
        data: {
          eventId: eventId,
          name: name.trim(),
          category,
          slotsNeeded: slots,
          note: note.trim() || undefined,
        },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setItems(r.items);
      setName("");
      setNote("");
      setSlots(1);
      toast.success("Added to the list.");
    } catch {
      toast.error("Could not add that item.");
    } finally {
      setBusy(false);
    }
  }

  async function applyTemplate(id: string) {
    const tpl = BRING_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setBusy(true);
    try {
      const r = await addBringTemplate({
        data: {
          eventId: eventId,
          items: tpl.items.map((i) => ({
            name: i.name,
            category: i.category,
            slotsNeeded: i.slotsNeeded ?? 1,
            ...(i.note ? { note: i.note } : {}),
          })),
        },
      });
      if (r.items) setItems(r.items);

      toast.success(`${tpl.name} list added — edit anything you like.`);
    } catch {
      toast.error("Could not add that starter list.");
    } finally {
      setBusy(false);
    }
  }

  async function patchItem(id: string, patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await updateBringItem({ data: { eventId: eventId, id, ...patch } as any });
      setItems(r.items);
    } catch {
      toast.error("Could not save that change.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, itemName: string) {
    if (
      !(await confirmDialog({
        title: `Remove "${itemName}"?`,
        body: "Any guest who signed up to bring it will lose that sign-up. You can add the item again later.",
        confirmLabel: "Yes, remove it",
      }))
    )
      return;
    setBusy(true);
    try {
      const r = await deleteBringItem({ data: { eventId: eventId, id } });
      setItems(r.items);
      toast.success("Removed.");
    } catch {
      toast.error("Could not remove that item.");
    } finally {
      setBusy(false);
    }
  }

  async function dropClaim(id: string) {
    setBusy(true);
    try {
      const r = await removeBringClaim({ data: { eventId: eventId, id } });
      setItems(r.items);
      toast.success("Sign-up removed.");
    } catch {
      toast.error("Could not remove that sign-up.");
    } finally {
      setBusy(false);
    }
  }

  async function nudge() {
    setBusy(true);
    try {
      const r = await nudgeBringSheet({ data: { eventId: eventId } });
      if (!r.ok) {
        toast.info(r.error);
        return;
      }
      toast.success(`Nudge sent to ${r.sent} ${r.sent === 1 ? "guest" : "guests"}.`);
    } catch {
      toast.error("Could not send the nudge.");
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    const csv = toCsv(bringCsvRows(items));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `what-to-bring-${eventId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function runExport(kind: "pdf" | "xlsx" | "docx") {
    setExporting(kind);
    try {
      if (kind === "xlsx") exportBringSheetXlsx(items, event.title);
      else if (kind === "pdf") await exportBringSheetPdf(items, event.title);
      else await exportBringSheetDocx(items, event.title);
    } catch (err) {
      if (isStaleChunkError(err)) {
        toast.error("We just updated the app. Reloading, then try again.");
        window.location.reload();
        return;
      }
      toast.error("Could not build that file. Try again.");
    } finally {
      setExporting(null);
    }
  }

  async function onTemplateFile(file: File) {
    setBusy(true);
    try {
      const parsed = await parseBringTemplateFile(file);
      if (parsed.items.length === 0) {
        toast.error("No items found. Fill in the Item Name column and try again.");
        return;
      }
      let latest = items;
      let added = 0;
      let skipped = 0;
      for (let i = 0; i < parsed.items.length; i += 40) {
        const batch = parsed.items.slice(i, i + 40);
        const r = await addBringTemplate({ data: { eventId: eventId, items: batch } });
        if (r.items) latest = r.items;
        if (!r.ok) {
          toast.error(r.error);
          break;
        }
        added += r.added ?? batch.length;
        skipped += r.skipped ?? 0;
      }
      setItems(latest);
      const extra = [
        parsed.skipped ? `${parsed.skipped} row(s) had no item name` : "",
        skipped ? `${skipped} skipped (list full)` : "",
        parsed.truncated ? "only the first 200 rows were read" : "",
      ]
        .filter(Boolean)
        .join(", ");
      toast.success(
        `Imported ${added} ${added === 1 ? "item" : "items"}${extra ? ` — ${extra}` : ""}.`,
      );
    } catch {
      toast.error("Could not read that file. Use the downloaded template.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }


  return (
    <div className="rounded-3xl border border-ink/10 bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">
            Included on every plan
          </span>
          <h3 className="mt-1 font-serif text-xl">What to bring sign-up sheet</h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            List the dishes and supplies you need, and guests claim them, or offer their own. No
            account needed on their side.
          </p>
        </div>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setSetting({ bringSheetEnabled: e.target.checked })}
            className="size-5 accent-velvet"
          />
          {enabled ? "On" : "Off"}
        </label>
      </div>

      {enabled && (
        <>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="inline-flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={allowSuggestions}
                onChange={(e) => setSetting({ bringSheetAllowSuggestions: e.target.checked })}
                className="size-5 accent-velvet"
              />
              Let guests suggest their own items
            </label>
            <label className="inline-flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={showNames}
                onChange={(e) => setSetting({ bringSheetShowNames: e.target.checked })}
                className="size-5 accent-velvet"
              />
              Show who signed up
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Items" value={String(totals.items)} />
            <Stat label="Claimed" value={`${totals.claimed}/${totals.slotsNeeded}`} />
            <Stat label="Still open" value={String(totals.openSlots)} />
            <Stat label="Guests helping" value={String(totals.people)} />
          </div>
          {totals.openSlots > 0 && (
            <p className="mt-3 rounded-xl bg-velvet/5 px-3 py-2 text-sm">{stillNeededSummary(items)}</p>
          )}

          {!loading && (
            <CompletionMoment
              className="mt-5"
              eventId={eventId}
              moment={buildBringSheetMoment(totals, event.title)}
            />
          )}


          <div className="mt-4 flex flex-wrap gap-2">
            {BRING_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                disabled={busy}
                className="min-h-11 rounded-full border border-ink/10 px-3 py-2 text-xs font-medium hover:border-velvet/40 hover:bg-velvet/5 disabled:opacity-50"
              >
                <span className="mr-1.5">{t.emoji}</span>
                {t.name}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-2 rounded-2xl bg-paper/60 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Item — e.g. Potato salad, bag of ice"
                maxLength={120}
                className="rounded-lg border border-ink/15 bg-transparent px-3 py-2.5 text-sm focus:border-velvet focus:outline-none"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-lg border border-ink/15 bg-transparent px-3 py-2.5 text-sm focus:border-velvet focus:outline-none"
              >
                {BRING_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                Slots
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={slots}
                  onChange={(e) => setSlots(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="w-16 rounded-lg border border-ink/15 bg-transparent px-2 py-2.5 text-sm focus:border-velvet focus:outline-none"
                />
              </label>
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note for guests — serves 12, nut free, arrive by 5…"
              maxLength={300}
              className="w-full rounded-lg border border-ink/15 bg-transparent px-3 py-2.5 text-sm focus:border-velvet focus:outline-none"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={add}
                disabled={busy}
                className="min-h-11 rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Add item
              </button>
            </div>
          </div>

          {loading ? (
            <div className="mt-5 h-4 w-40 animate-pulse rounded bg-ink/10" />
          ) : (
            <div className="mt-5 space-y-5">
              {groups.map((group) => (
                <div key={group.id}>
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    {group.label}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {group.items.map((item) => (
                      <li key={item.id} className="rounded-2xl border border-ink/10 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium">
                              {item.name}
                              {item.suggested && (
                                <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                                  Guest offer
                                </span>
                              )}
                            </p>
                            {item.note && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.claims.length} of {Math.max(1, item.slotsNeeded)} claimed
                              {slotsRemaining(item) === 0 ? " • covered" : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              Slots
                              <input
                                type="number"
                                min={1}
                                max={20}
                                defaultValue={item.slotsNeeded}
                                onBlur={(e) => {
                                  const v = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                                  if (v !== item.slotsNeeded) void patchItem(item.id, { slotsNeeded: v });
                                }}
                                className="w-16 rounded-lg border border-ink/15 bg-transparent px-2 py-2 text-sm"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => remove(item.id, item.name)}
                              disabled={busy}
                              className="min-h-11 rounded-full px-3 py-2 text-xs ring-1 ring-ink/10 hover:bg-secondary"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        {item.claims.length > 0 && (
                          <ul className="mt-2 space-y-1 border-t border-ink/5 pt-2">
                            {item.claims.map((c) => (
                              <li
                                key={c.id}
                                className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
                              >
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <span>
                                    ✓ {c.name || "A guest"}
                                    {c.dish && c.dish !== item.name ? ` — ${c.dish}` : ""}
                                    {c.note ? ` (${c.note})` : ""}
                                  </span>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                                      c.rsvp === "yes"
                                        ? "bg-emerald-500/10 text-emerald-700"
                                        : c.rsvp === "no"
                                          ? "bg-red-500/10 text-red-700"
                                          : c.rsvp === "pending"
                                            ? "bg-amber-500/10 text-amber-700"
                                            : "bg-ink/5 text-muted-foreground"
                                    }`}
                                  >
                                    {rsvpLabel(c.rsvp)}
                                  </span>
                                </span>

                                <button
                                  type="button"
                                  onClick={() => dropClaim(c.id)}
                                  disabled={busy}
                                  className="min-h-9 underline"
                                >
                                  Remove sign-up
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nothing listed yet. Add items above or start from one of the lists.
                </p>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-4">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(shareUrl);
                toast.success("Sign-up link copied.");
              }}
              className="min-h-11 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-ink/10 hover:bg-secondary"
            >
              Copy sign-up link
            </button>
            <button
              type="button"
              onClick={nudge}
              disabled={busy}
              className="min-h-11 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-ink/10 hover:bg-secondary disabled:opacity-50"
            >
              Nudge guests who haven't signed up
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={items.length === 0}
              className="min-h-11 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-ink/10 hover:bg-secondary disabled:opacity-50"
            >
              Download CSV
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-ink/10 bg-secondary/30 p-4">
            <h4 className="font-serif text-base">Share and reuse the list</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Export the sheet to print or email, or download the fillable Excel template, plan
              offline, then upload it to add everything at once.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runExport("pdf")}
                disabled={items.length === 0 || exporting !== null}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-ink/10 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {exporting === "pdf" ? "Building PDF…" : "PDF"}
              </button>
              <button
                type="button"
                onClick={() => void runExport("xlsx")}
                disabled={items.length === 0 || exporting !== null}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-ink/10 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {exporting === "xlsx" ? "Building Excel…" : "Excel"}
              </button>
              <button
                type="button"
                onClick={() => void runExport("docx")}
                disabled={items.length === 0 || exporting !== null}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-ink/10 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {exporting === "docx" ? "Building Word…" : "Word"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-ink/10 pt-3">
              <button
                type="button"
                onClick={() => downloadBringTemplate(event.title)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-ink/10"
              >
                <Download className="h-4 w-4" /> Download template
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" /> {busy ? "Working…" : "Import .xlsx"}
              </button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onTemplateFile(f);
                }}
              />
            </div>
          </div>

        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink/10 p-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-serif text-xl">{value}</p>
    </div>
  );
}
