// Co-hosts with real ACCESS (as opposed to the credited "hosts" shown on the
// invite). Only the event's owner sees this card; everything it does is
// re-checked server-side in event-cohosts.functions.ts.
import { toUserMessage } from "@/lib/user-error";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getCollaboratorSeats,
  inviteEventMember,
  listEventMembers,
  removeEventMember,
  resendEventMemberInvite,
  type EventMemberRow,
} from "@/lib/event-cohosts.functions";
import { formatStampDate } from "@/lib/datetime";

const ROLE_LABEL: Record<"cohost" | "viewer", string> = {
  cohost: "Co-host (can edit)",
  viewer: "Viewer (read only)",
};

export function EventCollaboratorsCard({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<EventMemberRow[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"cohost" | "viewer">("cohost");
  const [busy, setBusy] = useState(false);
  const [seats, setSeats] = useState<{
    cap: number;
    used: number;
    canInvite: boolean;
    revokedForDowngrade?: number;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, seatState] = await Promise.all([
        listEventMembers({ data: { eventId } }),
        getCollaboratorSeats({ data: { eventId } }).catch(() => null),
      ]);
      setRows(list);
      setSeats(seatState);
    } catch {
      // Not the owner, or offline: hide the card rather than showing an error.
      setRows([]);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async () => {
    const clean = email.trim().toLowerCase();
    if (!clean.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const res = await inviteEventMember({ data: { eventId, email: clean, role } });
      setEmail("");
      await load();
      toast.success(
        res.emailed
          ? `Invitation sent to ${clean}.`
          : `${clean} was added. We couldn't send the email, so share the link below.`,
      );
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't send that invitation."));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/cohost/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invitation link copied.");
    } catch {
      toast.error("Couldn't copy. The link is " + url);
    }
  };

  return (
    <div className="rounded-xl border border-ink/5 bg-card p-5">
      <h3 className="font-serif text-lg text-ink">Give someone access</h3>
      <p className="mt-1 text-sm text-ink/70">
        Invite a partner, planner or family member to help run this event. Co-hosts can edit
        everything except billing and deleting the event. Viewers can look, not touch.
      </p>
      {seats ? (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-ink/60">
            {seats.cap === 0
              ? "Your plan doesn't include collaborators. Upgrade to share this event."
              : `${seats.used} of ${seats.cap} collaborator seat${seats.cap === 1 ? "" : "s"} used on your plan.`}
            {seats.cap > 0 && !seats.canInvite
              ? " Remove one or upgrade to invite another."
              : ""}
          </p>
          {seats.revokedForDowngrade ? (
            <p className="text-xs text-ink/70">
              Your plan covers {seats.cap} seat{seats.cap === 1 ? "" : "s"}, so{" "}
              {seats.revokedForDowngrade} collaborator
              {seats.revokedForDowngrade === 1 ? "'s" : "s'"} access was removed. Upgrade to get
              those seats back, or invite someone new within your current plan.
            </p>
          ) : null}
          {!seats.canInvite || seats.revokedForDowngrade ? (
            <a
              href="/pricing"
              className="inline-flex min-h-[44px] items-center rounded-md border border-ink/15 px-3 text-xs font-medium text-ink hover:bg-ink/5"
            >
              Upgrade your plan
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="their@email.com"
          className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
          aria-label="Collaborator email"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "cohost" | "viewer")}
          className="rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
          aria-label="Collaborator role"
        >
          <option value="cohost">Co-host</option>
          <option value="viewer">Viewer</option>
        </select>
        <button
          onClick={invite}
          disabled={busy}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Invite"}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {rows === null ? (
          <p className="text-sm text-ink/50">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-ink/15 px-4 py-6 text-center text-sm text-ink/55">
            No one else has access yet. You're running this solo.
          </p>
        ) : (
          rows.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/5 bg-secondary/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{m.invited_email}</p>
                <p className="text-xs text-ink/60">
                  {ROLE_LABEL[m.role]} ·{" "}
                  {m.status === "active"
                    ? "Accepted"
                    : m.expires_at && new Date(m.expires_at).getTime() < Date.now()
                      ? "Invitation expired · resend to reopen"
                      : m.expires_at
                        ? `Invitation pending · expires ${formatStampDate((m.expires_at))}`
                        : "Invitation pending"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {m.status !== "active" && (
                  <>
                    <button
                      onClick={() => copyLink(m.token)}
                      className="rounded-md border border-ink/10 px-2 py-1 text-xs text-ink/70 hover:bg-ink/5"
                    >
                      Copy link
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await resendEventMemberInvite({ data: { memberId: m.id } });
                          await load();
                          toast.success("Invitation resent. It's valid for another 14 days.");
                        } catch (err) {
                          toast.error(toUserMessage(err, "Couldn't resend."));
                        }
                      }}
                      className="rounded-md border border-ink/10 px-2 py-1 text-xs text-ink/70 hover:bg-ink/5"
                    >
                      Resend
                    </button>
                  </>
                )}
                <button
                  onClick={async () => {
                    try {
                      await removeEventMember({ data: { memberId: m.id } });
                      await load();
                      toast.success("Access removed.");
                    } catch (err) {
                      toast.error(toUserMessage(err, "Couldn't remove access."));
                    }
                  }}
                  className="rounded-md border border-ink/10 px-2 py-1 text-xs text-ink/60 hover:bg-ink/5"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
