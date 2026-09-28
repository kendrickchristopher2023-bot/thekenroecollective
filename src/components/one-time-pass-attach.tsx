import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listMyPasses, attachPassToEvent, type OneTimePass } from "@/lib/one-time-passes.functions";
import { checkRefundEligibility, requestPassRefund, type RefundEligibility } from "@/lib/refunds.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { confirmDialog } from "@/lib/confirm-dialog";
import { formatStampDate } from "@/lib/datetime";

const TIER_LABEL: Record<OneTimePass["tier"], string> = {
  whisper: "Whisper — Single Event",
  host: "Host — Single Event",
  atelier: "Atelier — Single Event",
};

export function OneTimePassAttach({ eventId }: { eventId: string }) {
  const [passes, setPasses] = useState<OneTimePass[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [refundState, setRefundState] = useState<Record<string, RefundEligibility>>({});

  const refresh = async () => {
    try {
      const rows = await listMyPasses();
      setPasses(rows);
      // Preload eligibility for the pass attached here (if any).
      const attached = rows.find((p) => p.event_id === eventId);
      if (attached) {
        try {
          const r = await checkRefundEligibility({ data: { passId: attached.id } });
          setRefundState((s) => ({ ...s, [attached.id]: r }));
        } catch {}
      }
    } catch {
      setPasses([]);
    }
  };

  useEffect(() => { void refresh(); }, [eventId]);

  const attachedHere = useMemo(() => passes?.find((p) => p.event_id === eventId), [passes, eventId]);
  const unattached = useMemo(() => (passes ?? []).filter((p) => !p.event_id && !p.revoked_at), [passes]);
  if (!passes) return null;
  if (!attachedHere && unattached.length === 0) return null;

  const environment = (() => {
    try { return getStripeEnvironment(); } catch { return "sandbox" as const; }
  })();

  const eligibility = attachedHere ? refundState[attachedHere.id] : undefined;
  const finalityReason = (() => {
    if (!attachedHere || !eligibility || eligibility.eligible) return null;
    switch (eligibility.reason) {
      case "materially_used": return "This purchase is final — the pass has been used.";
      case "window_expired": return "This purchase is final — the 24-hour cancellation window has passed.";
      case "already_refunded": return "This pass was refunded.";
      case "revoked": return "This pass is no longer active.";
      default: return null;
    }
  })();

  return (
    <div className="mb-6 rounded-2xl border border-velvet/20 bg-paper p-5">
      <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">Single-event pass</p>

      {attachedHere && (
        <>
          <h3 className="mt-1 font-serif text-lg">{TIER_LABEL[attachedHere.tier]} attached</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Active for this event through {formatStampDate((attachedHere.expires_at))}.
            {attachedHere.tier === "atelier" && typeof attachedHere.ai_generations_cap === "number" && (
              <> AI generations used: {attachedHere.ai_generations_used} / {attachedHere.ai_generations_cap}.</>
            )}
          </p>

          {eligibility?.eligible && (
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (
                    !(await confirmDialog({
                      title: "Cancel this pass and refund it?",
                      body: "The pass stops working on this event right away and the money goes back to your card. This cannot be undone.",
                      confirmLabel: "Yes, cancel and refund",
                    }))
                  )
                    return;
                  setBusy(true);
                  try {
                    const res = await requestPassRefund({
                      data: { passId: attachedHere.id, environment, reason: "self_serve_24h" },
                    });
                    if ("error" in res) {
                      toast.error(res.error);
                    } else {
                      toast.success("Refund issued. It will settle to your card in 5–10 business days.");
                      await refresh();
                    }
                  } finally { setBusy(false); }
                }}
                className="rounded-full border border-ink/15 px-4 py-1.5 text-xs font-medium text-ink hover:border-velvet/40 disabled:opacity-50"
              >
                Cancel purchase & refund
              </button>
              <span className="text-[11px] text-muted-foreground">
                Within 24h of purchase, unused only. One refund per customer.
              </span>
            </div>
          )}
          {!eligibility?.eligible && finalityReason && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {finalityReason}
              {eligibility?.hasPriorRefund && " (Prior refund on file — additional refund requests require support.)"}
            </p>
          )}
        </>
      )}

      {!attachedHere && unattached.length > 0 && (
        <>
          <h3 className="mt-1 font-serif text-lg">Attach a pass to this event</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Each pass unlocks its tier's features for a single event. Access window: event date + 90 days, up to 12 months from purchase.
          </p>
          <div className="mt-3 space-y-2">
            {unattached.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await attachPassToEvent({ data: { passId: p.id, eventId } });
                    if ("error" in res) toast.error(res.error);
                    else {
                      toast.success("Pass attached to this event.");
                      await refresh();
                    }
                  } finally { setBusy(false); }
                }}
                className="flex w-full items-center justify-between rounded-full border border-ink/10 bg-secondary/40 px-4 py-2 text-left text-sm hover:border-velvet/40 disabled:opacity-50"
              >
                <span>
                  <span className="font-medium">{TIER_LABEL[p.tier]}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    purchased {formatStampDate((p.purchased_at))}
                  </span>
                </span>
                <span className="text-xs font-medium text-velvet">Attach →</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
