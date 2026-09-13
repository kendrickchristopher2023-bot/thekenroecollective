import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BRING_CATEGORIES,
  bringCategoryLabel,
  bringTotals,
  groupByCategory,
  looksLikeDuplicate,
  slotsRemaining,
  type BringItem,
  type BringSheet,
} from "@/lib/bring-sheet";
import {
  claimBringItem,
  fetchBringSheet,
  releaseBringClaim,
  suggestBringItem,
  updateBringClaim,
} from "@/lib/bring-sheet.functions";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { confirmDialog } from "@/lib/confirm-dialog";
import { LoadErrorState } from "@/components/load-error-state";
import { isShowcaseEvent, SHOWCASE_READONLY_MESSAGE } from "@/lib/showcase";


/**
 * Guest-facing sign-up sheet. Works with no account: the private edit token
 * for each sign-up is remembered on the device so the same guest can change or
 * release what they promised later.
 */

type MineMap = Record<string, { token: string; itemId: string }>;

function mineKey(eventId: string) {
  return `kenroes:bring-mine:${eventId}`;
}

function loadMine(eventId: string): MineMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(mineKey(eventId)) || "{}") as MineMap;
  } catch {
    return {};
  }
}

function saveMine(eventId: string, map: MineMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(mineKey(eventId), JSON.stringify(map));
  } catch {
    // Private browsing — the sign-up still stands, they just cannot edit it here.
  }
}

