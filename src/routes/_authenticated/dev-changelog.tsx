import { toUserMessage } from "@/lib/user-error";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { SkeletonBlock } from "@/components/skeletons";
import {
  addDevChangelogEntry,
  deleteDevChangelogEntry,
  listDevChangelog,
  type DevChangelogEntry,
} from "@/lib/dev-changelog.functions";
import { formatStampLongDate, formatStampTime } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/dev-changelog")({
  head: () => ({
    meta: [
      { title: "Release log (internal), The Kenroe Collective" },
      {
        name: "description",
        content: "Internal technical release log of everything shipped, for staff accounts only.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DevChangelogPage,
});

const CATEGORIES = ["fix", "feature", "security", "infra", "data", "content"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_STYLE: Record<string, string> = {
  fix: "bg-amber-100 text-amber-900",
  feature: "bg-emerald-100 text-emerald-900",
  security: "bg-rose-100 text-rose-900",
  infra: "bg-sky-100 text-sky-900",
  data: "bg-violet-100 text-violet-900",
  content: "bg-slate-100 text-slate-800",
};

function dayKey(iso: string) {
  return formatStampLongDate((iso));
}

function DevChangelogPage() {
  const fetchEntries = useServerFn(listDevChangelog);
  const addEntry = useServerFn(addDevChangelogEntry);
  const removeEntry = useServerFn(deleteDevChangelogEntry);

  const [entries, setEntries] = useState<DevChangelogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | "">("");
  const [search, setSearch] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    bodyMd: "",
    category: "fix" as Category,
    commitSha: "",
  });

  const load = useCallback(async () => {
    try {
      setError(null);
      const rows = await fetchEntries({
        data: {
          ...(category ? { category } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      });
      setEntries(rows);
    } catch (e) {
      setEntries([]);
      const msg = toUserMessage(e, "Could not load the release log.");
      setError(
        msg.includes("MFA_CHALLENGE_REQUIRED")
          ? "Verify your authenticator code in the owner console to view the release log."
          : msg.includes("MFA_ENROLL_REQUIRED")
            ? "Owner accounts need two-factor authentication enrolled to view the release log."
            : msg,
      );
    }
  }, [fetchEntries, category, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const out = new Map<string, DevChangelogEntry[]>();
    for (const e of entries ?? []) {
      const key = dayKey(e.published_at);
      const list = out.get(key) ?? [];
      list.push(e);
      out.set(key, list);
    }
    return [...out.entries()];
  }, [entries]);

  async function submit() {
    if (form.title.trim().length < 3) return;
    setSaving(true);
    try {
      await addEntry({
        data: {
          title: form.title.trim(),
          bodyMd: form.bodyMd.trim(),
          category: form.category,
          ...(form.commitSha.trim() ? { commitSha: form.commitSha.trim() } : {}),
        },
      });
      setForm({ title: "", bodyMd: "", category: "fix", commitSha: "" });
      setComposerOpen(false);
      await load();
    } catch (e) {
      setError(toUserMessage(e, "Could not save that entry."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-velvet">Internal</p>
          <h1 className="mt-1 font-display text-3xl text-ink sm:text-4xl">Release log</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/70">
            The full technical record of what shipped, including security fixes kept vague on the
            customer-facing What's new page. Entries are written at publish time and tagged with the
            commit SHA that went live, so this reflects what is genuinely deployed rather than being
            generated from git history.
          </p>
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entries"
            className="min-w-[12rem] flex-1 rounded-full border border-ink/15 bg-paper px-4 py-2 text-sm"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category | "")}
            className="rounded-full border border-ink/15 bg-paper px-3 py-2 text-sm"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setComposerOpen((o) => !o)}
            className="rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {composerOpen ? "Close" : "Add entry"}
          </button>
        </div>

        {composerOpen && (
          <div className="mb-8 space-y-3 rounded-2xl border border-ink/10 bg-secondary/40 p-4">
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="What changed"
              className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
            <textarea
              value={form.bodyMd}
              onChange={(e) => setForm((f) => ({ ...f, bodyMd: e.target.value }))}
              rows={4}
              placeholder="Technical detail, root cause, files touched"
              className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
                className="rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                value={form.commitSha}
                onChange={(e) => setForm((f) => ({ ...f, commitSha: e.target.value }))}
                placeholder="Commit SHA (optional)"
                className="flex-1 rounded-xl border border-ink/15 bg-paper px-3 py-2 font-mono text-xs"
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => void submit()}
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save entry"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mb-6 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>
        )}

        {entries === null ? (
          <div className="space-y-3">
            <SkeletonBlock className="h-20 w-full" />
            <SkeletonBlock className="h-20 w-full" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-ink/60">No entries match that filter yet.</p>
        ) : (
          <div className="space-y-8">
            {grouped.map(([day, rows]) => (
              <section key={day}>
                <h2 className="mb-3 text-sm font-semibold text-ink/70">{day}</h2>
                <ul className="space-y-3">
                  {rows.map((e) => (
                    <li key={e.id} className="rounded-2xl border border-ink/10 bg-paper p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                                CATEGORY_STYLE[e.category] ?? CATEGORY_STYLE.content
                              }`}
                            >
                              {e.category}
                            </span>
                            {e.commit_sha && (
                              <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-ink/70">
                                {e.commit_sha.slice(0, 8)}
                              </code>
                            )}
                            <span className="text-[11px] text-ink/50">
                              {formatStampTime((e.published_at))}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm font-medium text-ink">{e.title}</p>
                          {e.body_md && (
                            <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">
                              {e.body_md}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            await removeEntry({ data: { id: e.id } });
                            await load();
                          }}
                          className="shrink-0 rounded-full border border-ink/15 px-3 py-1 text-xs text-ink/60 hover:bg-secondary"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
