import { useEffect, useState } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Plus,
  HelpCircle,
  MessageCircle,
  Undo2,
  ArrowLeft,
  ListChecks,
  Globe,
  Sparkles,
  X,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLatestUndo, popLatestUndo } from "@/lib/undo-stack";
import { useLanguage, LANGUAGES, type LangCode } from "@/lib/i18n";
import { meEntitlements } from "@/lib/pricing.functions";
import { useAuthReady } from "@/hooks/use-auth-ready";
import {
  usePreviewTier,
  setPreviewTier,
  type PreviewTier,
} from "@/lib/preview-tier";

/**
 * Consolidated mobile action dock (sm:hidden). Replaces the previous stack of
 * floating buttons (new-event FAB, help dock, chat widget launcher, owner
 * preview handle) with a single 56x56 button above the bottom tab bar.
 */

const HIDDEN_PREFIXES = [
  "/auth",
  "/signup",
  "/reset-password",
  "/wall/",
  "/checkin/",
  "/e/",
  "/p/",
  "/d/",
  "/invite/",
  "/gift/",
  "/claim/",
  "/rfq-bid/",
  "/checkout",
];

const CHECKLIST_KEY = "kc_onboarding_v1";

const TIERS: { id: Exclude<PreviewTier, null>; label: string }[] = [
  { id: "postcard", label: "Postcard" },
  { id: "whisper", label: "Whisper" },
  { id: "host", label: "Host" },
  { id: "atelier", label: "Atelier" },
];

type Panel = null | "root" | "language" | "owner";

