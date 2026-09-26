import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { SkeletonPanel } from "@/components/skeletons";
import { SchedulePeopleList } from "@/components/schedule-people-list";
import { ScheduleImport } from "@/components/schedule-import";
import { SendNowButton, SKIP_LABEL } from "@/components/schedule-send-now";
import { WelcomeSection } from "@/components/schedule-welcome";
import {
  getSchedule,
  getScheduleAccess,
  saveSchedule,
  splitSchedule,
  setException,
  saveSteps,
  addPeople,
  updatePerson,
  listMyContacts,
  setScheduleStatus,
  deleteSchedule,
  runScheduleEngine,
} from "@/lib/schedules.functions";
import { buildRrule, describeRule, monthDayWarning, parseRepeat, WEEKDAYS, ordinal, type RepeatInput, type Weekday } from "@/lib/schedule-rrule";
import { whenLabel, offsetLabel, DEFAULT_STEPS, MERGE_FIELDS, type StepDraft } from "@/lib/schedule-messages";
import { toUserMessage } from "@/lib/user-error";
import { confirmDialog } from "@/lib/confirm-dialog";

export const Route = createFileRoute("/_authenticated/schedules/$id")({
  head: () => ({
    meta: [
      { title: "Schedule, The Kenroe Collective" },
      { name: "description", content: "Edit a repeating call, the people on it, and their reminders." },
      { property: "og:title", content: "Schedule, The Kenroe Collective" },
      { property: "og:description", content: "Edit a repeating call, the people on it, and their reminders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ScheduleEditor,
});

type Tab = "details" | "people" | "reminders" | "upcoming";

const US_ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];
const DAY_LABEL: Record<Weekday, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };

const field = "mt-1 w-full rounded-xl border border-ink/10 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-velvet/30";
const label = "block text-xs font-medium text-muted-foreground";
const btn = "rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50";
const btn2 = "rounded-full bg-secondary px-4 py-2 text-sm";

function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T19:00`;
}

function blank() {
  return {
    title: "",
    kind: "call" as const,
    description: "",
    join_url: "",
    dial_in: "",
    dial_pin: "",
    location: "",
    start_local: defaultStart(),
    timezone: "America/New_York",
    duration_minutes: 60,
    rrule: null as string | null,
    ends_kind: "never" as "never" | "on_date" | "count",
    until_local: "" as string | null,
    occurrence_count: 12 as number | null,
  };
}

function ScheduleEditor() {
  const { id } = Route.useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const load = useServerFn(getSchedule);
  const access = useServerFn(getScheduleAccess);
  const [data, setData] = useState<any | null>(null);
  const [canUse, setCanUse] = useState<boolean | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [tab, setTab] = useState<Tab>("details");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (isNew) return;
    try {
      setData(await load({ data: { id } }));
    } catch (e) {
      setError(toUserMessage(e));
    }
  }, [id, isNew, load]);

  useEffect(() => {
    void access().then((a) => { setCanUse(a.canUse); setIsOwner(a.isOwner); setIsDemo(!!a.isDemo); }).catch(() => setCanUse(false));
    void refresh();
  }, [access, refresh]);

  const title = isNew ? "New schedule" : data?.schedule?.title ?? "Schedule";

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:py-12 2xl:max-w-5xl">
        <Link to="/schedules" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All schedules
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl sm:text-4xl">{title}</h1>
            {data?.schedule ? <p className="mt-1 text-sm text-muted-foreground">{describeRule(data.schedule.rrule)} · {data.schedule.timezone.replace(/_/g, " ")}</p> : null}
          </div>
          {data ? <SendNowButton scheduleId={id} people={data.people} onDone={refresh} /> : null}
        </div>

        {canUse === false ? (
          <p className="mt-5 rounded-2xl bg-amber-100 p-4 text-sm text-amber-900">
            Reminders are paused because your plan no longer includes Schedules. Everything is kept and you can still edit it. <Link to="/pricing" className="underline">See plans</Link>
          </p>
        ) : null}
        {error ? <p className="mt-5 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p> : null}

        {!isNew ? (
          <nav className="mt-6 flex gap-1 overflow-x-auto rounded-full bg-card p-1 ring-1 ring-ink/5" aria-label="Schedule sections">
            {(["details", "people", "reminders", "upcoming"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${tab === t ? "bg-velvet text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {t === "details" ? "Details" : t === "people" ? `People${data ? ` (${data.people.length})` : ""}` : t === "reminders" ? "Reminders" : "Upcoming"}
              </button>
            ))}
          </nav>
        ) : null}

        <div className="mt-6">
          {!isNew && !data && !error ? <SkeletonPanel /> : null}
          {(isNew || data) && tab === "details" ? (
            <DetailsForm
              initial={isNew ? null : data.schedule}
              disabled={canUse === false && isNew}
              onSaved={(newId) => {
                if (isNew || newId !== id) { navigate({ to: "/schedules/$id", params: { id: newId } }); if (!isNew) toast.message("You are now on the new part of the series."); }
                else void refresh();
              }}
            />
          ) : null}
          {data && tab === "people" ? <PeoplePanel scheduleId={id} people={data.people} removedPeople={(data as any).removedPeople ?? []} isDemo={isDemo} onChange={refresh} /> : null}
          {data && tab === "reminders" ? <RemindersPanel data={data} scheduleId={id} steps={data.steps} problems={data.problems} history={data.history ?? []} people={data.people} onChange={refresh} /> : null}
          {data && tab === "upcoming" ? <UpcomingPanel data={data} onChange={refresh} /> : null}
        </div>

        {data ? <DangerZone scheduleId={id} status={data.schedule.status} isOwner={isOwner} onChange={refresh} /> : null}
      </main>
      <SiteFooter />
    </div>
  );
}

// ---------------- Details ----------------

function DetailsForm({ initial, disabled, onSaved }: { initial: any | null; disabled: boolean; onSaved: (id: string) => void }) {
  const save = useServerFn(saveSchedule);
  const split = useServerFn(splitSchedule);
  const [v, setV] = useState(() => {
    if (!initial) return blank();
    return {
      ...blank(),
      ...initial,
      start_local: String(initial.start_local).slice(0, 16),
      until_local: initial.until_local ? String(initial.until_local).slice(0, 16) : "",
    };
  });
  const [rep, setRep] = useState<RepeatInput>(() => parseRepeat(initial?.rrule ?? "FREQ=MONTHLY;BYDAY=1SU", v.start_local));
  const [busy, setBusy] = useState(false);
  const zones = useMemo(() => {
    let all: string[] = [];
    try { all = (Intl as any).supportedValuesOf("timeZone"); } catch { all = []; }
    return [...US_ZONES, ...all.filter((z) => !US_ZONES.includes(z))];
  }, []);
  const set = (k: string, val: unknown) => setV((p: any) => ({ ...p, [k]: val }));
  const rule = buildRrule(rep);

  async function submit(mode: "all" | "future") {
    if (!v.title.trim()) return toast.error("Give the schedule a name.");
    setBusy(true);
    try {
      const values = {
        title: v.title,
        kind: v.kind,
        description: v.description || null,
        join_url: v.join_url || null,
        dial_in: v.dial_in || null,
        dial_pin: v.dial_pin || null,
        location: v.location || null,
        start_local: v.start_local,
        timezone: v.timezone,
        duration_minutes: Number(v.duration_minutes) || 60,
        rrule: rule,
        ends_kind: v.ends_kind,
        until_local: v.ends_kind === "on_date" && v.until_local ? `${String(v.until_local).slice(0, 10)}T23:59` : null,
        occurrence_count: v.ends_kind === "count" ? Number(v.occurrence_count) || 1 : null,
      };
      if (mode === "future" && initial) {
        const r = await split({ data: { id: initial.id, fromLocal: v.start_local, values } });
        toast.success("Saved. Dates from here on use the new details.");
        onSaved(r.id);
      } else {
        const r = await save({ data: { id: initial?.id ?? null, values } });
        toast.success(initial ? "Saved" : "Schedule created. Now add people.");
        onSaved(r.id);
      }
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  }


  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); void submit("all"); }}>
      <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8">
        <h2 className="font-serif text-xl">What it is</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="sm:col-span-2"><span className={label}>Name</span>
            <input className={field} value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Kendrick Family Reunion call" maxLength={200} />
          </label>
          <label><span className={label}>Type</span>
            <select className={field} value={v.kind} onChange={(e) => set("kind", e.target.value)}>
              <option value="call">Call</option><option value="meeting">Meeting</option><option value="event">Event</option>
            </select>
          </label>
          <label className="sm:col-span-3"><span className={label}>Description (optional)</span>
            <textarea className={field} rows={3} value={v.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          </label>
          <label className="sm:col-span-3"><span className={label}>Join link (optional)</span>
            <input className={field} value={v.join_url ?? ""} onChange={(e) => set("join_url", e.target.value)} placeholder="https://zoom.us/j/..." inputMode="url" />
          </label>
          <label><span className={label}>Dial-in number</span>
            <input className={field} value={v.dial_in ?? ""} onChange={(e) => set("dial_in", e.target.value)} inputMode="tel" />
          </label>
          <label><span className={label}>PIN</span>
            <input className={field} value={v.dial_pin ?? ""} onChange={(e) => set("dial_pin", e.target.value)} />
          </label>
          <label><span className={label}>Location (optional)</span>
            <input className={field} value={v.location ?? ""} onChange={(e) => set("location", e.target.value)} />
          </label>
        </div>
      </section>

      <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8">
        <h2 className="font-serif text-xl">When</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label><span className={label}>First date and time</span>
            <input type="datetime-local" className={field} value={v.start_local} onChange={(e) => { set("start_local", e.target.value); setRep((r) => ({ ...parseRepeat(buildRrule(r), e.target.value), kind: r.kind, interval: r.interval })); }} />
          </label>
          <label><span className={label}>Time zone</span>
            <select className={field} value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          <label><span className={label}>Length (minutes)</span>
            <input type="number" min={5} max={1440} className={field} value={v.duration_minutes} onChange={(e) => set("duration_minutes", e.target.value)} />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Times always show in this time zone for everyone, and stay put when the clocks change.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <label><span className={label}>Repeats</span>
            <select className={field} value={rep.kind} onChange={(e) => setRep((r) => ({ ...r, kind: e.target.value as RepeatInput["kind"] }))}>
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly_position">Monthly on a weekday</option>
              <option value="monthly_date">Monthly on a date</option>
              <option value="quarterly">Every 3 months</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          {rep.kind !== "none" ? (
            <label><span className={label}>Every</span>
              <div className="mt-1 flex items-center gap-2">
                <input type="number" min={1} max={52} className={field.replace("mt-1 ", "")} value={rep.interval} onChange={(e) => setRep((r) => ({ ...r, interval: Number(e.target.value) || 1 }))} />
                <span className="text-sm text-muted-foreground">{rep.kind === "daily" ? "days" : rep.kind === "weekly" ? "weeks" : rep.kind === "yearly" ? "years" : rep.kind === "quarterly" ? "quarters" : "months"}</span>
              </div>
            </label>
          ) : null}
          {rep.kind === "monthly_position" ? (
            <label><span className={label}>On the</span>
              <div className="mt-1 flex gap-2">
                <select className={field.replace("mt-1 ", "")} value={rep.position} onChange={(e) => setRep((r) => ({ ...r, position: Number(e.target.value) }))}>
                  {[1, 2, 3, 4, 5, -1].map((n) => <option key={n} value={n}>{n === -1 ? "Last" : ordinal(n)}</option>)}
                </select>
                <select className={field.replace("mt-1 ", "")} value={rep.positionDay} onChange={(e) => setRep((r) => ({ ...r, positionDay: e.target.value as Weekday }))}>
                  {WEEKDAYS.map((d) => <option key={d} value={d}>{DAY_LABEL[d]}</option>)}
                </select>
              </div>
            </label>
          ) : null}
          {rep.kind === "monthly_date" || rep.kind === "quarterly" ? (
            <label><span className={label}>On day</span>
              <select className={field} value={rep.monthDay} onChange={(e) => setRep((r) => ({ ...r, monthDay: Number(e.target.value) }))}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{ordinal(n)}</option>)}
                <option value={-1}>Last day of the month</option>
              </select>
            </label>
          ) : null}
        </div>
        {rep.kind === "weekly" ? (
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Days of the week">
            {WEEKDAYS.map((d) => {
              const on = rep.weekdays.includes(d);
              return (
                <button type="button" key={d} aria-pressed={on} onClick={() => setRep((r) => ({ ...r, weekdays: on ? r.weekdays.filter((x) => x !== d) : [...r.weekdays, d] }))}
                  className={`h-10 w-12 rounded-full text-sm ${on ? "bg-velvet text-primary-foreground" : "bg-secondary"}`}>{DAY_LABEL[d]}</button>
              );
            })}
          </div>
        ) : null}
        {rep.position === 5 && rep.kind === "monthly_position" ? <p className="mt-2 text-xs text-amber-800">Some months have no 5th {DAY_LABEL[rep.positionDay]}. Those months are skipped.</p> : null}
        {monthDayWarning(rep.monthDay) && (rep.kind === "monthly_date" || rep.kind === "quarterly") ? <p className="mt-2 text-xs text-amber-800">{monthDayWarning(rep.monthDay)}</p> : null}
        <p className="mt-3 text-sm font-medium">{describeRule(rule)}</p>

        {rep.kind !== "none" ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <label><span className={label}>Ends</span>
              <select className={field} value={v.ends_kind} onChange={(e) => set("ends_kind", e.target.value)}>
                <option value="never">Never (keeps reminding)</option>
                <option value="on_date">On a date</option>
                <option value="count">After a number of times</option>
              </select>
            </label>
            {v.ends_kind === "on_date" ? (
              <label><span className={label}>Last date</span>
                <input type="date" className={field} value={String(v.until_local ?? "").slice(0, 10)} onChange={(e) => set("until_local", e.target.value)} />
              </label>
            ) : null}
            {v.ends_kind === "count" ? (
              <label><span className={label}>Number of times</span>
                <input type="number" min={1} max={1000} className={field} value={v.occurrence_count ?? 1} onChange={(e) => set("occurrence_count", e.target.value)} />
              </label>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={btn} disabled={busy || disabled}>{initial ? "Save for all dates" : "Create schedule"}</button>
        {initial?.rrule ? (
          <button type="button" className={btn2} disabled={busy} onClick={() => void submit("future")} title="Keeps past dates as they were and starts the new details from the first date above">
            Save from this date on
          </button>
        ) : null}
      </div>
      {initial?.rrule ? <p className="text-xs text-muted-foreground">To change just one date, use the Upcoming tab.</p> : null}
    </form>
  );
}

// ---------------- People ----------------

function PeoplePanel({ scheduleId, people, removedPeople, isDemo, onChange }: { scheduleId: string; people: any[]; removedPeople: any[]; isDemo: boolean; onChange: () => void }) {
  const add = useServerFn(addPeople);
  const loadContacts = useServerFn(listMyContacts);
  const [book, setBook] = useState<{ contacts: any[]; groups: any[] } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<"email" | "sms" | "both">("both");
  const [consent, setConsent] = useState(false);
  const [pickContacts, setPickContacts] = useState<string[]>([]);
  const [pickGroups, setPickGroups] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => { void loadContacts().then(setBook).catch(() => setBook({ contacts: [], groups: [] })); }, [loadContacts]);
  const already = new Set(people.map((p) => p.contact_id));
  const needsConsent = channel !== "email";

  async function submit(list: any[], groupIds: string[] = []) {
    if (needsConsent && !consent) return toast.error("Please confirm these people agreed to get text reminders from you.");
    setBusy(true);
    try {
      const r = await add({ data: { scheduleId, people: list, groupIds, channel, smsConsent: consent } });
      toast.success(`Added ${r.added} ${r.added === 1 ? "person" : "people"}`);
      setName(""); setPhone(""); setEmail(""); setPickContacts([]); setPickGroups([]);
      onChange();
    } catch (e) {
      toast.error(toUserMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const shown = (book?.contacts ?? []).filter((c) => !already.has(c.id) && (`${c.display_name ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(filter.toLowerCase())));

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl">Add people</h2>
          <button type="button" className={btn2} onClick={() => setShowImport((s) => !s)}>{showImport ? "Close import" : "Import from a file or photo"}</button>
        </div>

        {showImport ? null : <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label><span className={label}>How should they be reminded?</span>
            <select className={field} value={channel} onChange={(e) => setChannel(e.target.value as any)}>
              <option value="both">Email and text</option><option value="email">Email only</option><option value="sms">Text only</option>
            </select>
          </label>
          {needsConsent ? (
            <label className="flex items-start gap-3 rounded-2xl bg-secondary/60 p-3 text-sm sm:mt-5">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span>These people agreed to get text reminders from me. <span className="text-muted-foreground">Their first text says it is from you and how to reply STOP.</span></span>
            </label>
          ) : null}
        </div>}

        {showImport ? (
          <div className="mt-6">
            <ScheduleImport scheduleId={scheduleId} isDemo={isDemo} onDone={onChange} />
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              <input className={field} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
              <input className={field} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" aria-label="Phone" />
              <input className={field} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" aria-label="Email" />
              <button type="button" className={`${btn} mt-1`} disabled={busy || (!phone && !email)} onClick={() => void submit([{ name, phone, email }])}>Add person</button>
            </div>

            {book && (book.contacts.length || book.groups.length) ? (
              <div className="mt-6 border-t border-ink/5 pt-6">
                <h3 className="text-sm font-medium">From your contacts</h3>
                {book.groups.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {book.groups.map((g) => {
                      const on = pickGroups.includes(g.id);
                      return <button type="button" key={g.id} aria-pressed={on} onClick={() => setPickGroups((p) => on ? p.filter((x) => x !== g.id) : [...p, g.id])} className={`rounded-full px-3 py-1.5 text-xs ${on ? "bg-velvet text-primary-foreground" : "bg-secondary"}`}>{g.name} ({g.count})</button>;
                    })}
                  </div>
                ) : null}
                <input className={`${field} mt-3`} placeholder="Search contacts" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search contacts" />
                <ul className="mt-2 max-h-64 divide-y divide-ink/5 overflow-y-auto rounded-2xl ring-1 ring-ink/5">
                  {shown.slice(0, 200).map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                        <input type="checkbox" checked={pickContacts.includes(c.id)} onChange={(e) => setPickContacts((p) => e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id))} />
                        <span className="min-w-0 flex-1 truncate">{c.display_name || c.email || c.phone}</span>
                        <span className="hidden truncate text-xs text-muted-foreground sm:inline">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
                      </label>
                    </li>
                  ))}
                  {!shown.length ? <li className="px-3 py-3 text-sm text-muted-foreground">No more contacts to add.</li> : null}
                </ul>
                <button type="button" className={`${btn} mt-3`} disabled={busy || (!pickContacts.length && !pickGroups.length)} onClick={() => void submit(pickContacts.map((contactId) => ({ contactId })), pickGroups)}>
                  Add selected
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <SchedulePeopleList scheduleId={scheduleId} people={people} removedPeople={removedPeople} onChange={onChange} />
    </div>
  );
}

