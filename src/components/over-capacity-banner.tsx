import { committedHeadcount, type KEvent } from "@/lib/events-store";

/**
 * Persistent over-capacity banner for the host's guest list. The one-time
 * confirm dialog on add/edit is easy to click past and then forget, so this
 * stays visible for as long as the committed headcount (everyone who has not
 * declined) exceeds the cap. It recomputes from `event` on every render, so it
 * updates live as guests are added, edited, or removed.
 *
 * Host-only surface: the event dashboard is already gated to the host, owners
 * and admins, so guests never see it.
 */
export function OverCapacityBanner({ event }: { event: KEvent }) {
  const capacity = Number(event.capacity ?? 0);
  if (!(capacity > 0)) return null;
  const committed = committedHeadcount(event);
  if (committed <= capacity) return null;
  const over = committed - capacity;

  return (
    <div role="status" className="rounded-xl border border-red-300 bg-red-50 p-3 text-[12px] text-red-800">
      <p className="font-semibold">
        {committed} invited, capacity {capacity} — {over} over
      </p>
      <p className="mt-1 text-red-700/90">
        Counts everyone who has not declined, including their kids and plus-ones. Guests RSVPing
        themselves are blocked (or sent to the waitlist, if it is on) once the confirmed count
        reaches {capacity}. Raise the cap above, or trim the list.
      </p>
    </div>
  );
}
