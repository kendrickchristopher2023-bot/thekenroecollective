import { useEffect, useState } from "react";
import { KanbanSquare, ListChecks, Users, Sparkles, ArrowRight, X } from "lucide-react";

const STORE_KEY = "kc_projects_first_run_v1";

type Step = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: KanbanSquare,
    title: "Create a board",
    body: "Organize the work into columns like To do, Doing, and Done. Drag a card across as it moves along.",
  },
  {
    icon: ListChecks,
    title: "Add tasks",
    body: "Break the work into cards, assign owners, set due dates, and add comments and files where they belong.",
  },
  {
    icon: Users,
    title: "Invite your team",
    body: "Share the board so collaborators can work alongside you, as admin, editor, or viewer.",
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

/**
 * First-run intro for the Projects venture. Rendered inline (never as an
 * overlay) so it can never cover the add-on upgrade or purchase CTAs on the
 * page. Its own localStorage key, separate from the events and eCards intros.
 */
export function ProjectsFirstRun() {
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
    <section
      aria-labelledby="projects-first-run-title"
      className="mx-auto mt-6 w-full max-w-5xl px-6"
    >
      <div className="relative overflow-hidden rounded-3xl bg-cyprus/10 p-5 ring-1 ring-cyprus/25 sm:p-7">
        <button
          type="button"
          onClick={close}
          aria-label="Close welcome"
          className="absolute right-3 top-3 grid h-12 w-12 place-items-center rounded-full text-ink/60 hover:bg-cyprus/10"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 pr-12">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-cyprus text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <p className="text-xs uppercase tracking-[0.2em] text-cyprus-deep">The Workroom</p>
        </div>
        <h2
          id="projects-first-run-title"
          className="mt-3 font-serif text-2xl text-ink sm:text-3xl"
        >
          Three steps to your first board
        </h2>

        <div className="mt-5 flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyprus/15 text-cyprus-deep">
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium uppercase tracking-widest text-ink/60">
              Step {step + 1} of {STEPS.length}
            </div>
            <h3 className="mt-1 text-xl font-semibold text-ink sm:text-2xl">{S.title}</h3>
            <p className="mt-2 max-w-[60ch] text-base leading-relaxed text-ink/75 sm:text-lg">
              {S.body}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === step ? "w-8 bg-cyprus" : "w-2 bg-cyprus/30"
              }`}
            />
          ))}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:gap-4">
          <button
            type="button"
            onClick={() => (isLast ? close() : setStep((s) => s + 1))}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-cyprus px-6 py-3 text-base font-medium text-white hover:bg-cyprus-deep"
          >
            {isLast ? "Get started" : "Next"}
            <ArrowRight className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={close}
            className="min-h-12 rounded-full px-5 py-3 text-base text-ink/70 hover:text-ink"
          >
            Skip
          </button>
        </div>
      </div>
    </section>
  );
}
