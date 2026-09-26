import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getWelcome, saveWelcome } from "@/lib/schedules.functions";
import { renderTemplate, firstName, whenLabel, smsSegments, composeScheduleSms, MERGE_FIELDS, hostSmsLine, hostFromSchedule } from "@/lib/schedule-messages";
import { SKIP_LABEL } from "@/components/schedule-send-now";
import { toUserMessage } from "@/lib/user-error";
import { eventInstant } from "@/lib/datetime";

type Channel = "email" | "sms" | "both";

const field = "mt-1 w-full rounded-xl border border-ink/10 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-velvet/30";
const label = "block text-xs font-medium text-muted-foreground";
const btn = "rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50";

export const DEFAULT_WELCOME =
  "Hi {first_name}, {title} is on the calendar, starting {when}. You'll get reminders from this number before each one. Add it to your calendar: {calendar}";

const STATUS_LABEL: Record<string, string> = {
  queued: "Text sent",
  sent: "Email sent",
  delivered: "Delivered",
  dry_run: "Test run, not sent",
  pending: "Sending",
};

/** Wall clock "YYYY-MM-DDTHH:mm" for an instant, read in the zone. */
function wallIn(at: Date, tz: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function zoneShort(tz: string, at = new Date()) {
  return at.toLocaleString("en-US", { timeZone: tz, timeZoneName: "short" }).split(" ").pop();
}

export function WelcomeSection({ schedule, people, occurrences, onChange }: { schedule: any; people: any[]; occurrences: any[]; onChange: () => void }) {
  const load = useServerFn(getWelcome);
  const save = useServerFn(saveWelcome);
  const tz = schedule.timezone as string;
  const [w, setW] = useState<any>(null);
  const [enabled, setEnabled] = useState(false);
  const [local, setLocal] = useState("");
  const [channel, setChannel] = useState<Channel>("both");
  const [subject, setSubject] = useState("Welcome: {title}");
  const [body, setBody] = useState(DEFAULT_WELCOME);
  const [late, setLate] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const r = await load({ data: { id: schedule.id } });
    setW(r);
    setEnabled(r.enabled);
    setChannel(r.channel);
    setLate(r.lateJoiners);
    if (r.subject) setSubject(r.subject);
    if (r.body) setBody(r.body);
    if (r.at) setLocal(wallIn(new Date(r.at), tz));
    else {
      const tomorrow = wallIn(new Date(Date.now() + 86_400_000), tz).slice(0, 10);
      setLocal(`${tomorrow}T18:00`);
    }
  }, [load, schedule.id, tz]);
  useEffect(() => { refresh().catch((e) => toast.error(toUserMessage(e))); }, [refresh]);

  const hour = Number(local.slice(11, 13));
  const quiet = !!local && (hour >= 21 || hour < 8);
  const textsOn = channel !== "email";
  const quietBlocked = enabled && textsOn && quiet;

  const sample = people[0];
  const nextOcc = useMemo(() => {
    const at = local ? local : "";
    return occurrences.find((o: any) => wallIn(new Date(o.starts_at), tz) >= at) ?? occurrences[0];
  }, [occurrences, local, tz]);
  const values = {
    first_name: firstName(sample?.contact?.display_name),
    title: schedule.title,
    when: nextOcc ? whenLabel(new Date(nextOcc.starts_at), tz) : "",
    join: schedule.join_url || schedule.dial_in || schedule.location || "",
    description: schedule.description || "",
    calendar: "https://thekenroecollective.com/api/public/schedule-calendar/...",
    host: "",
  };
  const hostLine = hostSmsLine(hostFromSchedule(schedule));
  const smsText = composeScheduleSms({ title: schedule.title, message: renderTemplate(body, values), hostLine, hostName: schedule.host_name || "[your name]", firstText: !!sample && !sample.first_sms_sent_at, leadLabel: null });
  const seg = smsSegments(smsText);

  if (!w) return <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8"><h2 className="font-serif text-xl">Welcome message</h2><p className="mt-2 text-sm text-muted-foreground">Loading...</p></section>;

  if (w.sentAt) {
    const skipped = w.results.filter((r: any) => !STATUS_LABEL[r.status]);
    return (
      <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8" aria-label="Welcome message">
        <h2 className="font-serif text-xl">Welcome message</h2>
        <p className="mt-2 text-sm">Sent {w.sentLabel} to {w.reached} {w.reached === 1 ? "person" : "people"}.{skipped.length ? ` ${skipped.length} skipped.` : ""}</p>
        <p className="mt-1 text-xs text-muted-foreground">A welcome goes out once. To send it again, use Send now.</p>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={late} onChange={async (e) => {
            setLate(e.target.checked);
            try { await save({ data: { id: schedule.id, enabled: true, local: null, channel, subject: null, body: null, lateJoiners: e.target.checked } }); toast.success("Saved"); }
            catch (err) { toast.error(toUserMessage(err)); }
          }} />
          Send the welcome to people I add later
        </label>
        <ul className="mt-4 divide-y divide-ink/5 text-sm">
          {w.results.map((r: any) => (
            <li key={r.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between">
              <span><span className="font-medium">{r.name}</span>, {r.channel === "sms" ? "text" : "email"}</span>
              <span className="text-muted-foreground">{STATUS_LABEL[r.status] ?? `Not sent: ${SKIP_LABEL[r.reason] ?? r.reason ?? r.status}`}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8" aria-label="Welcome message">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl">Welcome message</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" role="switch" aria-label="Welcome message on" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {enabled ? "On" : "Off"}
        </label>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">A kickoff message that starts the series. No automatic reminders go out before it.</p>

      {w.enabled && w.atLabel ? (
        <div className="mt-4 rounded-2xl bg-secondary p-4 text-sm">
          <p>Reminders start after your welcome message goes out on {w.atLabel}.</p>
          {w.before.length ? (
            <p className="mt-1 text-muted-foreground">
              {w.before.length} {w.before.length === 1 ? "reminder" : "reminders"} before then will be skipped: {w.before.map((b: any) => b.label).join("; ")}.
            </p>
          ) : null}
        </div>
      ) : null}

      {enabled ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Date and time ({zoneShort(tz, local ? eventInstant(local, tz) : new Date())}, {tz.replace(/_/g, " ")})
              <input type="datetime-local" className={field} value={local} onChange={(e) => setLocal(e.target.value)} aria-label="Welcome date and time" />
            </label>
            <label className={label}>
              Channel
              <select className={field} value={channel} onChange={(e) => setChannel(e.target.value as Channel)} aria-label="Welcome channel">
                <option value="both">Email and text</option><option value="email">Email</option><option value="sms">Text</option>
              </select>
            </label>
          </div>
          {quietBlocked ? (
            <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              Texts can't go out between 9 PM and 8 AM in the schedule's time zone, so people are not woken up. Pick a time from 8 AM to 9 PM, or send by email only.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">Each person still gets only the channels they are set to.</p>
          {channel !== "sms" ? (
            <label className={label}>Email subject<input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Welcome subject" /></label>
          ) : null}
          <label className={label}>
            Message
            <textarea className={field} rows={4} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Welcome message text" />
          </label>
          <p className="text-xs text-muted-foreground">Merge fields: {MERGE_FIELDS.map((f) => `{${f}}`).join(", ")}. {"{when}"} is the first date after the welcome.</p>
          {textsOn ? (
            <div className="rounded-2xl p-4 ring-1 ring-ink/10">
              <p className={label}>Text preview{sample ? ` for ${values.first_name}` : ""}</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">{smsText}</p>
              <p className="mt-2 text-xs text-muted-foreground">{seg.chars} characters, {seg.segments} {seg.segments === 1 ? "text segment" : "text segments"}{seg.unicode ? " (special characters use shorter segments)" : ""}. The first text includes The Kenroe Collective attribution, your name, and "Reply STOP to opt out."{seg.segments > 2 ? " This is a long text and may cost more to deliver." : ""}</p>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={late} onChange={(e) => setLate(e.target.checked)} />
            Send the welcome to people I add later
          </label>
        </div>
      ) : null}

      <div className="mt-5">
        <button type="button" className={btn} disabled={busy || quietBlocked} onClick={async () => {
          setBusy(true);
          try {
            await save({ data: { id: schedule.id, enabled, local: enabled ? local : null, channel, subject, body, lateJoiners: late } });
            toast.success(enabled ? "Welcome message scheduled" : "Welcome message turned off");
            await refresh();
            onChange();
          } catch (e) { toast.error(toUserMessage(e)); } finally { setBusy(false); }
        }}>Save welcome message</button>
      </div>
    </section>
  );
}
