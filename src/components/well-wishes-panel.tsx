import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deleteWellWish,
  listWellWishes,
  sendWellWishesDigest,
  setHonoreeEmail,
  setWellWishHidden,
  type WellWish,
} from "@/lib/well-wishes.functions";
import { confirmDialog } from "@/lib/confirm-dialog";
import { formatStampDate } from "@/lib/datetime";

/**
 * Organizer controls for guest well wishes: the honoree delivery email, the
 * message list with hide/remove, and the "send now" digest.
 *
 * The honoree email lives in its own database column (never in the public
 * event JSON), so guests can never load it.
 */
export function WellWishesPanel({ eventId }: { eventId: string }) {
  const [wishes, setWishes] = useState<WellWish[]>([]);
  const [email, setEmail] = useState("");
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const reload = useCallback(async () => {
    setLoadError(false);
    try {
      const r = await listWellWishes({ data: { eventId } });
      setWishes(r.wishes);
      setSavedEmail(r.honoreeEmail);
      setEmail(r.honoreeEmail ?? "");
      setSentAt(r.wishesSentAt);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function saveEmail() {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("That email does not look right.");
      return;
    }
    setBusy(true);
    try {
      await setHonoreeEmail({ data: { eventId, email } });
      setSavedEmail(email || null);
      toast.success(email ? "Honoree email saved." : "Honoree email cleared.");
    } catch {
      toast.error("Could not save that email.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleHidden(w: WellWish) {
    setBusy(true);
    try {
      await setWellWishHidden({ data: { id: w.id, hidden: !w.hidden } });
      await reload();
    } catch {
      toast.error("Could not update that message.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(w: WellWish) {
    if (
      !(await confirmDialog({
        title: "Remove this message for good?",
        body: "It will disappear from your event page and cannot be brought back.",
        confirmLabel: "Yes, remove it",
      }))
    )
      return;
    setBusy(true);
    try {
      await deleteWellWish({ data: { id: w.id } });
      await reload();
      toast.success("Message removed.");
    } catch {
      toast.error("Could not remove that message.");
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    setBusy(true);
    try {
      const r = await sendWellWishesDigest({ data: { eventId } });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Sent ${r.count} well ${r.count === 1 ? "wish" : "wishes"} to the honoree.`);
      await reload();
    } catch {
      toast.error("Could not send the well wishes.");
    } finally {
      setBusy(false);
    }
  }

  const visible = wishes.filter((w) => !w.hidden);

  return (
    <div className="rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8">
      <h3 className="font-serif text-2xl">Well wishes</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Messages your guests leave for the guest of honor. You choose where they land, and you can
        hide anything you would rather not pass along.
      </p>

      <div className="mt-6 border-t border-ink/5 pt-6">
        <label className="flex flex-col gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Honoree email (optional), where we send the collected well wishes
          </span>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="honoree@example.com"
              className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-secondary px-3 py-3 text-base focus:border-velvet focus:outline-none"
            />
            <button
              type="button"
              onClick={saveEmail}
              disabled={busy}
              className="min-h-11 rounded-full px-5 py-3 text-sm font-medium ring-1 ring-ink/10 hover:bg-secondary disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Only you can see this. It never appears on the invite or anywhere guests can reach.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={sendNow}
            disabled={busy || !savedEmail || visible.length === 0}
            className="min-h-11 rounded-full bg-velvet px-6 py-3 text-base font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Send well wishes now
          </button>
          {!savedEmail ? (
            <span className="text-xs text-muted-foreground">Add and save an honoree email to enable sending.</span>
          ) : visible.length === 0 ? (
            <span className="text-xs text-muted-foreground">A visible guest message is needed before you can send.</span>
          ) : null}
          <a href={`/wishes/${eventId}`} className="text-sm underline">
            Open the wishes page
          </a>
          {sentAt && (
            <span className="text-xs text-muted-foreground">
              Last sent {formatStampDate((sentAt))}
            </span>
          )}
        </div>
      </div>

      <div className="mt-8 space-y-3 border-t border-ink/5 pt-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading messages…</p>
        ) : loadError ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">We could not load the well wishes. Your messages have not been deleted.</p>
            <button
              type="button"
              onClick={() => void reload()}
              className="min-h-11 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-ink/10 hover:bg-secondary"
            >
              Try again
            </button>
          </div>
        ) : wishes.length === 0 ? (
          <p className="text-base text-muted-foreground">
            No messages yet. Guests can post one from the invite page.
          </p>
        ) : (
          wishes.map((w) => (
            <div
              key={w.id}
              className={`rounded-2xl p-5 ring-1 ring-ink/5 ${w.hidden ? "bg-secondary/20 opacity-60" : "bg-secondary/40"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{w.name || "A guest"}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {formatStampDate((w.createdAt))}
                    {w.hidden ? " · hidden" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => toggleHidden(w)}
                    disabled={busy}
                    className="rounded-full px-3 py-2 text-xs font-medium ring-1 ring-ink/10 hover:bg-card disabled:opacity-50"
                  >
                    {w.hidden ? "Show" : "Hide"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(w)}
                    disabled={busy}
                    className="rounded-full px-3 py-2 text-xs font-medium text-destructive ring-1 ring-destructive/20 hover:bg-destructive/5 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <p className="mt-3 text-base leading-relaxed text-ink/80">{w.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
