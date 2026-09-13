import { toUserMessage } from "@/lib/user-error";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addGuest, committedHeadcount, updateGuest, type KEvent } from "@/lib/events-store";
import { confirmDialog } from "@/lib/confirm-dialog";
import {
  capacityVerdict,
  formatMoney,
  normalizeParty,
  partyLabel,
  requestOwed,
} from "@/lib/guest-request-review";
import {
  listGuestRequests,
  resolveGuestRequest,
  type GuestRequestRow,
} from "@/lib/guest-requests.functions";

/**
 * "Requests to join" — guests who couldn't find themselves on a forwarded
 * invite and asked the host to add them.
 *
 * A request is a headcount and money event, not just a name: the full party
 * size, the amount the party owes and the capacity impact are all shown before
 * the host approves. Approving runs the same capacity/waitlist rule as a normal
 * RSVP, so an approval can never quietly push the event over its cap.
 */
export function GuestRequestsPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const [rows, setRows] = useState<GuestRequestRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const listFn = useServerFn(listGuestRequests);
  const resolveFn = useServerFn(resolveGuestRequest);

  const load = useCallback(async () => {
    try {
      const res = await listFn({ data: { eventId } });
      setRows((res.requests || []).filter((r) => r.status === "pending"));
    } catch {
      /* host may not have access yet; stay quiet */
    }
  }, [listFn, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (rows.length === 0) return null;

  const committed = committedHeadcount(event);

  async function act(row: GuestRequestRow, status: "approved" | "dismissed") {
    const heads = normalizeParty(row.party_size);
    const owed = requestOwed(event, heads);
    let outcome: "confirmed" | "waitlisted" = "confirmed";

    if (status === "approved") {
      const check = capacityVerdict(event, committed, heads);
      if (check.verdict === "over") {
        await confirmDialog({
          title: "This would go over your capacity",
          body: `${partyLabel(row.name, heads)}, and you only have ${check.remaining} place${
            check.remaining === 1 ? "" : "s"
          } left of your ${event.capacity} limit. Raise the capacity or turn on the waitlist in Details, then approve this request.`,
          confirmLabel: "Got it",
          tone: "info",
        });
        return;
      }
      if (check.verdict === "waitlist") {
        const ok = await confirmDialog({
          title: "Add to the waitlist?",
          body: `You're at capacity, so ${partyLabel(row.name, heads)} will go on the waitlist instead of taking a place. They'll be told they're waitlisted.`,
          confirmLabel: "Add to waitlist",
          tone: "info",
        });
        if (!ok) return;
        outcome = "waitlisted";
      }
    }

    setBusy(row.id);
    try {
      if (status === "approved") {
        const isEmail = row.contact.includes("@");
        const guest = addGuest(
          eventId,
          row.name,
          isEmail ? row.contact : "",
          isEmail ? "" : row.contact,
          "",
        );
        // Party size the guest actually asked for, so headcount and money are
        // right the moment they're approved.
        updateGuest(eventId, guest.id, {
          adults: heads,
          ...(outcome === "waitlisted" ? { status: "waitlisted" as const } : {}),
        });
      }
      const res = await resolveFn({
        data: { id: row.id, status, outcome, amountDue: owed },
      });
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      const who = partyLabel(row.name, heads);
      if (status === "approved") {
        toast.success(
          outcome === "waitlisted"
            ? `${who} added to the waitlist.`
            : `${who} added to the guest list.`,
          {
            description: res.notified
              ? outcome === "waitlisted"
                ? "They've been emailed that they're on the waitlist."
                : "They've been emailed to finish their RSVP."
              : `No email on file — text or call ${row.contact} to let them know.`,
          },
        );
      } else {
        toast.success("Request declined.", {
          description: res.notified
            ? "They've been sent a short, polite notice."
            : `No email on file — let them know at ${row.contact}.`,
        });
      }
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't update that request."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-velvet/20 bg-velvet/5 p-4">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-velvet" />
        <h4 className="text-sm font-medium">Requests to join ({rows.length})</h4>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        These people opened your invite but weren&apos;t on the guest list. {event.title || "This event"} stays
        private until you approve them. Check the party size before approving, it counts towards your
        headcount.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => {
          const heads = normalizeParty(r.party_size);
          const owed = requestOwed(event, heads);
          const check = capacityVerdict(event, committed, heads);
          return (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-lg bg-card p-3 ring-1 ring-ink/5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{partyLabel(r.name, heads)}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-medium">
                    <Users className="h-3 w-3" />
                    {heads} {heads === 1 ? "person" : "people"}
                  </span>
                  {owed > 0 && (
                    <span className="rounded-full bg-velvet/10 px-2 py-0.5 font-medium text-velvet">
                      {formatMoney(owed)} due
                    </span>
                  )}
                  {check.verdict === "waitlist" && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700">
                      Would be waitlisted
                    </span>
                  )}
                  {check.verdict === "over" && (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
                      Over capacity ({check.remaining} left)
                    </span>
                  )}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{r.contact}</p>
                {r.note && <p className="mt-1 text-xs italic text-muted-foreground">“{r.note}”</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" disabled={busy === r.id} onClick={() => void act(r, "approved")}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === r.id}
                  onClick={() => void act(r, "dismissed")}
                >
                  Decline
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
