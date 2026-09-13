import { toUserMessage } from "@/lib/user-error";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { queueSms, listSmsOutbox, getSmsProviderStatus } from "@/lib/sms.functions";
import { useSmsOptOutSet, normalizePhone } from "@/hooks/use-sms-opt-outs";
import { UpgradeGateCard } from "@/components/upgrade-gate-card";
import { getEntitlements } from "@/lib/entitlements-client";
import { usePreviewTier } from "@/lib/preview-tier";
import type { KEvent, Guest } from "@/lib/events-store";
import { GuestAudiencePicker } from "@/components/guest-audience-picker";
import { useLocalDraft } from "@/hooks/use-local-draft";



interface Props {
  event: KEvent;
  eventId: string;
}


interface OutboxRow {
  id: string;
  to_phone: string;
  guest_id?: string | null;
  guest_name: string | null;
  body: string;
  status: string;
  error: string | null;
  created_at: string;
  sent_at: string | null;
}

export function SmsRemindersPanel({ event, eventId }: Props) {
  const [hasSmsReminders, setHasSmsReminders] = useState<boolean | undefined>(undefined);
  const queue = useServerFn(queueSms);
  const list = useServerFn(listSmsOutbox);
  const getStatus = useServerFn(getSmsProviderStatus);
  const [providerConnected, setProviderConnected] = useState(false);
  const [carrierPending, setCarrierPending] = useState(false);
  const previewTier = usePreviewTier();


  useEffect(() => {
    let alive = true;
    getEntitlements().then((e) => { if (alive) setHasSmsReminders(e.hasSmsReminders); }).catch(() => { if (alive) setHasSmsReminders(false); });
    return () => { alive = false; };
  }, [previewTier]);

  // The number guests see is an unknown 10-digit long code, so the body must
  // name the event and the host up front or it reads as spam.
  const hostFirstName = (event.hosts?.[0]?.name || "").trim().split(/\s+/)[0] || "";
  const [body, setBody] = useState(
    // Short link (/s/<eventId>) keeps SMS inside a single segment on production.
    // "Reply YES or NO" is the whole point for guests who never open links.
    `${event.title || "Our event"} — ${hostFirstName ? `${hostFirstName} here. ` : ""}Can you come? Reply YES or NO. Details: ${typeof window !== "undefined" ? window.location.origin : ""}/s/${eventId}`,
  );
  const [sending, setSending] = useState(false);

  // Same protection as the announcement composer: a half-written text survives
  // navigation instead of being replaced by the generated default.
  const smsDraft = useMemo(() => ({ body }), [body]);
  useLocalDraft(
    `kenroe:sms-draft:${eventId}`,
    smsDraft,
    (d) => {
      if (typeof d.body === "string" && d.body.trim()) setBody(d.body.slice(0, 320));
    },
    (d) => !String(d.body ?? "").trim(),
  );

  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [selected, setSelected] = useState<Guest[]>([]);
  const optOutSet = useSmsOptOutSet();

  /** Most recent text per guest, so nobody gets the same reminder twice today. */
  const lastTextedAt = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rows) {
      const id = (r as any).guest_id as string | null;
      if (!id) continue;
      const at = r.sent_at || r.created_at;
      if (!map[id] || at > map[id]!) map[id] = at;
    }
    return map;
  }, [rows]);

  const recipients = useMemo(
    () => selected.map((g) => ({ phone: g.phone, guestId: g.id, guestName: g.name })),
    [selected],
  );

  useEffect(() => {
    let alive = true;
    list({ data: { eventId } })
      .then((r) => alive && setRows(r.rows as OutboxRow[]))
      .catch(() => {});
    getStatus()
      .then((s) => {
        if (!alive) return;
        setProviderConnected(!!s?.connected);
        setCarrierPending(!!s?.configured && !s?.carrierApproved);
      })
      .catch(() => {});

    return () => { alive = false; };
  }, [eventId, list, getStatus]);

  const onSend = async () => {
    if (!body.trim() || recipients.length === 0 || sending) return;
    setSending(true);
    try {
      const r = await queue({ data: { eventId, body: body.trim(), recipients } });
      const count = `${r.queued} message${r.queued === 1 ? "" : "s"}`;
      toast.success(
        providerConnected
          ? `Queued ${count}. Sending within a minute.`
          : carrierPending
          ? `Queued ${count}. They'll send once carrier approval clears.`
          : `Queued ${count}. They'll send once SMS is connected.`,
      );

      if (r.blockedCap > 0) {
        toast.warning(
          `${r.blockedCap} guest${r.blockedCap === 1 ? "" : "s"} not texted — you've reached your plan's SMS limit for this event. Upgrade for a higher limit.`,
          { duration: 8000 },
        );
      }
      const fresh = await list({ data: { eventId } });
      setRows(fresh.rows as OutboxRow[]);
    } catch (err) {
      const msg = toUserMessage(err, "Couldn't queue messages.");
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const remaining = 320 - body.length;

  if (hasSmsReminders === undefined) return null;

  if (!hasSmsReminders) {
    return <UpgradeGateCard feature="sms_reminders" />;
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>

          <h3 className="text-base font-medium text-ink">SMS reminders</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {providerConnected
              ? "Compose a text — queued messages send within a minute."
              : carrierPending
              ? "Compose and queue reminders now. Delivery is awaiting carrier approval of our SMS registration — queued messages send automatically once it clears, and nothing is lost in the meantime."
              : "Compose a text and queue it for guests with a phone on file. Messages stay pending until SMS is connected on the server."}
          </p>
        </div>
      </div>

      {carrierPending && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
          Pending carrier approval — US carriers require A2P 10DLC registration before messages can be delivered. Your
          queued reminders are saved and will send as soon as approval lands.
        </div>
      )}




      <div className="mt-4">
        <GuestAudiencePicker
          guests={event.guests || []}
          channel="sms"
          optedOutPhones={optOutSet}
          normalizePhone={normalizePhone}
          lastTextedAt={lastTextedAt}
          defaultFilter="unanswered"
          onChange={setSelected}
        />
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 320))}
        rows={4}
        className="mt-3 w-full rounded-xl border border-ink/15 bg-secondary/30 p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-velvet/30"
        placeholder="Write your reminder..."
      />
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Keep it under 160 chars for a single SMS segment.</span>
        <span>{remaining} left</span>
      </div>

      <button
        type="button"
        onClick={onSend}
        disabled={sending || !body.trim() || recipients.length === 0}
        className="mt-3 inline-flex items-center justify-center rounded-full bg-velvet px-5 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50"
      >
        {sending ? "Queuing…" : `Queue for ${recipients.length} guest${recipients.length === 1 ? "" : "s"}`}
      </button>

      {rows.length > 0 && (
        <div className="mt-5">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent</h4>
          <ul className="mt-2 divide-y divide-ink/5 text-sm">
            {rows.slice(0, 10).map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-ink">{r.guest_name || r.to_phone}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.body}</div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase ${
                    r.status === "sent"
                      ? "bg-emerald-100 text-emerald-700"
                      : r.status === "failed"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
