import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X } from "lucide-react";
import { previewSendNow, sendNow } from "@/lib/schedules.functions";
import { smsSegments, composeScheduleSms, renderTemplate } from "@/lib/schedule-messages";
import { toUserMessage } from "@/lib/user-error";

type Channel = "email" | "sms" | "both";
type Step = "compose" | "confirm" | "results";

const field = "mt-1 w-full rounded-xl border border-ink/10 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-velvet/30";
const label = "block text-xs font-medium text-muted-foreground";
const btn = "rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50";
const btn2 = "rounded-full bg-secondary px-4 py-2 text-sm disabled:opacity-50";

export const SKIP_LABEL: Record<string, string> = {
  opted_out: "opted out of texts",
  no_text_consent: "no text consent recorded",
  no_phone: "has no phone",
  no_email: "has no email",
  email_opt_out: "unsubscribed from email",
  person_paused: "paused on this schedule",
  plan_downgraded: "your plan no longer includes Schedules",
  daily_text_limit: "held by the 200 texts a day limit",
  prefers_email: "gets email only",
  prefers_text: "gets texts only",
  already_sent: "already sent",
  quiet_hours: "texts wait until 8:00 AM",
  demo: "demo, nothing really sent",
  scheduled_8am: "test run, would go at 8:00 AM",
  cannot_attend: "said they cannot attend",
};

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
}

export function SendNowButton({ scheduleId, people, onDone }: { scheduleId: string; people: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={btn} onClick={() => setOpen(true)} disabled={!people.length} title={people.length ? undefined : "Add people first"}>
        Send now
      </button>
      {open ? <SendNowPanel scheduleId={scheduleId} people={people} onClose={() => { setOpen(false); onDone(); }} /> : null}
    </>
  );
}

