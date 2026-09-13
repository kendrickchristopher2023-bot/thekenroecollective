import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { CalendarPlus, Users, Send, Sparkles, ArrowRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const STORE_KEY = "kc_first_run_v1";
const HIDDEN_PREFIXES = [
  "/auth",
  "/wall",
  "/checkin",
  "/e/",
  "/p/",
  "/d/",
  "/invite",
  "/gift",
  "/rfq-bid",
  "/claim",
  "/checkout",
  "/reset-password",
  "/signup",
  "/onboarding",
  "/ecards",
  "/c/",
  "/r/",
  "/ec/",
  "/workroom",
  "/projects",
];


type Step = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: CalendarPlus,
    title: "Create an event",
    body: "A quick, guided form gets your gathering set up in about a minute. You can change anything later, nothing is final.",
  },
  {
    icon: Users,
    title: "Add your guests",
    body: "Type names in, paste a list, or upload a spreadsheet. We'll keep track of who's coming and who hasn't replied yet.",
  },
  {
    icon: Send,
    title: "Send it out",
    body: "Share by email, text, or a simple link. Guests reply in one tap, with no accounts and no downloads.",
  },
];

function hasSeen(userId?: string | null): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (localStorage.getItem(STORE_KEY) === "1") return true;
    if (userId && localStorage.getItem(`${STORE_KEY}:${userId}`) === "1") return true;
    return false;
  } catch {
    return true;
  }
}
function markSeen(userId?: string | null) {
  try {
    localStorage.setItem(STORE_KEY, "1");
    if (userId) localStorage.setItem(`${STORE_KEY}:${userId}`, "1");
  } catch { /* ignore */ }
}

export function FirstRunWelcome() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (HIDDEN_PREFIXES.some((p) => path.startsWith(p))) return;
    let mounted = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!mounted) return;
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!data.user || hasSeen(uid)) return;
      // Suppress for returning hosts who already have at least one event.
      try {
        const { count } = await supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .is("archived_at", null)
          .eq("user_id", uid!);
        if (!mounted) return;
        if ((count ?? 0) > 0) { markSeen(uid); return; }
      } catch { /* ignore — show the welcome */ }
      setOpen(true);
    });
    return () => { mounted = false; };
  }, [path]);

  if (!open) return null;

  const isLast = step === STEPS.length - 1;
  const close = () => { markSeen(userId); setOpen(false); };
  const skip = () => close();

  const start = () => {
    close();
    void navigate({ to: "/events/new" });
  };

  const S = STEPS[step];
  const Icon = S.icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-run-title"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-t-3xl bg-paper shadow-2xl ring-1 ring-ink/10 sm:rounded-3xl">
        <button
          type="button"
          onClick={skip}
          aria-label="Close welcome"
          className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full text-ink/60 hover:bg-ink/5"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="bg-velvet/5 px-6 pb-4 pt-8 text-center sm:px-10 sm:pt-10">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-velvet text-paper">
            <Sparkles className="h-7 w-7" />
          </div>
          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-velvet/80">Welcome</p>
          <h2 id="first-run-title" className="mt-1 font-serif text-2xl text-ink sm:text-3xl">
            Three steps to your first gathering
          </h2>
        </div>

        <div className="px-6 py-6 sm:px-10 sm:py-8">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gold/20 text-velvet">
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Step {step + 1} of {STEPS.length}
              </div>
              <h3 className="mt-1 text-xl font-semibold text-ink">{S.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-ink/75">{S.body}</p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all ${
                  i === step ? "w-8 bg-velvet" : "w-2 bg-velvet/25"
                }`}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={skip}
              className="min-h-11 rounded-full px-5 py-3 text-base text-ink/70 hover:text-ink"
            >
              Skip for now
            </button>
            {isLast ? (
              <button
                type="button"
                onClick={start}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-velvet px-6 py-3 text-base font-medium text-paper hover:bg-velvet/90"
              >
                Create my first event
                <ArrowRight className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-velvet px-6 py-3 text-base font-medium text-paper hover:bg-velvet/90"
              >
                Next
                <ArrowRight className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        <div
          className="h-[env(safe-area-inset-bottom)] bg-paper sm:h-0"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
