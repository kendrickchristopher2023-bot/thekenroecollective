import { toUserMessage } from "@/lib/user-error";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { searchGiphy, type GiphyResult } from "@/lib/giphy.functions";

export function GiphyPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (url: string | undefined) => void;
}) {
  const search = useServerFn(searchGiphy);
  const [query, setQuery] = useState("thank you");
  const [submitted, setSubmitted] = useState("thank you");
  const [results, setResults] = useState<GiphyResult[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    search({ data: { query: submitted, offset: 0, limit: 24 } })
      .then((r) => {
        if (!alive) return;
        setResults(r);
        setOffset(r.length);
      })
      .catch((e: unknown) => alive && setErr(toUserMessage(e, "Failed to load GIFs")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [submitted, search]);

  const loadMore = async () => {
    setLoading(true);
    try {
      const more = await search({ data: { query: submitted, offset, limit: 24 } });
      setResults((prev) => [...prev, ...more]);
      setOffset((o) => o + more.length);
    } catch (e) {
      setErr(toUserMessage(e, "Failed to load more"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setSubmitted(query);
            }
          }}
          placeholder="Search GIPHY (e.g. thank you, confetti, hearts)"
          className="flex-1 rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm !text-ink placeholder:text-ink/50 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setSubmitted(query)}
          className="rounded-md bg-velvet px-3 py-2 text-xs font-medium text-white"
        >
          Search
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground hover:bg-secondary/70"
          >
            ✕ Clear
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {results.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onChange(g.url)}
            className={`group relative overflow-hidden rounded-lg ring-2 transition ${
              value === g.url ? "ring-velvet" : "ring-transparent hover:ring-ink/20"
            }`}
            title={g.title}
          >
            <img src={g.preview} alt={g.title} loading="lazy" className="h-24 w-full object-cover" />
            {value === g.url && (
              <span className="absolute right-1 top-1 rounded-full bg-velvet px-1.5 text-[9px] font-medium text-white">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">Powered by GIPHY</p>
        {results.length > 0 && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded-md bg-secondary px-3 py-1 text-[11px] text-muted-foreground hover:bg-secondary/70 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
        {loading && results.length === 0 && (
          <p className="text-[11px] text-muted-foreground">Loading…</p>
        )}
      </div>
    </div>
  );
}
