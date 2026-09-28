import { toUserMessage } from "@/lib/user-error";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { searchGiphy, type GiphyResult } from "@/lib/giphy.functions";

/**
 * Search a real photo or GIF to use as the invitation backdrop.
 *
 * Third backdrop source alongside the curated painted art and "upload your
 * own": a host who wants an actual bonfire, not an illustration of one, can
 * search for it here. Two deliberate choices for older users:
 *
 * - "Still photo" is the default. A frozen frame keeps the invitation calm and
 *   readable; animation is opt-in, never the surprise default.
 * - one big search field, one big Search button, large tap targets on the
 *   results grid, and a plain-language note about what happens on pick.
 */
export function ThemePhotoPicker({
  onPick,
}: {
  /** Called with the chosen image URL, ready to store as the backdrop. */
  onPick: (url: string) => void;
}) {
  const search = useServerFn(searchGiphy);
  const [query, setQuery] = useState("");
  const [motion, setMotion] = useState<"still" | "animated">("still");
  const [results, setResults] = useState<GiphyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const run = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const found = await search({ data: { query: q, offset: 0, limit: 24 } });
      setResults(found);
    } catch (e) {
      setError(toUserMessage(e, "Photo search is unavailable right now."));
    } finally {
      setLoading(false);
    }
  };

  const srcFor = (r: GiphyResult) => (motion === "still" ? r.still || r.url : r.url);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run(query);
            }
          }}
          placeholder="Search a photo, for example: bonfire, garden party, beach"
          aria-label="Search for a backdrop photo"
          className="min-h-11 flex-1 rounded-md bg-paper px-3 text-sm ring-1 ring-ink/15"
        />
        <button
          type="button"
          onClick={() => void run(query)}
          className="min-h-11 rounded-md bg-ink px-4 text-sm font-medium text-paper hover:opacity-90"
        >
          Search
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {(
          [
            { id: "still", label: "Still photo" },
            { id: "animated", label: "Animated" },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMotion(m.id)}
            aria-pressed={motion === m.id}
            className={`min-h-11 rounded-full px-4 text-xs transition ${
              motion === m.id ? "bg-ink text-paper" : "bg-paper text-muted-foreground ring-1 ring-ink/15"
            }`}
          >
            {m.label}
          </button>
        ))}
        <span className="self-center text-[10px] text-muted-foreground">
          Still keeps the invitation calm and easy to read.
        </span>
      </div>

      {loading ? <p className="mt-3 text-[11px] text-muted-foreground">Searching…</p> : null}
      {error ? <p className="mt-3 text-[11px] text-destructive">{error}</p> : null}
      {!loading && !error && searched && results.length === 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Nothing found for that. Try a simpler word, like "bonfire".
        </p>
      ) : null}

      {results.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onPick(srcFor(r))}
              title={r.title || "Use this photo"}
              className="overflow-hidden rounded-lg ring-1 ring-ink/10 transition hover:ring-2 hover:ring-ink"
            >
              <img
                src={motion === "still" ? r.still || r.preview : r.preview}
                alt={r.title || "Backdrop option"}
                loading="lazy"
                decoding="async"
                className="h-24 w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      <p className="mt-2 text-[10px] text-muted-foreground">
        Tap a picture to use it as your invitation backdrop. You can change or remove it any time.
      </p>
    </div>
  );
}
