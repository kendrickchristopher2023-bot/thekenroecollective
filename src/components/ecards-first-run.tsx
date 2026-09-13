import { useEffect, useState } from "react";
import { Mail, Link2, Send, Sparkles, ArrowRight, X } from "lucide-react";

const STORE_KEY = "kc_ecards_first_run_v1";

type Step = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: Mail,
    title: "Create a card",
    body: "Pick an occasion and a theme. It takes about a minute, and you can change anything later.",
  },
  {
    icon: Link2,
    title: "Share one link",
    body: "Everyone adds their own message, GIF, photo, video or voice note. No sign-up needed for them, and messages stay hidden until the reveal date.",
  },
  {
    icon: Send,
    title: "Send it on the day",
    body: "Free to create and collect, pay only when you send. We email it to the recipient on the reveal date.",
  },
];

function hasSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(STORE_KEY) === "1";
  } catch {
    return true;
  }
}

export function EcardsFirstRun() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!hasSeen()) setOpen(true);
  }, []);

  if (!open) return null;

  const close = () => {
    try {
      localStorage.setItem(STORE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const isLast = step === STEPS.length - 1;
  const S = STEPS[step];
  const Icon = S.icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ecards-first-run-title"
      className="venture-ecards fixed inset-0 z-[100] flex items-end justify-center bg-walnut-deep/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-t-3xl bg-paper shadow-2xl ring-1 ring-walnut/20 sm:rounded-3xl">
        <button
          type="button"
          onClick={close}
          aria-label="Close welcome"
          className="absolute right-3 top-3 grid h-12 w-12 place-items-center rounded-full text-ink/60 hover:bg-walnut/10"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="bg-walnut/10 px-6 pb-4 pt-8 text-center sm:px-10 sm:pt-10">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-walnut text-paper">
            <Sparkles className="h-7 w-7" />
          </div>
          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-walnut">Group eCards</p>
          <h2
            id="ecards-first-run-title"
            className="mt-1 font-serif text-2xl text-ink sm:text-3xl"
          >
            Three steps to your first card
          </h2>
        </div>

        <div className="px-6 py-6 sm:px-10 sm:py-8">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-walnut/15 text-walnut-deep">
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium uppercase tracking-widest text-ink/60">
                Step {step + 1} of {STEPS.length}
              </div>
              <h3 className="mt-1 text-xl font-semibold text-ink sm:text-2xl">{S.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-ink/75 sm:text-lg">{S.body}</p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all ${
                  i === step ? "w-8 bg-walnut" : "w-2 bg-walnut/30"
                }`}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={close}
              className="min-h-12 rounded-full px-5 py-3 text-base text-ink/70 hover:text-ink"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => (isLast ? close() : setStep((s) => s + 1))}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-walnut px-6 py-3 text-base font-medium text-paper hover:bg-walnut-deep"
            >
              {isLast ? "Get started" : "Next"}
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="h-[env(safe-area-inset-bottom)] bg-paper sm:h-0" aria-hidden="true" />
      </div>
    </div>
  );
}
