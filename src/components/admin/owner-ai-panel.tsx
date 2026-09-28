// Owner Command Center, Phase 2: AI overview and ask-a-question, on demand only.
// The AI never runs on page load and never changes data. Overviews are cached
// per selected period so re-opening one does not spend tokens again.
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { generateOwnerOverview, askOwnerQuestion } from "@/lib/owner-ai.functions";

export type AiSnapshot = {
  since: string;
  until: string;
  rangeLabel: string;
  comparisonLabel: string;
  periodLabel: string;
  environment: "live" | "sandbox";
  venture: "all" | "events" | "ecards" | "projects" | "resume";
  ventureLabel: string;
  scopeNotes: string[];
  metrics: Array<{ label: string; current: string; previous: string; change: string }>;
  byVenture: Array<{ venture: string; gross: string; orders: number }>;
  note?: string | null;
};


const SUGGESTIONS = [
  "How did revenue do this period and which venture led it?",
  "Are there any reliability problems I should know about?",
  "How many eCards were sent versus created?",
  "What happened with emails and texts this period?",
];

function Prose({ text }: { text: string }) {
  return (
    <div className="prose prose-base max-w-none text-ink prose-headings:font-serif prose-headings:text-ink prose-strong:text-ink">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}

export function OwnerAiPanel({ snapshot }: { snapshot: AiSnapshot | null }) {
  const runOverview = useServerFn(generateOwnerOverview);
  const runAsk = useServerFn(askOwnerQuestion);

  const cache = useRef(new Map<string, string>());
  const [, forceRender] = useState(0);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ q: string; a: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cacheKey = useMemo(
    () =>
      snapshot
        ? `${snapshot.environment}|${snapshot.since}|${snapshot.until}|${snapshot.metrics.length}`
        : "",
    [snapshot],
  );

  // Cached per period, so switching back to a period does not spend tokens again.
  const shown = cache.current.get(cacheKey) ?? null;

  const onGenerate = async () => {
    if (!snapshot) return;
    setErr(null);
    setOverviewLoading(true);
    try {
      const res = await runOverview({ data: snapshot });
      cache.current.set(cacheKey, res.text);
      forceRender((n) => n + 1);
    } catch (e: any) {
      setErr(e?.message ?? "The overview could not be generated.");
    } finally {
      setOverviewLoading(false);
    }
  };

  const onAsk = async (q: string) => {
    if (!snapshot || q.trim().length < 3) return;
    setErr(null);
    setAsking(true);
    try {
      const res = await runAsk({ data: { snapshot, question: q.trim() } });
      setAnswer({ q: q.trim(), a: res.text });
    } catch (e: any) {
      setErr(e?.message ?? "The question could not be answered.");
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="font-serif text-2xl">AI overview and questions</h3>
          <p className="mt-1 text-base text-muted-foreground">
            Reads only the numbers already shown above, plus a short list of recent issues. It runs
            only when you ask, it cannot change anything, and it does not give tax, financial or
            legal advice.
          </p>
        </div>
        <button
          onClick={() => void onGenerate()}
          disabled={!snapshot || overviewLoading}
          className="rounded-full bg-velvet px-5 py-2.5 text-base font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {overviewLoading ? "Writing the overview..." : shown ? "Regenerate overview" : "Generate overview"}
        </button>
      </div>

      {err && (
        <p className="mt-4 rounded-xl bg-rose-50 p-4 text-base text-rose-900 ring-1 ring-rose-600/20">
          {err}
        </p>
      )}

      {shown ? (
        <div className="mt-5 rounded-xl bg-secondary/50 p-5 ring-1 ring-ink/5">
          <Prose text={shown} />
          <p className="mt-4 text-sm text-muted-foreground">
            Based on {snapshot?.rangeLabel}, compared with {snapshot?.comparisonLabel}.
          </p>
        </div>
      ) : (
        !overviewLoading && (
          <p className="mt-5 text-base text-muted-foreground">
            No overview yet for this period. Select a period above, then choose Generate overview.
          </p>
        )
      )}

      <div className="mt-6 border-t border-ink/10 pt-5">
        <label htmlFor="owner-ai-question" className="block font-serif text-xl">
          Ask a question about this period
        </label>
        <div className="mt-3 flex flex-wrap gap-3">
          <input
            id="owner-ai-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onAsk(question);
            }}
            placeholder="For example, which venture made the most money this period?"
            className="min-w-[16rem] flex-1 rounded-xl border border-ink/15 bg-paper px-4 py-3 text-base"
          />
          <button
            onClick={() => void onAsk(question)}
            disabled={!snapshot || asking || question.trim().length < 3}
            className="rounded-full bg-secondary px-5 py-3 text-base font-medium text-ink ring-1 ring-ink/10 hover:bg-secondary/70 disabled:opacity-50"
          >
            {asking ? "Checking the numbers..." : "Ask"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQuestion(s);
                void onAsk(s);
              }}
              disabled={asking || !snapshot}
              className="rounded-full bg-secondary/60 px-3 py-1.5 text-sm text-ink ring-1 ring-ink/10 hover:bg-secondary disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        {answer && (
          <div className="mt-5 rounded-xl bg-secondary/50 p-5 ring-1 ring-ink/5">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              You asked
            </p>
            <p className="mt-1 text-base text-ink">{answer.q}</p>
            <div className="mt-4">
              <Prose text={answer.a} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
