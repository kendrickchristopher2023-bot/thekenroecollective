import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseContactImport, confirmContactImport, discardContactImport } from "@/lib/schedules.functions";
import { toUserMessage } from "@/lib/user-error";

type Kind = "csv" | "xlsx" | "image" | "pdf" | "text";
type Channel = "email" | "sms" | "both";

interface Row {
  key: number;
  name: string;
  phone: string;
  email: string;
  confidence: { name: number; phone: number; email: number };
  duplicate: { id: string; name: string | null; email: string | null; phone: string | null } | null;
  action: "new" | "merge" | "skip";
}

const LOW = 0.7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function phoneOk(p: string) {
  const s = p.trim();
  if (!s) return true;
  const d = s.replace(/\D/g, "");
  if (s.startsWith("+")) return d.length >= 8 && d.length <= 15;
  return d.length === 10 || (d.length === 11 && d.startsWith("1"));
}
const emailOk = (e: string) => !e.trim() || EMAIL_RE.test(e.trim());

function kindOf(f: File): Kind | null {
  const n = f.name.toLowerCase();
  if (n.endsWith(".csv") || f.type === "text/csv") return "csv";
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) return "xlsx";
  if (n.endsWith(".pdf") || f.type === "application/pdf") return "pdf";
  if (f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/.test(n)) return "image";
  return null;
}

const cell = "w-full rounded-lg border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-velvet/30";

