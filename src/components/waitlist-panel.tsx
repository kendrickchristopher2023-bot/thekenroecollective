import * as React from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, GripVertical, UserCheck } from "lucide-react";
import { confirmDialog } from "@/lib/confirm-dialog";

import {
  partyHeadcount,
  promoteFromWaitlist,
  reorderWaitlist,
  updateEvent,
  type Guest,
  type KEvent,
} from "@/lib/events-store";
import {
  confirmedHeads,
  describePlan,
  moveInOrder,
  openSeats,
  planWaitlistPromotions,
  waitlistEntries,
  waitlistPolicyOf,
  describeSkipped,
} from "@/lib/waitlist";
import { formatEventForMessage } from "@/lib/datetime";
import { personalInviteUrl } from "@/lib/invite-links";
import { notifyWaitlistPromotion } from "@/lib/waitlist.functions";
import { queueSms } from "@/lib/sms.functions";

/**
 * Host control surface for the waitlist.
 *
 * Everything here reads from src/lib/waitlist.ts, the same module the
 * unattended worker uses, so the "what happens next" line the host reads is the
 * decision the robot will actually make.
 *
 * Ordering is manual and explicit: drag on a desktop, arrows on a phone (drag
 * does not work with a thumb, and Christopher uses this on mobile). Position 1
 * is promoted first.
 */
function partyPhrase(g: Guest): string {
  const heads = partyHeadcount(g);
  const bits: string[] = [];
  const adults = g.adults ?? 1;
  const kids = g.children ?? 0;
  const plus = Array.isArray(g.plusOnes) ? g.plusOnes.length : 0;
  bits.push(`${adults} ${adults === 1 ? "adult" : "adults"}`);
  if (kids) bits.push(`${kids} ${kids === 1 ? "child" : "children"}`);
  if (plus) bits.push(`${plus} plus-${plus === 1 ? "one" : "ones"}`);
  return `${bits.join(" + ")} = ${heads} ${heads === 1 ? "person" : "people"}`;
}

