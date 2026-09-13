// Owner AI analyst, Tier 1: the panel.
//
// Read only. Conversations persist, every answer shows the reports and tables
// it read, and the daily allowance plus month-to-date cost are always visible.
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import {
  askAssistant,
  deleteAssistantThread,
  getAssistantThread,
  listAssistantThreads,
  type AssistantMessage,
  type AssistantThread,
} from "@/lib/owner-assistant.functions";
import { OwnerActionDrafts } from "@/components/admin/owner-action-drafts";

const QUICK_PROMPTS = [
  "This week's revenue",
  "Accounts at risk of churn",
  "Pending support tickets",
  "Reliability problems in the last 7 days",
  "eCards sent versus created this month",
  "Refunds issued this month",
];

type Usage = { questionsToday: number; remainingToday: number; monthCost: string };

function Prose({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none text-ink prose-headings:font-serif prose-headings:text-ink prose-strong:text-ink">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}

export function OwnerAssistantPanel() {
  const loadThreads = useServerFn(listAssistantThreads);
  const loadThread = useServerFn(getAssistantThread);
  const ask = useServerFn(askAssistant);
  const removeThread = useServerFn(deleteAssistantThread);

  const [threads, setThreads] = useState<AssistantThread[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [draftsKey, setDraftsKey] = useState(0);
  const bottom = useRef<HTMLDivElement | null>(null);

  const refreshThreads = useCallback(() => {
    loadThreads()
      .then((r) => {
        setThreads(r.threads);
        setUsage(r.usage);
      })
      .catch((e: any) => {
        if (String(e?.message ?? "").includes("OWNER_REPORT_FORBIDDEN")) setDenied(true);
        setThreads([]);
      });
  }, [loadThreads]);

  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  const openThread = async (id: string) => {
    setThreadId(id);
    setMessages([]);
    setError(null);
    try {
      const r = await loadThread({ data: { threadId: id } });
      setMessages(r.messages);
      setDraftsKey((n) => n + 1);
    } catch {
      setError("That conversation could not be opened.");
    }
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (q.length < 3 || busy) return;
    setError(null);
    setQuestion("");
    setBusy(true);
    const optimistic: AssistantMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: q,
      sources: [],
      toolsUsed: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    try {
      const r = await ask({ data: { threadId, question: q } });
      setThreadId(r.threadId);
      setMessages((m) => [...m, r.answer]);
      setUsage(r.usage);
      setDraftsKey((n) => n + 1);
      refreshThreads();
    } catch (e: any) {
      setError(e?.message ?? "The assistant could not answer that.");
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setQuestion(q);
    } finally {
      setBusy(false);
    }
  };

  if (denied) {
    return (
      <div className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">
        <h2 className="font-serif text-2xl">Owner assistant</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This assistant is limited to specific owner accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl">Owner assistant</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Ask anything about the platform's real data. Every answer is built from live reports and
              tables, and each one lists what it read so you can open that report and check the number
              yourself. It can also draft a refund, a plan change, or a message to a customer, but it
              never carries anything out: you approve each draft yourself, and drafts expire after 24
              hours.
            </p>
          </div>
          {usage && (
            <div className="rounded-xl bg-secondary/60 px-4 py-3 text-right text-xs text-muted-foreground ring-1 ring-ink/5">
              <div>
                <span className="font-medium text-ink">{usage.remainingToday}</span> questions left today
              </div>
              <div className="mt-1">
                Month to date: <span className="font-medium text-ink">{usage.monthCost}</span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => void send(p)}
              disabled={busy}
              className="rounded-full bg-secondary/60 px-3 py-1.5 text-xs text-ink ring-1 ring-ink/10 hover:bg-secondary disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
        <aside className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Conversations
            </h3>
            <button
              onClick={() => {
                setThreadId(null);
                setMessages([]);
                setError(null);
              }}
              className="rounded-full bg-ink px-3 py-1 text-[11px] font-medium text-paper hover:bg-velvet"
            >
              New
            </button>
          </div>
          <div className="mt-3 space-y-1">
            {threads === null ? (
              <p className="text-xs text-muted-foreground">Loading...</p>
            ) : threads.length === 0 ? (
              <p className="text-xs text-muted-foreground">No conversations yet.</p>
            ) : (
              threads.map((t) => (
                <div key={t.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => void openThread(t.id)}
                    className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-xs transition ${
                      t.id === threadId ? "bg-ink text-paper" : "hover:bg-secondary"
                    }`}
                  >
                    <span className="block truncate">{t.title}</span>
                  </button>
                  <button
                    aria-label="Delete conversation"
                    onClick={async () => {
                      await removeThread({ data: { threadId: t.id } });
                      if (t.id === threadId) {
                        setThreadId(null);
                        setMessages([]);
                      }
                      refreshThreads();
                    }}
                    className="rounded-md px-2 py-1 text-[11px] text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-ink"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
          {messages.length === 0 && !busy && (
            <p className="text-sm text-muted-foreground">
              Start with a quick prompt above, or ask your own question. For example, "how much did
              eCards make last month compared with the month before?"
            </p>
          )}

          <div className="space-y-4">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl bg-ink px-4 py-2 text-sm text-paper">
                    {m.content}
                  </p>
                </div>
              ) : (
                <div key={m.id} className="rounded-2xl bg-secondary/40 p-4 ring-1 ring-ink/5">
                  <Prose text={m.content} />
                  {m.sources.length > 0 && (
                    <div className="mt-3 border-t border-ink/10 pt-3">
                      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Read from
                      </p>
                      <ul className="mt-1 space-y-1">
                        {m.sources.map((s, i) => (
                          <li key={`${m.id}-${i}`} className="text-xs text-muted-foreground">
                            <span className="font-medium text-ink">{s.label}</span>: {s.where}
                            {s.window ? ` (${s.window})` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ),
            )}
            {busy && (
              <p className="text-sm text-muted-foreground">Reading the reports...</p>
            )}
            <div ref={bottom} />
          </div>

          <div className="mt-4">
            <OwnerActionDrafts threadId={threadId} refreshKey={draftsKey} />
          </div>

          {error && (
            <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-600/20">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <label htmlFor="owner-assistant-input" className="sr-only">
              Ask the owner assistant
            </label>
            <input
              id="owner-assistant-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send(question);
              }}
              placeholder="Ask about revenue, accounts, tickets, delivery, anything queryable"
              className="min-h-11 min-w-[14rem] flex-1 rounded-full bg-secondary px-4 text-sm focus:outline-none focus:ring-2 focus:ring-velvet/40"
            />
            <button
              onClick={() => void send(question)}
              disabled={busy || question.trim().length < 3}
              className="min-h-11 rounded-full bg-velvet px-5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Working..." : "Ask"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