export function ScheduleImport({ scheduleId, isDemo, onDone }: { scheduleId: string; isDemo: boolean; onDone: () => void }) {
  const parse = useServerFn(parseContactImport);
  const confirm = useServerFn(confirmContactImport);
  const discard = useServerFn(discardContactImport);
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [text, setText] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [channel, setChannel] = useState<Channel>("both");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; refused: { name: string; reason: string }[]; cleared: { name: string; field: string }[]; problems: string[] } | null>(null);

  if (isDemo) {
    return (
      <div className="rounded-2xl bg-secondary/60 p-5 text-sm text-muted-foreground" data-testid="import-demo-note">
        Importing from a spreadsheet, photo or PDF is turned off in the demo. In your own account you can drop in a list and review every name before anything is saved.
      </div>
    );
  }

  function load(list: any[], id: string | null) {
    setImportId(id);
    setRows(list.map((r, i) => ({ key: i, name: r.name ?? "", phone: r.phone ?? "", email: r.email ?? "", confidence: r.confidence ?? { name: 1, phone: 1, email: 1 }, duplicate: r.duplicate, action: r.duplicate ? "merge" : "new" })));
    if (!list.length) toast.message("We didn't find any names, phone numbers or emails in that.");
  }

  async function onFile(f: File) {
    const kind = kindOf(f);
    if (!kind) return toast.error("Please choose a CSV, Excel, PDF or photo.");
    const max = kind === "csv" || kind === "xlsx" ? 5 : 10;
    if (f.size > max * 1024 * 1024) return toast.error(`That file is over ${max} MB.`);
    setBusy(true);
    try {
      setStage("Uploading your file");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Please sign in again.");
      const ext = f.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("contact-imports").upload(path, f, { contentType: f.type || undefined, upsert: false });
      if (error) throw new Error("The upload didn't go through. Please try again.");
      setStage(kind === "image" ? "Reading your photo. Handwriting can take up to a minute." : kind === "pdf" ? "Reading your PDF. This can take up to a minute." : "Reading your spreadsheet");
      const r = await parse({ data: { kind, storagePath: path, mime: f.type || null } });
      load(r.rows, r.importId);
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  async function onText() {
    if (!text.trim()) return;
    setBusy(true);
    setStage("Reading your list");
    try {
      const r = await parse({ data: { kind: "text", text } });
      load(r.rows, null);
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  async function onDiscard() {
    if (importId) await discard({ data: { importId } }).catch(() => undefined);
    setRows(null); setImportId(null); setText(""); setConsent(false);
    toast.message("Import discarded. Your file was deleted.");
  }

  const up = (k: number, patch: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const active = (rows ?? []).filter((r) => r.action !== "skip");
  const blocked = active.filter((r) => !emailOk(r.email) || !phoneOk(r.phone) || (!r.email.trim() && !r.phone.trim()));
  const needsConsent = channel !== "email";

  async function onConfirm() {
    if (blocked.length) return toast.error("Fix or skip the rows marked in red first.");
    if (needsConsent && !consent) return toast.error("Please confirm these people agreed to get text reminders from you.");
    setBusy(true);
    try {
      const r = await confirm({ data: { importId, scheduleId, channel, smsConsent: consent, rows: rows!.map((x) => ({ name: x.name, phone: x.phone, email: x.email, action: x.action, existingId: x.action === "merge" ? x.duplicate?.id ?? null : null })) } });
      setResult(r as any);
      setRows(null); setImportId(null); setText("");
      toast.success(`Added ${r.added} ${r.added === 1 ? "person" : "people"}`);
      onDone();
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (result && !rows) {
    return (
      <div className="space-y-3 rounded-2xl bg-secondary/60 p-5 text-sm">
        <p className="font-medium">Added {result.added} {result.added === 1 ? "person" : "people"}.</p>
        {result.refused.length ? (
          <div><p className="text-destructive">Not saved:</p><ul className="ml-5 list-disc">{result.refused.map((r, i) => <li key={i}>{r.name}: {r.reason}</li>)}</ul></div>
        ) : null}
        {result.cleared.length ? (
          <div><p>Saved without an invalid value:</p><ul className="ml-5 list-disc">{result.cleared.map((r, i) => <li key={i}>{r.name}: the {r.field} was left empty</li>)}</ul></div>
        ) : null}
        {result.problems.map((p, i) => <p key={i} className="text-destructive">{p}</p>)}
        <button type="button" className="rounded-full bg-card px-4 py-2 text-sm ring-1 ring-ink/10" onClick={() => setResult(null)}>Import another list</button>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload a contact list"
          onClick={() => !busy && input.current?.click()}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) input.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) void onFile(f); }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition ${drag ? "border-velvet bg-velvet/5" : "border-ink/15 bg-background hover:border-velvet/50"}`}
        >
          {busy ? <Loader2 className="h-7 w-7 animate-spin text-velvet" /> : <FileUp className="h-7 w-7 text-velvet" />}
          <p className="text-sm font-medium">{busy ? stage : "Drop a file here, or tap to choose one"}</p>
          <p className="text-xs text-muted-foreground">CSV or Excel up to 5 MB. Photo or PDF up to 10 MB and 10 pages. Handwritten lists are fine.</p>
          <input ref={input} type="file" className="hidden" accept=".csv,.xlsx,.xls,.pdf,image/*,text/csv,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="import-paste">Or paste a list</label>
          <textarea id="import-paste" className="mt-1 w-full rounded-xl border border-ink/10 bg-background px-3 py-2 text-sm" rows={4} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Jane Doe, (555) 555-0101, jane@example.com\nJohn Doe 555-555-0102"} />
          <button type="button" className="mt-2 rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={busy || !text.trim()} onClick={() => void onText()}>
            {stage === "Reading your list" ? "Reading..." : "Read this list"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">You will review every row before anything is saved. Uploaded files are private to you and deleted once you finish.</p>
      </div>
    );
  }

  const low = (n: number) => n < LOW;
  return (
    <div className="space-y-4" data-testid="import-review">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg">Review {rows.length} {rows.length === 1 ? "person" : "people"}</h3>
        <p className="text-xs text-muted-foreground">
          <span className="mr-3 inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-200" /> Please double check</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-destructive/25" /> Not valid</span>
        </p>
      </div>

      <div className="rounded-2xl ring-1 ring-ink/10">
        <div className="hidden grid-cols-[1fr_1fr_1.2fr_13rem] gap-3 rounded-t-2xl bg-secondary/60 px-3 py-2 text-xs font-medium text-muted-foreground md:grid">
          <span>Name</span><span>Phone</span><span>Email</span><span>What to do</span>
        </div>
        <ul className="divide-y divide-ink/5">
          {rows.map((r) => {
            const pBad = !phoneOk(r.phone);
            const eBad = !emailOk(r.email);
            const none = !r.phone.trim() && !r.email.trim();
            const tone = (bad: boolean, lo: boolean) => (bad ? "border-destructive bg-destructive/10" : lo ? "border-amber-400 bg-amber-50" : "border-ink/10");
            const sub = "mb-1 block text-xs text-muted-foreground md:hidden";
            return (
              <li key={r.key} className={`grid gap-3 px-3 py-3 sm:grid-cols-2 md:grid-cols-[1fr_1fr_1.2fr_13rem] ${r.action === "skip" ? "opacity-50" : ""}`}>
                <label className="block sm:col-span-2 md:col-span-1"><span className={sub}>Name</span>
                  <input aria-label="Name" className={`${cell} ${tone(false, low(r.confidence.name))}`} value={r.name} onChange={(e) => up(r.key, { name: e.target.value, confidence: { ...r.confidence, name: 1 } })} />
                </label>
                <label className="block"><span className={sub}>Phone</span>
                  <input aria-label="Phone" inputMode="tel" className={`${cell} ${tone(pBad, low(r.confidence.phone))}`} value={r.phone} onChange={(e) => up(r.key, { phone: e.target.value, confidence: { ...r.confidence, phone: 1 } })} />
                  {pBad ? <span className="mt-1 block text-xs text-destructive">Not a valid phone number</span> : null}
                </label>
                <label className="block"><span className={sub}>Email</span>
                  <input aria-label="Email" inputMode="email" className={`${cell} ${tone(eBad, low(r.confidence.email))}`} value={r.email} onChange={(e) => up(r.key, { email: e.target.value, confidence: { ...r.confidence, email: 1 } })} />
                  {eBad ? <span className="mt-1 block text-xs text-destructive">Not a valid email</span> : null}
                  {none && r.action !== "skip" ? <span className="mt-1 block text-xs text-destructive">Needs a phone or an email</span> : null}
                </label>
                <label className="block sm:col-span-2 md:col-span-1"><span className={sub}>What to do</span>
                  <select aria-label="What to do" className={`${cell} border-ink/10`} value={r.action} onChange={(e) => up(r.key, { action: e.target.value as Row["action"] })}>
                    {r.duplicate ? <option value="merge">Same person as a contact</option> : null}
                    <option value="new">{r.duplicate ? "Add as a new contact" : "Add"}</option>
                    <option value="skip">Skip</option>
                  </select>
                  {r.duplicate ? <span className="mt-1 block text-xs text-muted-foreground">Already in contacts: {r.duplicate.name || r.duplicate.email || r.duplicate.phone}</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="block text-xs font-medium text-muted-foreground">How should they be reminded?</span>
          <select className="mt-1 w-full rounded-xl border border-ink/10 bg-background px-3 py-2 text-sm" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            <option value="both">Email and text</option><option value="email">Email only</option><option value="sms">Text only</option>
          </select>
        </label>
        {needsConsent ? (
          <label className="flex items-start gap-3 rounded-2xl bg-secondary/60 p-3 text-sm sm:mt-5">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} required aria-label="These people agreed to get text reminders from me" />
            <span>These people agreed to get text reminders from me. <span className="text-muted-foreground">Their first text says it is from you and how to reply STOP.</span></span>
          </label>
        ) : null}
      </div>

      {blocked.length ? <p className="text-sm text-destructive">{blocked.length} {blocked.length === 1 ? "row needs" : "rows need"} fixing or skipping before you can save.</p> : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={busy || !active.length || blocked.length > 0 || (needsConsent && !consent)} onClick={() => void onConfirm()}>
          {busy ? "Saving..." : `Confirm and add ${active.length}`}
        </button>
        <button type="button" className="rounded-full bg-secondary px-4 py-2 text-sm" disabled={busy} onClick={() => void onDiscard()}>Discard</button>
      </div>
    </div>
  );
}