export function WaitlistPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const entries = waitlistEntries(event);
  const seats = openSeats(event);
  const confirmed = confirmedHeads(event);
  const cap = Number(event.capacity ?? 0);
  const policy = waitlistPolicyOf(event);
  const plan = planWaitlistPromotions(event, { ignoreAutoPromote: true });
  const overCap = cap > 0 && confirmed > cap;

  function reorder(id: string, toIndex: number) {
    const ids = entries.map((e) => e.guest.id);
    reorderWaitlist(eventId, moveInOrder(ids, id, toIndex));
  }

  async function promote(guest: Guest) {
    const heads = partyHeadcount(guest);
    if (heads > seats && !event.allowOverCapacity) {
      const ok = await confirmDialog({
        title: "Go over your guest limit?",
        body: `${guest.name || "This party"} is ${heads} ${heads === 1 ? "person" : "people"} and only ${seats} ${seats === 1 ? "seat" : "seats"} are open. Adding them puts you past your limit of ${cap}.`,
        confirmLabel: "Yes, add them anyway",
      });
      if (!ok) return;
    }
    setBusyId(guest.id);
    try {
      promoteFromWaitlist(eventId, guest.id, "host");
      const when = event.date ? formatEventForMessage(event.date, event.timezone ?? null) : null;
      const base = `${window.location.origin}/invite/${eventId}`;
      const inviteUrl = personalInviteUrl(base, guest.id);
      const res = await notifyWaitlistPromotion({
        data: {
          eventId,
          guestId: guest.id,
          guestName: guest.name ?? "",
          email: guest.email ?? "",
          eventName: event.title ?? "",
          partyPhrase: partyPhrase(guest),
          whenLine: when?.full ?? "",
          venue: event.venue ?? event.address ?? "",
          inviteUrl,
          heads,
          by: "host",
        },
      });
      // Text as well when we have a number: a waitlisted guest is usually
      // waiting on an answer, and a text is the one they will actually see.
      if (guest.phone) {
        try {
          await queueSms({
            data: {
              eventId,
              body: `Good news, a place opened up for ${event.title || "the event"}. You're confirmed. Details: ${inviteUrl}`,
              recipients: [{ phone: guest.phone, guestId: guest.id, guestName: guest.name ?? "" }],
            },
          });
        } catch {
          // Best effort: opt-out, tier cap or no SMS pack. Email still counted.
        }
      }
      toast.success(
        res.emailed
          ? `${guest.name || "Guest"} promoted and notified.`
          : `${guest.name || "Guest"} promoted. No email on file, so tell them yourself.`,
      );
    } catch (err) {
      console.error("waitlist promote failed", err);
      toast.error("Promoted on this device, but the notification did not send.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-ink/10 bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Waitlist order</p>
        <span className="text-[11px] text-muted-foreground">
          {cap > 0 ? `${confirmed} / ${cap} people confirmed · ${seats} ${seats === 1 ? "seat" : "seats"} open` : "No cap set"}
        </span>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">
        Position 1 is promoted first. The cap counts people, so a party of four takes four seats. A
        party is never split.
      </p>

      {cap > 0 && (
        <p className="mt-2 rounded-lg bg-secondary/60 p-2 text-[11px] text-ink/80">
          <span className="font-semibold">What happens next: </span>
          {describePlan(plan)}
        </p>
      )}

      {plan.skipped.length > 0 && (
        <p role="status" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
          <span className="font-semibold">Passed over: </span>
          {describeSkipped(plan)} Use Promote on their row to add them anyway.
        </p>
      )}

      {plan.heldFor && (
        <p role="status" className="mt-2 rounded-lg border border-ink/10 bg-secondary/60 p-2 text-[11px] text-ink/80">
          <span className="font-semibold">Seats held: </span>
          {plan.seatsLeft} {plan.seatsLeft === 1 ? "seat is" : "seats are"} being kept for{" "}
          {plan.heldFor.guest.name || "the party at the front"}, who needs {plan.heldFor.heads}. Nobody
          behind them is promoted while this is set.
        </p>
      )}

      {overCap && (
        <div role="status" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
          <p className="font-semibold">
            {confirmed} people are confirmed but your cap is {cap}.
          </p>
          <p className="mt-1">
            Nobody has been removed and nobody will be. Raise the cap, or leave it and treat the cap
            as a target. Guests are only affected at RSVP time, never retroactively.
          </p>
        </div>
      )}

      {/* Ordering + promotion */}
      {entries.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-ink/15 p-3 text-[11px] text-muted-foreground">
          Nobody is on the waitlist yet. Once you are at capacity, guests who accept land here in the
          order they answered, and you can reorder them.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {entries.map((entry, index) => {
            const fits = entry.heads <= seats;
            return (
              <li
                key={entry.guest.id}
                draggable
                onDragStart={() => setDragId(entry.guest.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== entry.guest.id) reorder(dragId, index);
                  setDragId(null);
                }}
                className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${
                  dragId === entry.guest.id ? "border-velvet bg-velvet/5" : "border-ink/10 bg-secondary/30"
                }`}
              >
                <GripVertical className="hidden h-4 w-4 shrink-0 text-ink/30 sm:block" aria-hidden />
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-100 text-[11px] font-semibold text-amber-900">
                  {entry.position}
                </span>
                <div className="min-w-0 flex-1 basis-[9rem]">
                  <p className="text-[12px] font-medium text-ink break-words">{entry.guest.name || "Guest"}</p>
                  <p className="text-[11px] text-muted-foreground break-words">
                    {partyPhrase(entry.guest)}
                    {!fits && seats > 0 ? ` · too large for the ${seats} open` : ""}
                  </p>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1">

                  <button
                    type="button"
                    aria-label={`Move ${entry.guest.name || "guest"} up`}
                    disabled={index === 0}
                    onClick={() => reorder(entry.guest.id, index - 1)}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-ink/10 text-ink/70 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${entry.guest.name || "guest"} down`}
                    disabled={index === entries.length - 1}
                    onClick={() => reorder(entry.guest.id, index + 1)}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-ink/10 text-ink/70 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={busyId === entry.guest.id}
                    onClick={() => promote(entry.guest)}
                    className="flex h-8 items-center gap-1 rounded-lg bg-velvet px-2 text-[11px] font-medium text-white disabled:opacity-50"
                  >
                    <UserCheck className="h-3.5 w-3.5" aria-hidden />
                    {busyId === entry.guest.id ? "Promoting…" : "Promote"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Policy: what to do when the next party does not fit */}
      <fieldset className="mt-3 rounded-lg border border-ink/10 p-2">
        <legend className="px-1 text-[11px] font-semibold text-ink/70">
          If the next party is bigger than the seats that open
        </legend>
        <label className="flex items-start gap-2 text-[11px]">
          <input
            type="radio"
            name="waitlist-policy"
            className="mt-0.5"
            checked={policy === "skip"}
            onChange={() => updateEvent(eventId, { waitlistPolicy: "skip" })}
          />
          <span>
            <span className="font-medium">Skip to the next party that fits</span> (recommended). Seats
            get used. A large family can be passed over more than once, so watch the list.
          </span>
        </label>
        <label className="mt-2 flex items-start gap-2 text-[11px]">
          <input
            type="radio"
            name="waitlist-policy"
            className="mt-0.5"
            checked={policy === "hold"}
            onChange={() => updateEvent(eventId, { waitlistPolicy: "hold" })}
          />
          <span>
            <span className="font-medium">Hold the seats</span> until enough open for the party at the
            front. Strictly in order, but seats can sit empty.
          </span>
        </label>
      </fieldset>

      {/* Deliberate over-capacity */}
      <label className="mt-3 flex items-start gap-2 text-[11px]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={!!event.allowOverCapacity}
          onChange={(e) => updateEvent(eventId, { allowOverCapacity: e.target.checked })}
        />
        <span>
          <span className="font-medium">Let the guest list go over my cap</span>
          <span className="block text-muted-foreground">
            Guests are no longer blocked or waitlisted when the cap is reached. Your cap becomes a
            target you can see rather than a limit anyone enforces. Turn this off to resume
            waitlisting.
          </span>
        </span>
      </label>

      {/* Audit trail */}
      {(event.waitlistLog?.length ?? 0) > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] font-medium text-ink/70">
            Promotion history ({event.waitlistLog!.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {[...event.waitlistLog!].reverse().map((row, i) => (
              <li key={`${row.guestId}-${row.at}-${i}`} className="text-[11px] text-muted-foreground">
                {new Date(row.at).toLocaleString()} — {row.guestName} ({row.heads}{" "}
                {row.heads === 1 ? "person" : "people"}) promoted{" "}
                {row.by === "auto" ? "automatically" : "by you"}
                {row.note ? ` · ${row.note}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