export function MobileActionDock() {
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const latest = useLatestUndo();
  const { lang, setLang } = useLanguage();
  const { ready: authReady, user } = useAuthReady();
  const preview = usePreviewTier();
  const [signedIn, setSignedIn] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setSignedIn(!!data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSignedIn(!!s?.user);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !user) {
      setIsOwner(false);
      return;
    }
    let alive = true;
    meEntitlements()
      .then((r) => {
        if (alive) setIsOwner(r.isOwner === true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [authReady, user?.id]);

  useEffect(() => {
    setPanel(null);
  }, [path]);

  if (HIDDEN_PREFIXES.some((p) => path === p || path.startsWith(p))) return null;

  const close = () => setPanel(null);

  const onEventPage = path.startsWith("/events/") && path !== "/events" && path !== "/events/new";
  const currentEventId = onEventPage ? path.split("/")[2] : null;
  const newLabel = onEventPage ? "Add a guest" : "New event";
  const newHint = onEventPage ? "Jump to this event's guest list" : "Start planning a gathering";

  const doUndo = async () => {
    close();
    const entry = popLatestUndo();
    if (!entry) {
      toast("Nothing to undo yet");
      return;
    }
    try {
      await entry.undo();
      toast.success("Undone");
    } catch {
      toast.error("Couldn't undo");
    }
  };

  const goBack = () => {
    close();
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      void router.navigate({ to: "/gatherings" });
    }
  };

  const openSupport = () => {
    close();
    try {
      window.dispatchEvent(new CustomEvent("kc:open-concierge"));
    } catch {
      /* ignore */
    }
  };

  const showChecklist = () => {
    close();
    try {
      localStorage.removeItem(CHECKLIST_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: CHECKLIST_KEY }));
    } catch {
      /* ignore */
    }
    toast("Setup steps are back — look bottom-left");
  };

  const pickTier = (t: PreviewTier) => {
    setPreviewTier(t);
    close();
  };

  const currentLang =
    LANGUAGES.find((l) => l.code === lang)?.native ?? "English";

  return (
    <>
      {/* Trigger — mobile only, sits above the bottom tab bar (~88px). */}
      <button
        type="button"
        data-mobile-fab
        onClick={() => setPanel("root")}
        aria-label="Actions and help"
        aria-expanded={panel !== null}
        className="fixed right-4 z-[46] grid h-14 w-14 place-items-center rounded-full bg-velvet text-paper shadow-2xl ring-4 ring-paper/40 transition hover:bg-velvet/90 sm:hidden print:hidden"
        style={{
          bottom:
            "calc(env(safe-area-inset-bottom) + 76px + var(--kc-cookie-h, 0px))",
        }}
      >
        <Plus className={`h-6 w-6 transition-transform ${panel ? "rotate-45" : ""}`} />
        <span className="sr-only">Open actions</span>
      </button>

      {panel !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Actions"
          className="fixed inset-0 z-[90] flex items-end bg-ink/60 backdrop-blur-sm sm:hidden print:hidden"
          onClick={close}
        >
          <div
            className="max-h-[85vh] w-full overflow-auto rounded-t-3xl bg-paper p-4 shadow-2xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ink/15"
              aria-hidden
            />
            <div className="mb-2 flex items-center justify-between px-2">
              <h2 className="text-lg font-semibold text-ink">
                {panel === "language"
                  ? "Choose language"
                  : panel === "owner"
                  ? "Preview as tier"
                  : "Actions & help"}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="grid h-11 w-11 place-items-center rounded-full text-ink/60 hover:bg-ink/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {panel === "root" ? (
              <ul className="divide-y divide-ink/5">
                {signedIn ? (
                  currentEventId ? (
                    <DockLink
                      icon={Plus}
                      label={newLabel}
                      hint={newHint}
                      to="/events/$eventId"
                      params={{ eventId: currentEventId }}
                      search={{ step: "guests" }}
                      onNavigate={close}
                      accent
                    />
                  ) : (
                    <DockLink
                      icon={Plus}
                      label={newLabel}
                      hint={newHint}
                      to="/events/new"
                      onNavigate={close}
                      accent
                    />
                  )
                ) : null}
                <DockButton
                  icon={MessageCircle}
                  label="Chat with support"
                  hint="Ask the concierge anything"
                  onClick={openSupport}
                />
                <DockButton
                  icon={Undo2}
                  label="Undo last action"
                  hint={latest ? latest.label : "Nothing to undo yet"}
                  onClick={doUndo}
                  disabled={!latest}
                />
                <DockButton
                  icon={ArrowLeft}
                  label="Go back"
                  hint="Return to the previous page"
                  onClick={goBack}
                />
                <DockButton
                  icon={ListChecks}
                  label="Setup checklist"
                  hint="Show the get-started steps"
                  onClick={showChecklist}
                />
                <DockButton
                  icon={Globe}
                  label={`Language — ${currentLang}`}
                  hint="Change the site language"
                  onClick={() => setPanel("language")}
                  trailing={<ChevronRight className="h-4 w-4 text-ink/40" />}
                />
                <DockLink
                  icon={HelpCircle}
                  label="Help & FAQ"
                  hint="Guides and common questions"
                  to="/faq"
                  onNavigate={close}
                />
                {isOwner ? (
                  <DockButton
                    icon={Sparkles}
                    label={
                      preview
                        ? `Previewing: ${preview
                            .charAt(0)
                            .toUpperCase()}${preview.slice(1)}`
                        : "Preview as tier"
                    }
                    hint="Owner-only tier preview switcher"
                    onClick={() => setPanel("owner")}
                    trailing={<ChevronRight className="h-4 w-4 text-ink/40" />}
                  />
                ) : null}
              </ul>
            ) : null}

            {panel === "language" ? (
              <ul>
                {LANGUAGES.map((l) => (
                  <li key={l.code}>
                    <button
                      type="button"
                      onClick={() => {
                        void setLang(l.code as LangCode);
                        close();
                      }}
                      className={`flex min-h-14 w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-base hover:bg-ink/5 ${
                        l.code === lang
                          ? "bg-velvet/10 font-semibold text-velvet"
                          : "text-ink"
                      }`}
                    >
                      <span>{l.native}</span>
                      <span className="text-sm text-muted-foreground">
                        {l.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {panel === "owner" ? (
              <ul className="space-y-1">
                <li>
                  <button
                    type="button"
                    onClick={() => pickTier(null)}
                    className={`flex min-h-14 w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-base ${
                      preview === null
                        ? "bg-velvet/10 font-semibold text-velvet"
                        : "text-ink hover:bg-ink/5"
                    }`}
                  >
                    Owner (full access)
                  </button>
                </li>
                {TIERS.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => pickTier(t.id)}
                      className={`flex min-h-14 w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-base ${
                        preview === t.id
                          ? "bg-velvet/10 font-semibold text-velvet"
                          : "text-ink hover:bg-ink/5"
                      }`}
                    >
                      {t.label}
                    </button>
                  </li>
                ))}
                <li className="px-4 pt-2 text-xs text-muted-foreground">
                  UI-only preview. Your account permissions are unchanged.
                </li>
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function DockButton({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled,
  accent,
  trailing,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex min-h-14 w-full items-center gap-4 px-3 py-3 text-left transition hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
            accent
              ? "bg-velvet text-paper"
              : "bg-velvet/10 text-velvet"
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium text-ink">{label}</span>
          {hint ? (
            <span className="block text-sm text-muted-foreground">{hint}</span>
          ) : null}
        </span>
        {trailing}
      </button>
    </li>
  );
}

function DockLink({
  icon: Icon,
  label,
  hint,
  to,
  params,
  search,
  onNavigate,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  to: "/events/new" | "/events" | "/faq" | "/events/$eventId";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  search?: any;
  onNavigate: () => void;
  accent?: boolean;
}) {
  return (
    <li>
      <Link
        to={to}
        params={params}
        search={search}
        onClick={onNavigate}
        className="flex min-h-14 w-full items-center gap-4 px-3 py-3 text-left transition hover:bg-ink/5"
      >
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
            accent ? "bg-velvet text-paper" : "bg-velvet/10 text-velvet"
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium text-ink">{label}</span>
          {hint ? (
            <span className="block text-sm text-muted-foreground">{hint}</span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