export function BringSheetGuest({
  eventId,
  defaultName,
  compact,
}: {
  eventId: string;
  defaultName?: string;
  compact?: boolean;
}) {
  // The public sample lists what people are bringing, but no one can sign up.
  const readOnly = isShowcaseEvent(eventId);
  const [sheet, setSheet] = useState<BringSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [mine, setMine] = useState<MineMap>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState(defaultName ?? "");
  const [dish, setDish] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestName, setSuggestName] = useState("");
  const [suggestCategory, setSuggestCategory] = useState<string>("other");
  const [editing, setEditing] = useState<{ claimId: string; dish: string; note: string } | null>(null);


  const reload = useCallback(async () => {
    try {
      const r = await fetchBringSheet({ data: { eventId } });
      setSheet(r);
      setFailed(false);
    } catch {
      setSheet(null);
      // A failed fetch used to render nothing at all, leaving a blank page
      // where the sign-up sheet should be.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    setMine(loadMine(eventId));
    void reload();
  }, [eventId, reload]);

  useEffect(() => {
    if (defaultName && !name) setName(defaultName);
  }, [defaultName]);

  const items = sheet?.items ?? [];
  const totals = useMemo(() => bringTotals(items), [items]);
  const groups = useMemo(() => groupByCategory(items), [items]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-ink/10 bg-card p-5">
        <div className="h-4 w-40 animate-pulse rounded bg-ink/10" />
      </div>
    );
  }
  if (failed) {
    return (
      <LoadErrorState
        title="We couldn't load the sign-up sheet"
        description="Your host's list is still there. Check your connection and try again."
        onRetry={() => {
          setLoading(true);
          void reload();
        }}
      />
    );
  }
  if (!sheet?.found || !sheet.enabled) return null;

  function startClaim(item: BringItem) {
    setOpenId(item.id);
    setDish(item.name);
    setNote("");
  }

  async function submitClaim(item: BringItem) {
    if (busy) return;
    const dup = looksLikeDuplicate(dish || item.name, items);
    if (
      dup &&
      !(await confirmDialog({
        title: `Someone is already bringing "${dup}"`,
        body: "That is fine if you meant to double up. Otherwise, cancel and pick something else.",
        confirmLabel: "Sign me up anyway",
        tone: "info",
      }))
    )
      return;
    setBusy(true);
    try {
      const r = await claimBringItem({
        data: { itemId: item.id, name: name.trim() || undefined, dish: dish.trim() || undefined, note: note.trim() || undefined },
      });
      if (!r.ok) {
        toast.error(r.error);
        await reload();
        return;
      }
      const next = { ...mine, [r.id]: { token: r.token, itemId: item.id } };
      setMine(next);
      saveMine(eventId, next);
      setOpenId(null);
      setNote("");
      toast.success(`You're bringing ${dish.trim() || item.name}. Thank you!`);
      await reload();
    } catch {
      toast.error("Could not sign you up. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitSuggestion() {
    if (busy) return;
    if (!suggestName.trim()) {
      toast.error("Tell us what you'd like to bring.");
      return;
    }
    const dup = looksLikeDuplicate(suggestName, items);
    if (
      dup &&
      !(await confirmDialog({
        title: `Someone is already bringing "${dup}"`,
        body: "That is fine if you meant to double up. Otherwise, cancel and suggest something else.",
        confirmLabel: "Add mine anyway",
        tone: "info",
      }))
    )
      return;
    setBusy(true);
    try {
      const r = await suggestBringItem({
        data: {
          eventId,
          itemName: suggestName.trim(),
          category: suggestCategory,
          guestName: name.trim() || undefined,
          note: note.trim() || undefined,
        },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const next = { ...mine, [r.id]: { token: r.token, itemId: r.itemId } };
      setMine(next);
      saveMine(eventId, next);
      setSuggestOpen(false);
      setSuggestName("");
      setNote("");
      toast.success("Added to the list. Thank you!");
      await reload();
    } catch {
      toast.error("Could not add that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function release(claimId: string) {
    const entry = mine[claimId];
    if (!entry) return;
    setBusy(true);
    try {
      const r = await releaseBringClaim({ data: { id: claimId, token: entry.token } });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const next = { ...mine };
      delete next[claimId];
      setMine(next);
      saveMine(eventId, next);
      toast.success("Released. Someone else can pick it up.");
      await reload();
    } catch {
      toast.error("Could not release that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function editMine(claimId: string, currentDish: string, currentNote: string) {
    if (!mine[claimId]) return;
    setEditing({ claimId, dish: currentDish, note: currentNote });
  }

  async function submitEdit(next: { claimId: string; dish: string; note: string }) {
    const entry = mine[next.claimId];
    if (!entry) return;
    setBusy(true);
    try {
      const r = await updateBringClaim({
        data: {
          id: next.claimId,
          token: entry.token,
          name: name.trim() || undefined,
          dish: next.dish.trim(),
          note: next.note.trim(),
        },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setEditing(null);
      toast.success("Updated. Thank you!");
      await reload();
    } catch {
      toast.error("Could not update that. Try again.");
    } finally {
      setBusy(false);
    }
  }


  return (
    <section className={compact ? "" : "mx-auto max-w-3xl px-6 py-10"} id="bring">
      <div className="rounded-3xl border border-ink/10 bg-card p-5 sm:p-7">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">
          Sign-up sheet
        </span>
        <h2 className="mt-1 font-serif text-2xl">What to bring</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {items.length === 0
            ? sheet.allowSuggestions
              ? "The host hasn't listed anything yet. Offer something below and it shows up here."
              : "The host hasn't listed anything yet. Check back soon."
            : totals.openSlots > 0
              ? `${totals.openSlots} ${totals.openSlots === 1 ? "spot" : "spots"} still open. Claim what suits you, no account needed.`
              : "Everything on the list is covered. Thank you!"}
        </p>

        {(() => {
          const dietary = sheet.dietaryCount ?? 0;
          const access = sheet.accessibilityCount ?? 0;
          if (dietary <= 0 && access <= 0) return null;
          return (
            <p className="mt-2 rounded-xl bg-velvet/5 px-3 py-2 text-xs text-muted-foreground">
              Heads up for anyone cooking:{" "}
              {dietary > 0 ? `${dietary} ${dietary === 1 ? "guest has" : "guests have"} noted dietary restrictions` : ""}
              {dietary > 0 && access > 0 ? ", and " : ""}
              {access > 0 ? `${access} noted accessibility needs` : ""}. Labelling ingredients is
              always appreciated.
            </p>
          );
        })()}


        {readOnly && (
          <p className="mt-5 rounded-xl bg-secondary/60 px-3 py-2 text-sm text-ink/70">
            {SHOWCASE_READONLY_MESSAGE}
          </p>
        )}

        {!readOnly && (
        <div className="mt-5">
          <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Your name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="So your host knows who to thank"
            maxLength={80}
            className="mt-1 w-full rounded-lg border border-ink/15 bg-transparent px-3 py-2.5 text-sm focus:border-velvet focus:outline-none"
          />
        </div>
        )}

        {items.length === 0 && sheet.allowSuggestions && (
          <p className="mt-5 text-sm text-muted-foreground">
            Be the first to offer something.
          </p>
        )}


        <div className="mt-5 space-y-6">
          {groups.map((group) => (
            <div key={group.id}>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                {group.label}
              </p>
              <ul className="mt-2 space-y-2">
                {group.items.map((item) => {
                  const left = slotsRemaining(item);
                  const needed = Math.max(1, item.slotsNeeded);
                  const myClaim = item.claims.find((c) => mine[c.id]);
                  return (
                    <li key={item.id} className="rounded-2xl border border-ink/10 p-3 sm:p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {item.name}
                            {item.suggested && (
                              <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                                Guest offer
                              </span>
                            )}
                          </p>
                          {item.note && <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p>}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.claims.length} of {needed} claimed
                            {item.serves ? ` • serves about ${item.serves}` : ""}
                          </p>
                          {item.claims.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {item.claims.map((c) => (
                                <li key={c.id} className="text-xs text-muted-foreground">
                                  ✓ {sheet.showNames ? c.name || "A guest" : "Claimed"}
                                  {c.dish && c.dish !== item.name ? ` — ${c.dish}` : ""}
                                  {c.note ? ` (${c.note})` : ""}
                                  {mine[c.id] && (
                                    <span className="ml-2 inline-flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => editMine(c.id, c.dish ?? item.name, c.note ?? "")}
                                        disabled={busy}
                                        className="min-h-9 underline"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => release(c.id)}
                                        disabled={busy}
                                        className="min-h-9 underline"
                                      >
                                        Release
                                      </button>
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {!readOnly && !myClaim && left > 0 && openId !== item.id && (
                          <button
                            type="button"
                            onClick={() => startClaim(item)}
                            className="min-h-11 rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white"
                          >
                            I'll bring this
                          </button>
                        )}
                        {!myClaim && left === 0 && (
                          <span className="min-h-11 rounded-full bg-ink/5 px-4 py-2 text-sm text-muted-foreground">
                            Covered
                          </span>
                        )}
                      </div>

                      {openId === item.id && (
                        <div className="mt-3 space-y-2 rounded-xl bg-paper/60 p-3">
                          <input
                            value={dish}
                            onChange={(e) => setDish(e.target.value)}
                            placeholder="What exactly are you bringing?"
                            maxLength={200}
                            className="w-full rounded-lg border border-ink/15 bg-transparent px-3 py-2.5 text-sm focus:border-velvet focus:outline-none"
                          />
                          <input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Optional note — serves 12, vegetarian, nut free…"
                            maxLength={300}
                            className="w-full rounded-lg border border-ink/15 bg-transparent px-3 py-2.5 text-sm focus:border-velvet focus:outline-none"
                          />
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setOpenId(null)}
                              className="min-h-11 rounded-full px-4 py-2 text-sm ring-1 ring-ink/10"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => submitClaim(item)}
                              disabled={busy}
                              className="min-h-11 rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                            >
                              {busy ? "Signing up…" : "Sign me up"}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {!readOnly && sheet.allowSuggestions && (
          <div className="mt-6 border-t border-ink/10 pt-5">
            {!suggestOpen ? (
              <button
                type="button"
                onClick={() => setSuggestOpen(true)}
                className="min-h-11 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-ink/10 hover:bg-secondary"
              >
                I'll bring something else
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  value={suggestName}
                  onChange={(e) => setSuggestName(e.target.value)}
                  placeholder="What would you like to bring?"
                  maxLength={120}
                  className="w-full rounded-lg border border-ink/15 bg-transparent px-3 py-2.5 text-sm focus:border-velvet focus:outline-none"
                />
                <select
                  value={suggestCategory}
                  onChange={(e) => setSuggestCategory(e.target.value)}
                  className="w-full rounded-lg border border-ink/15 bg-transparent px-3 py-2.5 text-sm focus:border-velvet focus:outline-none"
                >
                  {BRING_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note — serves 12, vegetarian, nut free…"
                            maxLength={300}
                  className="w-full rounded-lg border border-ink/15 bg-transparent px-3 py-2.5 text-sm focus:border-velvet focus:outline-none"
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSuggestOpen(false)}
                    className="min-h-11 rounded-full px-4 py-2 text-sm ring-1 ring-ink/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitSuggestion}
                    disabled={busy}
                    className="min-h-11 rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy ? "Adding…" : "Add to the list"}
                  </button>
                </div>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Anything counts, including ice, chairs, plates and coolers, not just{" "}
              {bringCategoryLabel("baked").toLowerCase()}.
            </p>
          </div>
        )}
      </div>

      {editing && (
        <BringEditDialog
          value={editing}
          busy={busy}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={() => void submitEdit(editing)}
        />
      )}
    </section>
  );
}

/** Styled replacement for the old two-step window.prompt edit flow. */
function BringEditDialog({
  value,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  value: { claimId: string; dish: string; note: string };
  busy: boolean;
  onChange: (next: { claimId: string; dish: string; note: string }) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const dialogRef = useDialogA11y(onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bring-edit-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-ink/10 bg-card p-5 shadow-xl sm:p-6"
      >
        <h3 id="bring-edit-title" className="font-serif text-xl">
          Update your sign-up
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Change what you are bringing or leave the host a note.
        </p>

        <label className="mt-4 block text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          What exactly are you bringing?
        </label>
        <input
          value={value.dish}
          onChange={(e) => onChange({ ...value, dish: e.target.value })}
          maxLength={120}
          className="mt-1 w-full rounded-lg border border-ink/15 bg-transparent px-3 py-2.5 text-sm focus:border-velvet focus:outline-none"
        />

        <label className="mt-4 block text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Note for the host (optional)
        </label>
        <textarea
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          rows={3}
          maxLength={300}
          placeholder="Serves 12, vegetarian, needs oven space…"
          className="mt-1 w-full rounded-lg border border-ink/15 bg-transparent px-3 py-2.5 text-sm focus:border-velvet focus:outline-none"
        />

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-ink/10 hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="min-h-11 rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper hover:bg-velvet disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