function SendNowPanel({ scheduleId, people, onClose }: { scheduleId: string; people: any[]; onClose: () => void }) {
  const preview = useServerFn(previewSendNow);
  const send = useServerFn(sendNow);
  const [step, setStep] = useState<Step>("compose");
  const [occurrenceId, setOccurrenceId] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>("both");
  const [everyone, setEveryone] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [plan, setPlan] = useState<any | null>(null);
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [atMorning, setAtMorning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [includeDeclined, setIncludeDeclined] = useState(false);
  const requestId = useRef<string>(newId());
  const filledFor = useRef<string | null>(null);

  const personIds = everyone ? null : picked;

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      preview({ data: { scheduleId, occurrenceId, channel, personIds, includeDeclined } })
        .then((p) => {
          if (!live) return;
          setPlan(p);
          if (!occurrenceId && p.occurrenceId) setOccurrenceId(p.occurrenceId);
          // Prefill once per date so edits are kept when only the audience changes.
          if (p.templates && filledFor.current !== p.occurrenceId) {
            filledFor.current = p.occurrenceId;
            setSubject(p.templates.subject);
            setEmailBody(p.templates.emailBody);
            setSmsBody(p.templates.smsBody);
          }
        })
        .catch((e) => live && setErr(toUserMessage(e)));
    }, 150);
    return () => { live = false; clearTimeout(t); };
  }, [preview, scheduleId, occurrenceId, channel, includeDeclined, JSON.stringify(personIds)]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const wantSms = channel !== "email";
  const wantEmail = channel !== "sms";

  const sample = plan?.samplePerson;
  const smsPreview = useMemo(() => {
    const b = renderTemplate(smsBody, {
      first_name: sample?.firstName || "there",
      title: sample?.title || "Schedule reminder",
      calendar: sample?.calendar || "",
      rsvp: sample?.rsvp || "",
      join: sample?.join || "",
      meeting_id: sample?.meetingId || "",
      passcode: sample?.passcode || "",
      description: sample?.description || "",
      host: sample?.host || "",
    });
    return composeScheduleSms({ title: sample?.title || "Schedule reminder", message: b, protectedLines: sample?.protectedLines || [], hostLine: plan?.hostLine, hostName: sample?.host, firstText: !!sample?.needsIntro });
  }, [smsBody, sample, plan?.hostLine]);
  const hostSeg = smsSegments(plan?.hostLine || "");
  const seg = smsSegments(smsPreview);

  const summary = useMemo(() => {
    const rows: any[] = plan?.rows ?? [];
    const quietTexts = !!plan?.quiet;
    let texts = 0, emails = 0;
    const skipped: Record<string, number> = {};
    let skippedPeople = 0, reached = 0;
    for (const r of rows) {
      const e = r.email, s = r.sms;
      if (e?.go) emails++;
      if (s?.go && !(quietTexts && !atMorning)) texts++;
      const reasons = [e && !e.go ? e.reason : null, s && !s.go ? s.reason : null].filter(Boolean) as string[];
      const goes = (e?.go) || (s?.go && !(quietTexts && !atMorning));
      if (goes) reached++;
      else skippedPeople++;
      for (const x of new Set(reasons)) if (!["prefers_email", "prefers_text"].includes(x)) skipped[x] = (skipped[x] ?? 0) + 1;
    }
    return { total: rows.length, texts, emails, skipped, skippedPeople, reached };
  }, [plan, atMorning]);

  const alreadyRows = (plan?.rows ?? []).filter((r: any) => r.email?.reason === "already_sent" || r.sms?.reason === "already_sent");

  async function doSend() {
    if (!occurrenceId || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await send({ data: { scheduleId, occurrenceId, channel, personIds, requestId: requestId.current, subject, emailBody, smsBody, textsAtMorning: atMorning, includeDeclined } });
      setResults(r);
      setStep("results");
    } catch (e) {
      setErr(toUserMessage(e));
      toast.error(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="send-now-title">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-card shadow-xl sm:rounded-3xl">
        <header className="flex items-center justify-between border-b border-ink/5 px-5 py-4 sm:px-7">
          <h2 id="send-now-title" className="font-serif text-xl">
            {step === "compose" ? "Send a reminder now" : step === "confirm" ? "Ready to send?" : plan?.demo ? "Test run done" : "Sent"}
          </h2>
          <button type="button" className="rounded-full p-2 hover:bg-secondary" onClick={onClose} aria-label="Close" disabled={busy}><X className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {err ? <p className="mb-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{err}</p> : null}
          {plan?.demo ? <p className="mb-4 rounded-2xl bg-secondary p-3 text-sm">This is the demo, so this is a test run. Nothing is really sent.</p> : null}
          {plan && !plan.entitled && !plan.demo ? <p className="mb-4 rounded-2xl bg-amber-100 p-3 text-sm text-amber-900">Your plan no longer includes Schedules, so nothing will be sent.</p> : null}
          {!plan ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
          {plan && !plan.dates.length ? <p className="text-sm text-muted-foreground">There are no upcoming dates to send about.</p> : null}

          {plan && plan.dates.length && step === "compose" ? (
            <div className="space-y-5">
              <label className="block"><span className={label}>Which date is it about?</span>
                <select className={field} value={occurrenceId ?? ""} onChange={(e) => { setOccurrenceId(e.target.value); requestId.current = newId(); }}>
                  {plan.dates.map((d: any) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </label>

              <fieldset>
                <legend className={label}>Send by</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(["both", "email", "sms"] as Channel[]).map((c) => (
                    <button type="button" key={c} aria-pressed={channel === c} onClick={() => setChannel(c)} className={`rounded-full px-4 py-2 text-sm ${channel === c ? "bg-velvet text-primary-foreground" : "bg-secondary"}`}>
                      {c === "both" ? "Both" : c === "email" ? "Email" : "Text"}
                    </button>
                  ))}
                </div>
                {channel === "both" ? <p className="mt-1 text-xs text-muted-foreground">Each person still only gets the ways they signed up for.</p> : null}
              </fieldset>

              <fieldset>
                <legend className={label}>Who</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button type="button" aria-pressed={everyone} onClick={() => setEveryone(true)} className={`rounded-full px-4 py-2 text-sm ${everyone ? "bg-velvet text-primary-foreground" : "bg-secondary"}`}>Everyone ({people.length})</button>
                  <button type="button" aria-pressed={!everyone} onClick={() => setEveryone(false)} className={`rounded-full px-4 py-2 text-sm ${!everyone ? "bg-velvet text-primary-foreground" : "bg-secondary"}`}>Pick people</button>
                </div>
                {plan?.declinedCount ? (
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={includeDeclined} onChange={(e) => setIncludeDeclined(e.target.checked)} />
                    Also send to {plural(plan.declinedCount, "person", "people")} who said they cannot attend this date
                  </label>
                ) : null}
                {!everyone ? (
                  <ul className="mt-2 max-h-48 divide-y divide-ink/5 overflow-y-auto rounded-2xl ring-1 ring-ink/5">
                    {people.map((p) => (
                      <li key={p.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                          <input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked((x) => e.target.checked ? [...x, p.id] : x.filter((y) => y !== p.id))} />
                          <span className="truncate">{p.contact?.display_name || p.contact?.email || p.contact?.phone}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </fieldset>

              {wantEmail ? (
                <div className="rounded-2xl p-4 ring-1 ring-ink/10">
                  <p className="text-sm font-medium">Email</p>
                  <label className="block"><span className="sr-only">Subject</span>
                    <input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Email subject" maxLength={200} />
                  </label>
                  <textarea className={field} rows={5} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} aria-label="Email message" maxLength={4000} />
                </div>
              ) : null}

              {wantSms ? (
                <div className="rounded-2xl p-4 ring-1 ring-ink/10">
                  <p className="text-sm font-medium">Text</p>
                  <textarea className={field} rows={3} value={smsBody} onChange={(e) => setSmsBody(e.target.value)} aria-label="Text message" maxLength={480} />
                  <p className="mt-3 text-xs font-medium text-muted-foreground">Preview{sample ? ` for ${sample.firstName}` : ""}</p>
                  <p className="mt-1 whitespace-pre-wrap break-all rounded-2xl bg-secondary px-4 py-3 text-sm">{smsPreview}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {seg.chars} characters, {plural(seg.segments, "text segment")}{seg.unicode ? " (emoji or special characters use shorter segments)" : ""}.
                    {plan?.hostLine ? ` Includes your contact line (${hostSeg.chars} characters).` : ""}
                    {sample?.needsIntro ? " A first text also includes The Kenroe Collective attribution, your name, and how to reply STOP." : ""}
                    {seg.segments > 2 ? " This is a long text and may cost more to deliver." : ""}
                  </p>
                  {plan.quiet ? (
                    <div className="mt-3 rounded-2xl bg-amber-100 p-3 text-sm text-amber-900">
                      <p>It is quiet hours ({plan.timezone.replace(/_/g, " ")}), so texts are not sent between 9 PM and 8 AM. Emails still go now.</p>
                      {plan.morningOk ? (
                        <label className="mt-2 flex items-start gap-2">
                          <input type="checkbox" className="mt-1" checked={atMorning} onChange={(e) => setAtMorning(e.target.checked)} />
                          <span>Send texts at 8:00 AM instead ({plan.morningLabel})</span>
                        </label>
                      ) : <p className="mt-2">8:00 AM is after this date starts, so no texts can go for it.</p>}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {plan && step === "confirm" ? (
            <div className="space-y-4">
              <p className="text-lg">
                Send to {plural(summary.reached, "person", "people")} now: {plural(summary.texts, "text")}, {plural(summary.emails, "email")}.
              </p>
              {plan.quiet && wantSms && atMorning ? <p className="text-sm text-muted-foreground">Emails go now. Texts go at {plan.morningLabel}.</p> : null}
              {plan.quiet && wantSms && !atMorning ? <p className="text-sm text-muted-foreground">No texts now because of quiet hours. Emails go now.</p> : null}
              {summary.skippedPeople ? (
                <p className="text-sm">
                  {plural(summary.skippedPeople, "person", "people")} will be skipped
                  {Object.keys(summary.skipped).length ? ` (${Object.entries(summary.skipped).map(([k, n]) => `${n} ${SKIP_LABEL[k] ?? k}`).join(", ")})` : ""}.
                </p>
              ) : Object.keys(summary.skipped).length ? (
                <p className="text-sm text-muted-foreground">Some messages will not go: {Object.entries(summary.skipped).map(([k, n]) => `${n} ${SKIP_LABEL[k] ?? k}`).join(", ")}.</p>
              ) : null}
              {alreadyRows.length ? (
                <ul className="rounded-2xl bg-secondary p-3 text-sm">
                  {alreadyRows.map((r: any) => {
                    const m = r.email?.minutesAgo ?? r.sms?.minutesAgo ?? 0;
                    return <li key={r.personId}>{r.name}: Already sent {m === 0 ? "less than a minute" : plural(m, "minute")} ago</li>;
                  })}
                </ul>
              ) : null}
              {plan.demo ? <p className="text-sm text-muted-foreground">Demo: this is recorded as a test run only.</p> : null}
            </div>
          ) : null}

          {step === "results" && results ? <ResultsList results={results} /> : null}
        </div>

        <footer className="flex flex-wrap justify-end gap-3 border-t border-ink/5 px-5 py-4 sm:px-7">
          {step === "compose" ? (
            <>
              <button type="button" className={btn2} onClick={onClose}>Cancel</button>
              <button type="button" className={btn} disabled={!plan?.occurrenceId || (!everyone && !picked.length)} onClick={() => { requestId.current = newId(); setStep("confirm"); }}>Review</button>
            </>
          ) : step === "confirm" ? (
            <>
              <button type="button" className={btn2} disabled={busy} onClick={() => setStep("compose")}>Back</button>
              <button type="button" className={btn} disabled={busy || (summary.texts + summary.emails === 0)} onClick={() => void doSend()}>
                {busy ? "Sending..." : plan?.demo ? "Send test" : "Send"}
              </button>
            </>
          ) : (
            <button type="button" className={btn} onClick={onClose}>Done</button>
          )}
        </footer>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  queued: "Text sent",
  sent: "Email sent",
  scheduled: "Text goes at 8:00 AM",
  dry_run: "Test run, not sent",
};

function ResultsList({ results }: { results: { results: any[]; dateLabel: string } }) {
  const good = results.results.filter((r) => ["queued", "sent", "scheduled", "dry_run"].includes(r.status));
  const bad = results.results.filter((r) => !good.includes(r));
  const describe = (r: any) => {
    if (r.status === "queued" || r.status === "sent" || r.status === "scheduled") return STATUS_LABEL[r.status];
    if (r.status === "dry_run") return STATUS_LABEL.dry_run;
    if (r.reason === "already_sent") return `Already sent ${r.minutesAgo ? plural(r.minutesAgo, "minute") : "less than a minute"} ago`;
    return SKIP_LABEL[r.reason] ? `Skipped: ${SKIP_LABEL[r.reason]}` : `Not sent: ${r.reason ?? "unknown reason"}`;
  };
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">About {results.dateLabel}. This also shows in the schedule's history.</p>
      <section>
        <h3 className="text-sm font-semibold">Got it ({good.length})</h3>
        <ul className="mt-2 divide-y divide-ink/5 text-sm">
          {good.map((r, i) => <li key={i} className="flex justify-between gap-3 py-2"><span className="truncate">{r.name}, {r.channel === "sms" ? "text" : "email"}</span><span className="text-muted-foreground">{describe(r)}</span></li>)}
          {!good.length ? <li className="py-2 text-muted-foreground">Nobody.</li> : null}
        </ul>
      </section>
      {bad.length ? (
        <section>
          <h3 className="text-sm font-semibold">Skipped ({bad.length})</h3>
          <ul className="mt-2 divide-y divide-ink/5 text-sm">
            {bad.map((r, i) => <li key={i} className="flex justify-between gap-3 py-2"><span className="truncate">{r.name}, {r.channel === "sms" ? "text" : "email"}</span><span className="text-right text-muted-foreground">{describe(r)}</span></li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