// ---------------- Reminders ----------------

const OFFSETS = [
  { v: -14 * 1440, l: "2 weeks before" }, { v: -7 * 1440, l: "1 week before" }, { v: -3 * 1440, l: "3 days before" },
  { v: -2 * 1440, l: "2 days before" }, { v: -1440, l: "1 day before" }, { v: -180, l: "3 hours before" },
  { v: -120, l: "2 hours before" }, { v: -60, l: "1 hour before" }, { v: -30, l: "30 minutes before" },
  { v: -15, l: "15 minutes before" }, { v: 0, l: "Starting now" },
];

const PROBLEM_LABEL: Record<string, string> = {
  daily_text_limit: "Held: the 200 texts a day limit was reached",
  plan_downgraded: "Paused: your plan no longer includes Schedules",
  person_paused: "Paused for this person",
  opted_out: "Not sent: this number replied STOP",
  email_opt_out: "Not sent: unsubscribed from email",
  no_text_consent: "Not sent: no text consent recorded",
  no_phone: "Not sent: no phone number",
  no_email: "Not sent: no email address",
  demo: "Not sent: demo account",
  no_longer_scheduled: "Not sent: the date or person was removed",
  before_welcome: "Skipped: before your welcome message",
};

const HISTORY_STATUS: Record<string, string> = {
  queued: "Text sent",
  sent: "Email sent",
  delivered: "Delivered",
  scheduled: "Waiting for 8:00 AM",
  pending: "Sending",
  dry_run: "Test run, not sent",
};

