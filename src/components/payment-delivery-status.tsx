import { useEffect, useState } from "react";
import { getPaymentDeliveryStatus } from "@/lib/payment-messaging.functions";

export interface DeliveryRow {
  channel: "email" | "sms";
  to: string;
  guestId: string | null;
  status: string;
  error: string | null;
  at: string;
}

/**
 * Shared per-event delivery cache so every guest row can show a real send
 * status without each one firing its own request. Statuses come straight from
 * the transactional email log (pending / sent / failed / dlq / suppressed /
 * bounced) and the SMS outbox (pending / sent / failed).
 */
const cache = new Map<string, DeliveryRow[]>();
const listeners = new Map<string, Set<() => void>>();
const inflight = new Map<string, Promise<void>>();

function notify(eventId: string) {
  listeners.get(eventId)?.forEach((fn) => fn());
}

export function refreshPaymentDelivery(eventId: string): Promise<void> {
  const existing = inflight.get(eventId);
  if (existing) return existing;
  const p = getPaymentDeliveryStatus({ data: { eventId } })
    .then((r) => {
      cache.set(eventId, (r?.rows ?? []) as DeliveryRow[]);
      notify(eventId);
    })
    .catch(() => {
      /* advisory only */
    })
    .finally(() => {
      inflight.delete(eventId);
    });
  inflight.set(eventId, p);
  return p;
}

export function usePaymentDelivery(eventId: string): DeliveryRow[] {
  const [rows, setRows] = useState<DeliveryRow[]>(() => cache.get(eventId) ?? []);

  useEffect(() => {
    const set = listeners.get(eventId) ?? new Set<() => void>();
    const cb = () => setRows(cache.get(eventId) ?? []);
    set.add(cb);
    listeners.set(eventId, set);
    if (!cache.has(eventId)) void refreshPaymentDelivery(eventId);
    else cb();
    return () => {
      set.delete(cb);
    };
  }, [eventId]);

  return rows;
}

const LABEL: Record<string, string> = {
  pending: "queued",
  sent: "delivered to provider",
  failed: "failed",
  dlq: "failed",
  suppressed: "blocked (unsubscribed)",
  bounced: "bounced",
  complained: "marked as spam",
};

function tone(status: string): string {
  if (status === "sent" || status === "delivered") return "bg-emerald-100 text-emerald-800";
  if (status === "pending") return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-700";
}

/** Latest email + SMS delivery chips for one guest. */
export function GuestDeliveryChips({ eventId, guestId }: { eventId: string; guestId: string }) {
  const rows = usePaymentDelivery(eventId);
  const mine = rows.filter((r) => r.guestId === guestId);
  if (!mine.length) return null;
  const latest = (channel: "email" | "sms") => mine.find((r) => r.channel === channel);
  const email = latest("email");
  const sms = latest("sms");

  return (
    <span className="flex flex-wrap items-center gap-1">
      {email ? (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] ${tone(email.status)}`}
          title={email.error ?? undefined}
        >
          ✉️ {LABEL[email.status] ?? email.status}
        </span>
      ) : null}
      {sms ? (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] ${tone(sms.status)}`}
          title={sms.error ?? undefined}
        >
          💬 {LABEL[sms.status] ?? sms.status}
        </span>
      ) : null}
    </span>
  );
}
