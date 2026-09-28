import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { bulkUpdatePeople, editPerson, getPersonUsage } from "@/lib/schedules.functions";
import { toUserMessage } from "@/lib/user-error";
import { confirmDialog } from "@/lib/confirm-dialog";

const field = "mt-1 w-full rounded-xl border border-ink/10 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-velvet/30";
const label = "block text-xs font-medium text-muted-foreground";
const chip = "rounded-full bg-secondary px-3 py-1.5 text-xs disabled:opacity-50";
const CH_LABEL: Record<string, string> = { both: "Email and text", email: "Email only", sms: "Text only" };

type Person = any;
const nameOf = (p: Person) => p.contact?.display_name || p.contact?.email || p.contact?.phone || "Unnamed";

export function SchedulePeopleList({ scheduleId, people, removedPeople, onChange }: { scheduleId: string; people: Person[]; removedPeople: Person[]; onChange: () => void }) {
  const bulk = useServerFn(bulkUpdatePeople);
  const [rows, setRows] = useState<Person[]>(people);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [channelAsk, setChannelAsk] = useState<null | "email" | "sms" | "both">(null);
  const [failed, setFailed] = useState<{ name: string | null; reason: string }[]>([]);

  useEffect(() => setRows(people), [people]);
  useEffect(() => { setPicked((s) => new Set([...s].filter((id) => people.some((p) => p.id === id)))); }, [people]);

  const q = search.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const shown = useMemo(() => rows.filter((p) => {
    if (!q) return true;
    const text = `${p.contact?.display_name ?? ""} ${p.contact?.email ?? ""}`.toLowerCase();
    const digits = String(p.contact?.phone ?? "").replace(/\D/g, "");
    return text.includes(q) || (qDigits.length >= 3 && digits.includes(qDigits));
  }), [rows, q, qDigits]);
  const allShownPicked = shown.length > 0 && shown.every((p) => picked.has(p.id));
  const ids = [...picked];

  async function run(action: "remove" | "restore" | "pause" | "resume" | "channel", personIds: string[], extra: { channel?: "email" | "sms" | "both"; smsConsent?: boolean } = {}) {
    setBusy(true);
    try {
      const r = await bulk({ data: { scheduleId, personIds, action, ...extra } });
      setFailed(r.failed);
      if (action !== "remove" && action !== "restore") {
        toast.success(`${r.changed} ${r.changed === 1 ? "person" : "people"} updated${r.failed.length ? `, ${r.failed.length} could not be changed` : ""}`);
      }
      setPicked(new Set());
      onChange();
      return r;
    } catch (e) {
      toast.error(toUserMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected(list: string[]) {
    const n = list.length;
    const ok = await confirmDialog({
      title: `Remove ${n} ${n === 1 ? "person" : "people"} from this schedule?`,
      body: "They stay in your contacts and on any other schedules.",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    const r = await run("remove", list);
    if (!r || !r.changed) return;
    const undoIds = r.changedIds;
    toast.success(`Removed ${r.changed} ${r.changed === 1 ? "person" : "people"}`, {
      duration: 10000,
      action: { label: "Undo", onClick: () => { void run("restore", undoIds).then((u) => u && toast.success("Added back")); } },
    });
  }

  return (
    <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl">On this schedule <span className="text-sm text-muted-foreground">({rows.length})</span></h2>
      </div>

      {rows.length ? (
        <input className={`${field} mt-4`} placeholder="Search by name, phone or email" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search people on this schedule" />
      ) : null}

      {rows.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-secondary/40 p-3">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" className="h-4 w-4" checked={allShownPicked} aria-label="Select all"
              onChange={(e) => setPicked((s) => { const n = new Set(s); for (const p of shown) e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })} />
            {q ? "Select all shown" : "Select all"}
          </label>
          <span className="text-xs text-muted-foreground" aria-live="polite">{picked.size} selected</span>
          {picked.size ? (
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <button type="button" className={chip} disabled={busy} onClick={() => void run("pause", ids)}>Pause reminders</button>
              <button type="button" className={chip} disabled={busy} onClick={() => void run("resume", ids)}>Resume reminders</button>
              <select className="rounded-full border border-ink/10 bg-background px-3 py-1.5 text-xs" value="" disabled={busy} aria-label="Change channel for selected"
                onChange={(e) => {
                  const ch = e.target.value as "email" | "sms" | "both";
                  if (!ch) return;
                  const missing = rows.filter((p) => picked.has(p.id) && !p.sms_consent_at).length;
                  if (ch !== "email" && missing) setChannelAsk(ch); else void run("channel", ids, { channel: ch });
                }}>
                <option value="">Change to...</option>
                <option value="email">Email only</option><option value="sms">Text only</option><option value="both">Email and text</option>
              </select>
              <button type="button" className="rounded-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10" disabled={busy} onClick={() => void removeSelected(ids)}>Remove from schedule</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {channelAsk ? (
        <ConsentAsk
          count={rows.filter((p) => picked.has(p.id) && !p.sms_consent_at).length}
          onCancel={() => setChannelAsk(null)}
          onConfirm={(consent) => { const ch = channelAsk; setChannelAsk(null); void run("channel", ids, { channel: ch, smsConsent: consent }); }}
        />
      ) : null}

      {failed.length ? (
        <div className="mt-3 rounded-2xl bg-amber-100 p-3 text-xs text-amber-900" role="status">
          <p className="font-medium">{failed.length} could not be changed:</p>
          <ul className="mt-1 list-disc pl-5">{failed.map((f, i) => <li key={i}>{f.name ?? "Unknown person"}: {f.reason}</li>)}</ul>
          <button type="button" className="mt-2 underline" onClick={() => setFailed([])}>Dismiss</button>
        </div>
      ) : null}

      {!rows.length ? <p className="mt-3 text-sm text-muted-foreground">Nobody yet.</p> : (
        <ul className="mt-3 divide-y divide-ink/5">
          {shown.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <label className="flex min-w-0 flex-1 items-center gap-3">
                <input type="checkbox" className="h-4 w-4 shrink-0" checked={picked.has(p.id)} aria-label={`Select ${nameOf(p)}`}
                  onChange={(e) => setPicked((s) => { const n = new Set(s); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{nameOf(p)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[p.contact?.email, p.contact?.phone].filter(Boolean).join(" · ")}{p.contact?.email_opt_out ? " · unsubscribed from email" : ""}
                  </span>
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-2 pl-7 sm:pl-0">
                <span className="rounded-full bg-secondary/60 px-2.5 py-1 text-xs">{CH_LABEL[p.channel] ?? p.channel}</span>
                {p.paused ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-900">Paused</span> : null}
                <button type="button" className={chip} onClick={() => setEditing(p)}>Edit</button>
                <button type="button" className="rounded-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10" disabled={busy} onClick={() => void removeSelected([p.id])}>Remove</button>
              </div>
            </li>
          ))}
          {!shown.length ? <li className="py-3 text-sm text-muted-foreground">Nobody matches "{search}".</li> : null}
        </ul>
      )}

      {removedPeople.length ? (
        <details className="mt-6 rounded-2xl ring-1 ring-ink/10">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Removed people ({removedPeople.length})</summary>
          <ul className="divide-y divide-ink/5 px-4 pb-2">
            {removedPeople.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{nameOf(p)} <span className="text-xs text-muted-foreground">{[p.contact?.email, p.contact?.phone].filter(Boolean).join(" · ")}</span></span>
                <button type="button" className={chip} disabled={busy} onClick={() => void run("restore", [p.id]).then((r) => r?.changed && toast.success("Added back"))}>Add back</button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {editing ? (
        <EditPersonDialog
          person={editing}
          onClose={() => setEditing(null)}
          onSaved={(patch) => {
            if (patch) setRows((rs) => rs.map((r) => (r.id === editing.id ? { ...r, ...patch.person, contact: { ...r.contact, ...patch.contact } } : r)));
            setEditing(null);
            onChange();
          }}
        />
      ) : null}
    </section>
  );
}

function ConsentAsk({ count, onCancel, onConfirm }: { count: number; onCancel: () => void; onConfirm: (consent: boolean) => void }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="mt-3 rounded-2xl bg-secondary/60 p-4 text-sm">
      <p>{count} of the selected {count === 1 ? "person has" : "people have"} no text consent on record.</p>
      <label className="mt-2 flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>These people agreed to get text reminders from me.</span>
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-primary-foreground" onClick={() => onConfirm(ok)}>
          {ok ? "Change all selected" : "Change only those with consent"}
        </button>
        <button type="button" className={chip} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function EditPersonDialog({ person, onClose, onSaved }: { person: Person; onClose: () => void; onSaved: (patch: { person: any; contact: any } | null) => void }) {
  const save = useServerFn(editPerson);
  const usage = useServerFn(getPersonUsage);
  const [name, setName] = useState(person.contact?.display_name ?? "");
  const [phone, setPhone] = useState(person.contact?.phone ?? "");
  const [email, setEmail] = useState(person.contact?.email ?? "");
  const [channel, setChannel] = useState<"email" | "sms" | "both">(person.channel);
  const [paused, setPaused] = useState(!!person.paused);
  const [consent, setConsent] = useState(false);
  const [needConsent, setNeedConsent] = useState<string | null>(null);
  const [conflict, setConflict] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [use, setUse] = useState<{ otherSchedules: number; events: number } | null>(null);

  useEffect(() => { void usage({ data: { personId: person.id } }).then(setUse).catch(() => setUse(null)); }, [usage, person.id]);

  const digits = (s: string) => { const d = s.replace(/\D/g, ""); return d.length === 11 && d.startsWith("1") ? d.slice(1) : d; };
  const phoneChanged = digits(phone) !== digits(person.contact?.phone ?? "");
  const showConsent = channel !== "email" && (phoneChanged || !person.sms_consent_at || !!needConsent);
  const who = person.contact?.display_name || "this person";
  const others = use ? [use.otherSchedules ? `${use.otherSchedules} other ${use.otherSchedules === 1 ? "schedule" : "schedules"}` : "", use.events ? `${use.events} ${use.events === 1 ? "event" : "events"}` : ""].filter(Boolean) : [];

  async function submit(useExistingContactId?: string) {
    setBusy(true); setError(null);
    try {
      const r: any = await save({ data: { personId: person.id, name, phone, email, channel, paused, smsConsent: consent, useExistingContactId: useExistingContactId ?? null } });
      if (!r.ok) {
        if (r.conflict) setConflict(r.conflict);
        else if (r.needsConsent) { setNeedConsent(r.message); setError(r.message); }
        return;
      }
      toast.success(r.swapped ? "Switched to the existing contact" : "Saved");
      onSaved(r.swapped ? null : { person: { channel, paused, ...(phoneChanged ? { first_sms_sent_at: null } : {}), ...(showConsent && consent ? { sms_consent_at: new Date().toISOString() } : {}) }, contact: { display_name: name.trim() || null, phone: phone.trim() ? phone : null, email: email.trim().toLowerCase() || null } });
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`Edit ${who}`}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-card p-6 shadow-xl sm:max-w-lg sm:rounded-3xl">
        <h3 className="font-serif text-xl">Edit {who}</h3>
        {others.length ? (
          <p className="mt-2 rounded-2xl bg-secondary/60 p-3 text-xs">This also updates {who} on {others.join(" and ")}.</p>
        ) : null}
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <label className="block"><span className={label}>Name</span><input className={field} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="block"><span className={label}>Phone</span><input className={field} value={phone} inputMode="tel" onChange={(e) => { setPhone(e.target.value); setConflict(null); }} /></label>
          <label className="block"><span className={label}>Email</span><input className={field} value={email} inputMode="email" onChange={(e) => { setEmail(e.target.value); setConflict(null); }} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className={label}>Reminders by</span>
              <select className={field} value={channel} onChange={(e) => setChannel(e.target.value as any)}>
                <option value="both">Email and text</option><option value="email">Email only</option><option value="sms">Text only</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm sm:mt-6"><input type="checkbox" className="h-4 w-4" checked={paused} onChange={(e) => setPaused(e.target.checked)} /> Pause reminders</label>
          </div>
          {showConsent ? (
            <label className="flex items-start gap-3 rounded-2xl bg-secondary/60 p-3 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                {phoneChanged && person.contact?.phone ? "This person agreed to get text reminders at this new number." : "This person agreed to get text reminders from me."}
                <span className="block text-xs text-muted-foreground">The first text to this number says it is from you and how to reply STOP.</span>
              </span>
            </label>
          ) : null}

          {conflict ? (
            <div className="rounded-2xl bg-amber-100 p-3 text-sm text-amber-900">
              <p>{[conflict.phone, conflict.email].filter(Boolean).join(" or ")} already belongs to <b>{conflict.name || "another contact"}</b> in your contacts.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-primary-foreground" disabled={busy} onClick={() => void submit(conflict.id)}>Use the existing contact</button>
                <button type="button" className={chip} onClick={onClose}>Cancel</button>
              </div>
            </div>
          ) : null}
          {error ? <p className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p> : null}

          <div className="flex flex-wrap gap-2 pt-2">
            <button type="submit" className="rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={busy || !!conflict || (!phone.trim() && !email.trim()) || (showConsent && !consent)}>Save</button>
            <button type="button" className="rounded-full bg-secondary px-4 py-2 text-sm" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