function RemindersPanel({ data, scheduleId, steps, problems, history, people, onChange }: { data: any; scheduleId: string; steps: any[]; problems: any[]; history: any[]; people: any[]; onChange: () => void }) {
  const save = useServerFn(saveSteps);
  const [list, setList] = useState<StepDraft[]>(() => (steps.length ? steps : DEFAULT_STEPS).map((s: any, i: number) => ({ offset_minutes: s.offset_minutes, channel: s.channel, is_starting_now: s.is_starting_now, subject: s.subject, body: s.body, position: i })));
  const [busy, setBusy] = useState(false);
  const up = (i: number, patch: Partial<StepDraft>) => setList((l) => l.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const names = new Map(people.map((p) => [p.id, p.contact?.display_name || p.contact?.email || p.contact?.phone]));

  return (
    <div className="space-y-6">
      <WelcomeSection schedule={data.schedule} people={people} occurrences={data.occurrences} onChange={onChange} />
      <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8">
        <h2 className="font-serif text-xl">Reminder plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Merge fields: {MERGE_FIELDS.map((f) => `{${f}}`).join(", ")}. Texts are never sent between 9 PM and 8 AM (they move to the morning), except "Starting now".
        </p>
        <ol className="mt-5 space-y-4">
          {list.map((s, i) => (
            <li key={i} className="rounded-2xl p-4 ring-1 ring-ink/10">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <select className={field} value={s.offset_minutes} aria-label="When" onChange={(e) => up(i, { offset_minutes: Number(e.target.value), is_starting_now: Number(e.target.value) === 0 })}>
                  {OFFSETS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  {!OFFSETS.some((o) => o.v === s.offset_minutes) ? <option value={s.offset_minutes}>{offsetLabel(s.offset_minutes)}</option> : null}
                </select>
                <select className={field} value={s.channel} aria-label="Channel" onChange={(e) => up(i, { channel: e.target.value as any })}>
                  <option value="email">Email</option><option value="sms">Text</option>
                </select>
                <button type="button" className="mt-1 rounded-full px-3 py-2 text-xs text-destructive hover:bg-destructive/10" onClick={() => setList((l) => l.filter((_, j) => j !== i))}>Remove</button>
              </div>
              {s.channel === "email" ? <input className={field} value={s.subject ?? ""} placeholder="Subject" aria-label="Subject" onChange={(e) => up(i, { subject: e.target.value })} /> : null}
              <textarea className={field} rows={s.channel === "email" ? 5 : 2} value={s.body} aria-label="Message" onChange={(e) => up(i, { body: e.target.value })} />
              {s.channel === "sms" ? <p className="mt-1 text-xs text-muted-foreground">{s.body.length} characters. The first text to each person also says it is from you and "Reply STOP to opt out."</p> : null}
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className={btn2} disabled={list.length >= 10} onClick={() => setList((l) => [...l, { offset_minutes: -1440, channel: "sms", is_starting_now: false, subject: null, body: "Reminder: {title} is {when}. Join: {join}", position: l.length }])}>Add a reminder</button>
          <button type="button" className={btn} disabled={busy} onClick={async () => {
            setBusy(true);
            try { await save({ data: { id: scheduleId, steps: list.map(({ position: _p, ...s }) => ({ ...s, subject: s.channel === "email" ? s.subject || "Reminder: {title}" : null })) } }); toast.success("Reminder plan saved"); onChange(); }
            catch (e) { toast.error(toUserMessage(e)); } finally { setBusy(false); }
          }}>Save reminder plan</button>
        </div>
      </section>

      {problems.length ? (
        <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8">
          <h2 className="font-serif text-xl">Needs attention</h2>
          <ul className="mt-4 divide-y divide-ink/5 text-sm">
            {problems.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between">
                <span>{names.get(p.person_id) ?? "Someone"}, {p.channel === "sms" ? "text" : "email"}</span>
                <span className="text-muted-foreground">{PROBLEM_LABEL[p.error] ?? `Failed: ${p.error ?? "unknown reason"}`}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8">
        <h2 className="font-serif text-xl">History</h2>
        {!history.length ? <p className="mt-3 text-sm text-muted-foreground">Nothing sent yet.</p> : (
          <ul className="mt-4 divide-y divide-ink/5 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between sm:gap-4">
                <span className="min-w-0">
                  <span className="font-medium">{names.get(h.person_id) ?? "Someone"}</span>, {h.channel === "sms" ? "text" : "email"}
                  <span className="text-muted-foreground"> · {h.kind === "manual" ? "Sent now" : h.kind === "welcome" ? "Welcome" : "Automatic"} · {new Date(h.sent_at ?? h.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                </span>
                <span className="text-muted-foreground">{HISTORY_STATUS[h.status] ?? PROBLEM_LABEL[h.error] ?? (SKIP_LABEL[h.error] ? `Not sent: ${SKIP_LABEL[h.error]}` : `Not sent: ${h.error ?? h.status}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------- Upcoming ----------------

function UpcomingPanel({ data, onChange }: { data: any; onChange: () => void }) {
  const setEx = useServerFn(setException);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const tz = data.schedule.timezone;
  async function act(original: string, action: "skip" | "move" | "clear", newStart?: string) {
    try {
      await setEx({ data: { id: data.schedule.id, originalLocal: original.slice(0, 16), action, newStartLocal: newStart ?? null } });
      setMoving(null);
      onChange();
    } catch (e) { toast.error(toUserMessage(e)); }
  }
  return (
    <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8">
      <h2 className="font-serif text-xl">Upcoming dates</h2>
      <p className="mt-1 text-sm text-muted-foreground">Skip or move one date without changing the rest.</p>
      <ul className="mt-4 divide-y divide-ink/5">
        {data.occurrences.map((o: any) => {
          const original = String(o.occurrence_local).replace(" ", "T").slice(0, 16);
          return (
            <li key={o.id} className="py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className={`text-sm font-medium ${o.status === "skipped" || o.status === "cancelled" ? "text-muted-foreground line-through" : ""}`}>{whenLabel(new Date(o.starts_at), tz)}</p>
                  {o.status === "moved" ? <p className="text-xs text-muted-foreground">Moved from its usual date</p> : null}
                  {o.status === "skipped" ? <p className="text-xs text-muted-foreground">Skipped, no reminders</p> : null}
                </div>
                {o.status === "cancelled" ? null : (
                  <div className="flex gap-2">
                    {o.status === "scheduled" ? (
                      <>
                        <button type="button" className="rounded-full bg-secondary px-3 py-1.5 text-xs" onClick={() => { setMoving(o.id); setMoveTo(String(o.start_local).replace(" ", "T").slice(0, 16)); }}>Move</button>
                        <button type="button" className="rounded-full bg-secondary px-3 py-1.5 text-xs" onClick={() => void act(original, "skip")}>Skip</button>
                      </>
                    ) : (
                      <button type="button" className="rounded-full bg-secondary px-3 py-1.5 text-xs" onClick={() => void act(original, "clear")}>Undo</button>
                    )}
                  </div>
                )}
              </div>
              {moving === o.id ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="datetime-local" className="rounded-xl border border-ink/10 bg-background px-3 py-2 text-sm" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="New date and time" />
                  <button type="button" className={btn} onClick={() => void act(original, "move", moveTo)}>Move this date</button>
                  <button type="button" className={btn2} onClick={() => setMoving(null)}>Cancel</button>
                </div>
              ) : null}
            </li>
          );
        })}
        {!data.occurrences.length ? <li className="py-3 text-sm text-muted-foreground">No upcoming dates.</li> : null}
      </ul>
    </section>
  );
}

// ---------------- Danger zone ----------------

function DangerZone({ scheduleId, status, isOwner, onChange }: { scheduleId: string; status: string; isOwner: boolean; onChange: () => void }) {
  const setStatus = useServerFn(setScheduleStatus);
  const del = useServerFn(deleteSchedule);
  const run = useServerFn(runScheduleEngine);
  const navigate = useNavigate();
  return (
    <section className="mt-10 flex flex-wrap items-center gap-3 border-t border-ink/10 pt-6">
      <button type="button" className={btn2} onClick={async () => { try { await setStatus({ data: { id: scheduleId, status: status === "active" ? "paused" : "active" } }); onChange(); } catch (e) { toast.error(toUserMessage(e)); } }}>
        {status === "active" ? "Pause all reminders" : "Turn reminders back on"}
      </button>
      {isOwner ? (
        <button type="button" className={btn2} onClick={async () => {
          try { const r = await run({ data: { dryRun: true } }); toast.success(`Test run: ${r.claimed} reminders due, ${r.blocked} not sendable, ${r.held} held. Nothing was sent.`); onChange(); }
          catch (e) { toast.error(toUserMessage(e)); }
        }}>Test run (sends nothing)</button>
      ) : null}
      <button type="button" className="ml-auto rounded-full px-4 py-2 text-sm text-destructive hover:bg-destructive/10" onClick={async () => {
        const ok = await confirmDialog({ title: "Delete this schedule?", body: "Its people, reminders and history are removed. Your contacts are kept.", confirmLabel: "Delete", tone: "danger" });
        if (!ok) return;
        try { await del({ data: { id: scheduleId } }); navigate({ to: "/schedules" }); } catch (e) { toast.error(toUserMessage(e)); }
      }}>Delete schedule</button>
    </section>
  );
}
