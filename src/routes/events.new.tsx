import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { createEvent, useEvents } from "@/lib/events-store";
import { timeZoneOptions, viewerTimeZone } from "@/lib/event-time";
import { getEntitlements } from "@/lib/entitlements-client";
import { usePreviewTier } from "@/lib/preview-tier";
import { useAuthReady } from "@/hooks/use-auth-ready";
import { LanguagePicker } from "@/components/language-picker";
import { languageLabel, useLanguage, type LangCode } from "@/lib/i18n";
import { EVENT_TEMPLATES, type EventTemplate } from "@/lib/event-templates";
import { translateBatch } from "@/lib/translate.functions";
import { myRecentEventCreations } from "@/lib/events-sync.functions";
import {
  POSTCARD_ROLLING_CREATE_LIMIT,
  rollingCapMessage,
} from "@/lib/rolling-event-cap";



export const Route = createFileRoute("/events/new")({
  validateSearch: (s: Record<string, unknown>): { resumed?: string } => ({
    resumed: typeof s.resumed === "string" ? s.resumed : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Create Event — The Kenroe Collective" },
      { name: "description", content: "Start planning your next event by setting the date, venue, and a personal welcome message for your guests." },
      { property: "og:title", content: "Create Event — The Kenroe Collective" },
      { property: "og:description", content: "Compose a new gathering — date, venue, message, and invitations in one editorial flow." },
      { property: "og:url", content: "https://thekenroecollective.com/events/new" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/events/new" }],
  }),
  component: NewEvent,
});

const DRAFT_KEY = "kenroes:new-event-draft";
const DEFAULT_MESSAGE = "Join us for an evening crafted with care. We'd be honored by your presence.";

type Draft = {
  title: string;
  date: string;
  venue: string;
  address: string;
  description: string;
  message: string;
  language?: string;
};

function loadDraft(): Partial<Draft> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(DRAFT_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeDraft(draft: Draft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {}
}

function NewEvent() {
  const navigate = useNavigate();
  const { resumed } = Route.useSearch();
  const existingEvents = useEvents();
  const { ready: authReady, user } = useAuthReady();
  const [entitlements, setEntitlements] = useState<{ tier: string; isOwner: boolean; previewing?: boolean } | null>(null);
  const subLoading = !authReady || entitlements === null;
  // Owners (you + Adrian via user_roles) always have unlimited event creation,
  // even while previewing another tier — this is your software, you build freely.
  // Everyone else: Postcard / Whisper / Host / Atelier can publish.
  const isActive =
    !!entitlements &&
    (entitlements.isOwner ||
      ["postcard", "whisper", "host", "atelier"].includes(entitlements.tier));

  const previewTier = usePreviewTier();
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!authReady) return;
      if (!user) {
        if (alive) setEntitlements({ tier: "postcard", isOwner: false });
        return;
      }
      // Note: do NOT reset entitlements to null on refetch — it makes the
      // "Payment required" banner flash and the form jump while typing.
      try {
        const r = await getEntitlements();
        if (alive) setEntitlements({ tier: r.tier ?? "free", isOwner: r.isOwner, previewing: r.previewing });
      } catch {
        if (alive) setEntitlements((prev) => prev ?? { tier: "postcard", isOwner: false });
      }
    })();
    return () => { alive = false; };
  }, [authReady, user?.id, previewTier]);

  const [draftLoaded, setDraftLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  // Venue time zone. Defaults to the creator's browser zone, and the host can
  // change it here so guests always see the venue's clock time with a label.
  const [timezone, setTimezone] = useState<string>(() => viewerTimeZone());
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [language, setLanguage] = useState<LangCode>("en");
  const [checking, setChecking] = useState(false);
  const [autoResumed, setAutoResumed] = useState(false);
  const { lang: siteLang } = useLanguage();
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const draftRef = useRef<Draft>({ title: "", date: "", venue: "", address: "", description: "", message: DEFAULT_MESSAGE, language: "en" });

  useEffect(() => {
    const initial = loadDraft();
    const draft: Draft = {
      title: initial.title || "",
      date: initial.date || "",
      venue: initial.venue || "",
      address: initial.address || "",
      description: initial.description || "",
      message: initial.message || DEFAULT_MESSAGE,
      language: ((initial as any).language as LangCode) || "en",
    };
    draftRef.current = draft;
    setTitle(draft.title);
    setDate(draft.date);
    setVenue(draft.venue);
    setAddress(draft.address);
    setDescription(draft.description);
    setMessage(draft.message);
    setLanguage(draft.language as LangCode);
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = window.setTimeout(() => persistDraft(), 250);
    return () => window.clearTimeout(timer);
  }, [draftLoaded, title, date, venue, address, description, message, language]);

  // Auto-resume: if user returned from checkout (resumed=1), their plan is now
  // active, and the draft has the required fields, submit automatically so they
  // land on their event without an extra click.
  useEffect(() => {
    if (autoResumed) return;
    if (resumed !== "1") return;
    if (subLoading || !isActive) return;
    if (!title || !date || !venue) return;
    setAutoResumed(true);
    // Slight delay lets the success toast/confetti from the return page settle.
    const t = setTimeout(() => {
      const form = document.getElementById("new-event-form") as HTMLFormElement | null;
      form?.requestSubmit();
    }, 250);
    return () => clearTimeout(t);
  }, [resumed, subLoading, isActive, title, date, venue, autoResumed]);



  function persistDraft() {
    const draft: Draft = { title, date, venue, address, description, message, language };
    draftRef.current = draft;
    writeDraft(draft);
  }

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    draftRef.current = { ...draftRef.current, [key]: value };
    writeDraft(draftRef.current);
    if (key === "title") setTitle(value as string);
    if (key === "date") setDate(value as string);
    if (key === "venue") setVenue(value as string);
    if (key === "address") setAddress(value as string);
    if (key === "description") setDescription(value as string);
    if (key === "message") setMessage(value as string);
    if (key === "language") setLanguage(value as LangCode);
  }

  // Templates are authored once in English (event-templates.ts). Applying one
  // while the site is set to another language used to always insert English
  // copy and silently force the draft's language back to "en" — confusing
  // when the button itself (translated by AutoTranslate) reads in Spanish,
  // French, etc. Translate the draft copy into the current site language on
  // apply, and carry that language onto the draft instead of hardcoding "en".
  async function applyTemplate(tpl: EventTemplate) {
    setApplyingTemplateId(tpl.id);
    try {
      if (siteLang === "en") {
        updateDraft("title", tpl.draft.title);
        updateDraft("description", tpl.draft.description);
        updateDraft("message", tpl.draft.message);
        updateDraft("language", "en");
      } else {
        const { translations } = await translateBatch({
          data: { target: siteLang, strings: [tpl.draft.title, tpl.draft.description, tpl.draft.message] },
        });
        updateDraft("title", translations[0] ?? tpl.draft.title);
        updateDraft("description", translations[1] ?? tpl.draft.description);
        updateDraft("message", translations[2] ?? tpl.draft.message);
        updateDraft("language", siteLang);
      }
      toast.success(`${tpl.name} template applied — edit anything you like.`);
    } catch {
      toast.error("Could not apply that template. Try again.");
    } finally {
      setApplyingTemplateId(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !date || !venue) return;
    setChecking(true);
    try {
      // 1. Must be signed in.
      if (!authReady) {
        toast.info("Restoring your session…");
        return;
      }
      if (!user) {
        persistDraft();
        toast.info("Sign in and choose a plan to create your event.");
        navigate({ to: "/auth", search: { redirect: "/events/new" } });
        return;
      }
      // 2. Wait for subscription state to load — avoids a false "no plan" bounce
      //    right after returning from checkout.
      if (subLoading) {
        toast.info("Checking your plan…");
        return;
      }
      // 3. Must have an active paid plan. Carry the intent so they return here after paying.
      if (!isActive) {
        persistDraft();
        try {
          window.sessionStorage.setItem("kenroes:checkout-next", "/events/new");
        } catch {}
        toast.info("Choose a plan to publish your event — we'll bring you right back.");
        navigate({ to: "/pricing", search: { next: "/events/new" } as any });
        return;
      }
      // 4. Tier event cap: Whisper = 1 per calendar month; Postcard = 1 active total.
      //    Owners bypass all caps (always — even in preview-as-tier mode).
      const isOwnerAccess = entitlements!.isOwner;
      if (!isOwnerAccess && entitlements!.tier === "whisper") {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const thisMonth = existingEvents.filter((ev) => {
          const d = new Date(ev.createdAt);
          return d.getFullYear() === y && d.getMonth() === m;
        });
        if (thisMonth.length >= 1) {
          toast.error(
            "Whisper includes one event per month. Upgrade to Host or Atelier for unlimited events.",
          );
          navigate({ to: "/pricing", search: { next: "/events/new" } as any });
          return;
        }
      }
      if (!isOwnerAccess && entitlements!.tier === "postcard") {
        const active = existingEvents.filter((ev) => !(ev as any).archivedAt);
        if (active.length >= 1) {
          toast.error(
            "Postcard supports one active event. Archive it or upgrade to Whisper for more.",
          );
          navigate({ to: "/pricing", search: { next: "/events/new" } as any });
          return;
        }
        // Rolling creation cap: archived events still count here, so the free
        // tier can't be cycled forever by archive-and-recreate. The local
        // cache omits archived events, so ask the server for the real list.
        let createdInWindow: string[] = [];
        try {
          const res = await myRecentEventCreations();
          createdInWindow = res.createdAts ?? [];
        } catch {
          createdInWindow = [];
        }
        if (createdInWindow.length >= POSTCARD_ROLLING_CREATE_LIMIT) {
          toast.error("You've used all 3 free events for this 12-month window.", {
            description: rollingCapMessage(createdInWindow),
            duration: 12000,
          });
          navigate({ to: "/pricing", search: { next: "/events/new" } as any });
          return;
        }

      }

      // 5. Paid + signed in → create.
      // Preserve the host's wall-clock time. Storing toISOString() converts
      // to UTC, and rendering the ISO on the Worker (UTC) then prints the
      // wrong hour (6:30 PM local → 22:30 UTC → "10:30 PM" on server).
      const tz = timezone || viewerTimeZone();
      const event = createEvent({
        title,
        date: date, // "YYYY-MM-DDTHH:MM" (naive local)
        timezone: tz,
        venue,
        address,
        description,
        message,
        language,
      });
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {}
      navigate({ to: "/events/$eventId", params: { eventId: event.id } });
    } finally {
      setChecking(false);
    }
  }


  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">
            New Gathering
          </span>
          <h1 className="mt-2 font-serif text-4xl font-medium">Compose your event</h1>
          <p className="mt-3 max-w-prose text-muted-foreground">
            A few essentials to set the scene. A plan is required to publish — you can{" "}
            <Link to="/pricing" className="underline">pick one now</Link>, start a 60-day
            Atelier trial for up to 20 guests, or choose after filling out the form. Your draft is saved automatically.
          </p>

          {!subLoading && !user && (
            <div className="mt-6 rounded-2xl bg-velvet/5 px-5 py-4 text-sm ring-1 ring-velvet/20">
              <span className="font-medium">Sign in to publish your invite.</span>{" "}
              Postcard is free forever — 1 event, up to 75 guests. We'll bring you
              back to this draft once you sign in.
            </div>
          )}

          <div className="mt-8">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Start from a template — included on every plan
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EVENT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  disabled={applyingTemplateId !== null}
                  title={tpl.blurb}
                  className="rounded-full border border-ink/10 bg-card px-3 py-1.5 text-xs font-medium hover:border-velvet/40 hover:bg-velvet/5 disabled:opacity-50"
                >
                  <span className="mr-1.5">{tpl.emoji}</span>
                  {applyingTemplateId === tpl.id ? "Translating…" : tpl.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Tip: the AI Concierge (bottom-right) can also draft your event from a few details — voice input on paid plans.
            </p>
          </div>

          <form id="new-event-form" onSubmit={onSubmit} className="mt-10 flex flex-col gap-8">
            <Field label="Title" hint="What should we call this gathering?" valid={title.trim().length >= 2}>
              <input
                required
                value={title}
                onChange={(e) => updateDraft("title", e.target.value)}
                placeholder="A Midsummer Night"
                className="w-full border-b border-ink/15 bg-transparent py-3 font-serif text-2xl focus:border-velvet focus:outline-none"
              />
            </Field>

            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
              <Field label="Date & Time" valid={!!date}>
                <input
                  required
                  type="datetime-local"
                  value={date}
                  onChange={(e) => updateDraft("date", e.target.value)}
                  className="w-full border-b border-ink/15 bg-transparent py-3 text-base focus:border-velvet focus:outline-none"
                />
              </Field>
              <Field label="Venue time zone" valid={!!timezone}>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full border-b border-ink/15 bg-transparent py-3 text-base focus:border-velvet focus:outline-none"
                >
                  {timeZoneOptions(timezone).map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Guests see this clock time with its zone label, plus a small "your time" line if
                  they are travelling.
                </p>
              </Field>
              <Field label="Venue" valid={venue.trim().length >= 2}>
                <input
                  required
                  value={venue}
                  onChange={(e) => updateDraft("venue", e.target.value)}
                  placeholder="The Glass Conservatory"
                  className="w-full border-b border-ink/15 bg-transparent py-3 text-base focus:border-velvet focus:outline-none"
                />
              </Field>
            </div>

            <Field label="Address (for maps & directions)" hint="Optional — helps guests find you.">
              <input
                type="text"
                value={address}
                onChange={(e) => updateDraft("address", e.target.value)}
                placeholder="123 Main St, Los Angeles, CA"
                autoComplete="street-address"
                className="w-full border-b border-ink/15 bg-transparent py-3 text-base focus:border-velvet focus:outline-none"
              />
            </Field>

            <Field label="Short Description" hint="One line — appears on the invite card.">
              <input
                value={description}
                onChange={(e) => updateDraft("description", e.target.value)}
                placeholder="An evening of tonal attire under the midsummer moon."
                className="w-full border-b border-ink/15 bg-transparent py-3 text-base focus:border-velvet focus:outline-none"
              />
            </Field>

            <Field label="Invitation Message">
              <textarea
                rows={4}
                value={message}
                onChange={(e) => updateDraft("message", e.target.value)}
                className="w-full resize-none border border-ink/10 bg-card p-4 text-base focus:border-velvet focus:outline-none rounded-md"
              />
            </Field>

            <Field label="Event Language">
              <div className="flex items-center gap-3">
                <LanguagePicker value={language} onChange={(next) => updateDraft("language", next)} />
                <span className="text-xs text-muted-foreground">Currently: {languageLabel(language)}</span>
              </div>
            </Field>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-4">
              <Link
                to="/pricing"
                search={{ next: "/events/new" } as any}
                onClick={persistDraft}
                className="min-h-11 rounded-full px-5 py-3 text-sm font-medium ring-1 ring-ink/10 hover:bg-secondary"
              >
                View plans
              </Link>

              <button
                type="button"
                onClick={() => navigate({ to: "/events" })}
                className="min-h-11 rounded-full px-5 py-3 text-sm font-medium ring-1 ring-ink/10 hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={checking}
                className="min-h-11 rounded-full bg-velvet px-6 py-3 text-base font-medium text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                {checking ? "Checking plan…" : isActive ? "Create event" : "Continue to payment"}
              </button>
            </div>

          </form>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

function Field({
  label,
  hint,
  valid,
  children,
}: {
  label: string;
  hint?: string;
  valid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {label}
        {valid === true && (
          <span aria-label="Looks good" className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-800">
            ✓
          </span>
        )}
      </span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

