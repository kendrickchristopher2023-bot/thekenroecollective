import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { inviteCohost, listCohosts, revokeCohost, saveHostNotices } from "@/lib/schedules.functions";
import { toUserMessage } from "@/lib/user-error";
import { confirmDialog } from "@/lib/confirm-dialog";

const field = "mt-1 w-full rounded-xl border border-ink/10 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-velvet/30";
const label = "block text-xs font-medium text-muted-foreground";

export const ROLE_LABEL: Record<string, string> = { view: "View the report", edit: "Edit people and messages" };

export function CohostsPanel({ scheduleId }: { scheduleId: string }) {
  const list = useServerFn(listCohosts);
  const invite = useServerFn(inviteCohost);
  const revoke = useServerFn(revokeCohost);
  const [rows, setRows] = useState<any[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"view" | "edit">("view");
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<{ url: string; emailed: boolean; email: string } | null>(null);

  const refresh = useCallback(async () => {
    try { setRows(await list({ data: { id: scheduleId } })); } catch (e) { toast.error(toUserMessage(e)); }
  }, [list, scheduleId]);
  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <section className="space-y-5 rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8">
      <div>
        <h2 className="font-serif text-xl">Co-hosts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Co-hosts see only this schedule and the people on it, never your other schedules or contacts. Texts they send count toward your daily limit and your plan.
        </p>
      </div>

      <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await invite({ data: { id: scheduleId, email, role } });
          setLastLink({ url: r.url, emailed: r.emailed, email });
          toast.success(r.emailed ? "Invitation sent" : "Invitation created");
          setEmail("");
          void refresh();
        } catch (err) { toast.error(toUserMessage(err)); } finally { setBusy(false); }
      }}>
        <label><span className={label}>Email</span>
          <input className={field} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cousin@example.com" aria-label="Co-host email" />
        </label>
        <label><span className={label}>Can</span>
          <select className={field} value={role} onChange={(e) => setRole(e.target.value as any)} aria-label="Co-host role">
            <option value="view">View the report</option>
            <option value="edit">Edit people and messages</option>
          </select>
        </label>
        <button type="submit" disabled={busy || !email} className="rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">Invite</button>
      </form>

      {lastLink ? (
        <div className="rounded-2xl bg-secondary p-4 text-sm">
          <p>{lastLink.emailed ? `We emailed ${lastLink.email}. You can also share this link with them:` : `Share this link with ${lastLink.email}:`}</p>
          <p className="mt-2 break-all font-mono text-xs">{lastLink.url}</p>
          <p className="mt-2 text-xs text-muted-foreground">It only works for someone signed in with that email.</p>
        </div>
      ) : null}

      <ul className="divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
        {(rows ?? []).map((m) => (
          <li key={m.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.invited_email}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABEL[m.role]} · {m.accepted_at ? "Accepted" : "Invited, not accepted yet"}</p>
            </div>
            <button type="button" className="self-start rounded-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 sm:self-auto" onClick={async () => {
              const ok = await confirmDialog({ title: "Remove this co-host?", body: `${m.invited_email} will lose access to this schedule right away.`, confirmLabel: "Remove", tone: "danger" });
              if (!ok) return;
              try { await revoke({ data: { id: scheduleId, memberId: m.id } }); toast.success("Co-host removed"); void refresh(); } catch (e) { toast.error(toUserMessage(e)); }
            }}>Remove</button>
          </li>
        ))}
        {rows && !rows.length ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">No co-hosts yet.</li> : null}
        {!rows ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">Loading...</li> : null}
      </ul>
    </section>
  );
}

const CH_OPTS = [
  { v: "off", l: "Off" },
  { v: "email", l: "Email" },
  { v: "sms", l: "Text" },
  { v: "both", l: "Email and text" },
];

export function HostNoticesSection({ schedule, onChange }: { schedule: any; onChange: () => void }) {
  const save = useServerFn(saveHostNotices);
  const [summary, setSummary] = useState<string>(schedule.summary_channel ?? "off");
  const [instant, setInstant] = useState<string>(schedule.instant_channel ?? "off");
  const [busy, setBusy] = useState(false);
  const dirty = summary !== (schedule.summary_channel ?? "off") || instant !== (schedule.instant_channel ?? "off");
  const noContact = !schedule.host_phone && !schedule.host_email;
  return (
    <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8">
      <h2 className="font-serif text-xl">Updates for you</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sent to the host phone and email in Details{noContact ? ", or to your own profile phone and sign-in email while those are blank" : ""}.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label><span className={label}>Morning-of summary (8 AM on the day)</span>
          <select className={field} value={summary} onChange={(e) => setSummary(e.target.value)} aria-label="Morning-of summary">
            {CH_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">Counts of who will attend, may attend, cannot attend and has not answered, with a link to the report.</span>
        </label>
        <label><span className={label}>Tell me when someone answers</span>
          <select className={field} value={instant} onChange={(e) => setInstant(e.target.value)} aria-label="Instant notice">
            {CH_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">At most one message every 15 minutes, listing every new answer. Texts wait until 8 AM.</span>
        </label>
      </div>
      <button type="button" disabled={busy || !dirty} className="mt-4 rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50" onClick={async () => {
        setBusy(true);
        try { await save({ data: { id: schedule.id, summary: summary as any, instant: instant as any } }); toast.success("Saved"); onChange(); }
        catch (e) { toast.error(toUserMessage(e)); } finally { setBusy(false); }
      }}>Save updates</button>
    </section>
  );
}
