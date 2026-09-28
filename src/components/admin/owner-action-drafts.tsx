// Owner AI analyst, Tier 2: the approval surface.
//
// The assistant can only draft. Nothing here happens until an owner clicks
// Approve, and refunds over $100 also need the amount typed in first. The
// server re-checks every rule again, so this UI is a convenience, not the
// safeguard.
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  KIND_LABELS,
  displayStatus,
  formatMoney,
  parseAmountToCents,
  type DraftedAction,
} from "@/lib/owner-ai-actions";
import {
  approveOwnerAction,
  listOwnerActions,
  rejectOwnerAction,
} from "@/lib/owner-ai-actions.functions";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-900 ring-amber-600/20",
  executing: "bg-sky-50 text-sky-900 ring-sky-600/20",
  executed: "bg-emerald-50 text-emerald-900 ring-emerald-600/20",
  failed: "bg-rose-50 text-rose-900 ring-rose-600/20",
  rejected: "bg-secondary text-muted-foreground ring-ink/10",
  expired: "bg-secondary text-muted-foreground ring-ink/10",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Waiting for your approval",
  executing: "Being carried out",
  executed: "Done",
  failed: "Did not go through",
  rejected: "Rejected",
  expired: "Expired after 24 hours",
};

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

function DraftCard({
  action,
  onChanged,
}: {
  action: DraftedAction;
  onChanged: (a: DraftedAction) => void;
}) {
  const approve = useServerFn(approveOwnerAction);
  const reject = useServerFn(rejectOwnerAction);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const status = displayStatus({ status: action.status, expires_at: action.expiresAt });
  const pending = status === "pending";
  const needsTyped = action.requiresAmountConfirmation;
  const typedCents = parseAmountToCents(typed);
  const typedOk = !needsTyped || typedCents === action.amountCents;

  const run = async (kind: "approve" | "reject") => {
    setBusy(true);
    setErr(null);
    try {
      const r =
        kind === "approve"
          ? await approve({
              data: {
                actionId: action.id,
                confirmAmountCents: needsTyped ? typedCents : null,
              },
            })
          : await reject({ data: { actionId: action.id, reason: null } });
      onChanged(r.action);
    } catch (e: any) {
      setErr(e?.message ?? "That could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-ink/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-ink px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-paper">
              {KIND_LABELS[action.kind]}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${STATUS_STYLES[status]}`}
            >
              {STATUS_LABELS[status]}
            </span>
            {pending && (
              <span className="text-[11px] text-muted-foreground">{timeLeft(action.expiresAt)}</span>
            )}
          </div>
          <p className="mt-2 text-sm text-ink">{action.summary}</p>
          {action.amountCents != null && (
            <p className="mt-1 text-sm font-medium text-ink">{formatMoney(action.amountCents)}</p>
          )}
        </div>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Exact details
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-secondary/60 p-3 text-[11px] text-ink">
          {JSON.stringify(action.payload, null, 2)}
        </pre>
      </details>

      {err && (
        <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-900 ring-1 ring-rose-600/20">
          {err}
        </p>
      )}
      {action.error && status === "failed" && (
        <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-900 ring-1 ring-rose-600/20">
          {action.error}
        </p>
      )}

      {pending ? (
        <div className="mt-4 space-y-3 border-t border-ink/10 pt-3">
          {needsTyped && (
            <div>
              <label
                htmlFor={`confirm-${action.id}`}
                className="block text-xs text-muted-foreground"
              >
                This is over $100. Type {formatMoney(action.amountCents)} to confirm.
              </label>
              <input
                id={`confirm-${action.id}`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={formatMoney(action.amountCents)}
                className="mt-1 min-h-10 w-40 rounded-full bg-secondary px-4 text-sm focus:outline-none focus:ring-2 focus:ring-velvet/40"
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void run("approve")}
              disabled={busy || !typedOk}
              className="min-h-10 rounded-full bg-velvet px-5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Working..." : "Approve and carry out"}
            </button>
            <button
              onClick={() => void run("reject")}
              disabled={busy}
              className="min-h-10 rounded-full bg-secondary px-5 text-sm font-medium text-ink ring-1 ring-ink/10 hover:bg-secondary/70 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 border-t border-ink/10 pt-3 text-[11px] text-muted-foreground">
          {status === "executed" && action.approvedByEmail
            ? `Approved by ${action.approvedByEmail}.`
            : status === "rejected" && action.rejectedByEmail
              ? `Rejected by ${action.rejectedByEmail}.`
              : "No longer actionable."}
        </p>
      )}
    </div>
  );
}

export function OwnerActionDrafts({
  threadId,
  refreshKey,
}: {
  threadId: string | null;
  refreshKey: number;
}) {
  const load = useServerFn(listOwnerActions);
  const [actions, setActions] = useState<DraftedAction[] | null>(null);

  const refresh = useCallback(() => {
    load({ data: { threadId } })
      .then((r) => setActions(r.actions))
      .catch(() => setActions([]));
  }, [load, threadId]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  if (!actions || actions.length === 0) return null;

  return (
    <div className="rounded-2xl bg-secondary/30 p-4 ring-1 ring-ink/5">
      <h3 className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Drafts waiting on you
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        The assistant can only draft these. Nothing happens until you approve, and every draft
        expires after 24 hours.
      </p>
      <div className="mt-3 space-y-3">
        {actions.map((a) => (
          <DraftCard
            key={a.id}
            action={a}
            onChanged={(next) =>
              setActions((prev) => (prev ?? []).map((x) => (x.id === next.id ? next : x)))
            }
          />
        ))}
      </div>
    </div>
  );
}
