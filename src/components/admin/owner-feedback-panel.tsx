// Read-only customer feedback summary for the Owner Command Center.
// Nothing here changes customer data.
import { toUserMessage } from "@/lib/user-error";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";
import { getOwnerFeedbackSummary, type FeedbackSummary } from "@/lib/product-feedback.functions";
import { AdminPaginationBar, AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { csvFileStem, exportCsv, pageMath } from "@/lib/admin-table";
import { formatTimestamp } from "@/lib/datetime";

type FeedbackItem = FeedbackSummary["recent"][number];
type SentimentFilter = "all" | "promoters" | "passives" | "detractors" | "low_stars";
type CommentFilter = "all" | "with_comment" | "public_pending";
type FeedbackSort = "newest" | "oldest" | "rating_desc" | "rating_asc" | "nps_desc" | "nps_asc";

function usDateTime(iso: string): string {
  return formatTimestamp((iso));
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-paper p-4 ring-1 ring-ink/10">
      <p className="text-base text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-2xl text-ink">{value}</p>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

export function OwnerFeedbackPanel({
  since,
  until,
}: {
  since: string | null;
  until: string | null;
}) {
  const load = useServerFn(getOwnerFeedbackSummary);
  const [data, setData] = useState<FeedbackSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sentiment, setSentiment] = useState<SentimentFilter>("all");
  const [comments, setComments] = useState<CommentFilter>("with_comment");
  const [sort, setSort] = useState<FeedbackSort>("newest");
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(25);

  useEffect(() => {
    if (!since || !until) return;
    let active = true;
    setLoading(true);
    setError(null);
    load({ data: { since, until } })
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e: unknown) => {
        if (active) setError(toUserMessage(e, "Could not load feedback."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [since, until]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list: FeedbackItem[] = data?.recent ?? [];
    if (q) list = list.filter((r) => (r.comment ?? "").toLowerCase().includes(q));
    if (sentiment === "promoters") list = list.filter((r) => r.nps >= 9);
    else if (sentiment === "passives") list = list.filter((r) => r.nps >= 7 && r.nps <= 8);
    else if (sentiment === "detractors") list = list.filter((r) => r.nps <= 6);
    else if (sentiment === "low_stars") list = list.filter((r) => r.rating <= 3);
    if (comments === "with_comment") list = list.filter((r) => Boolean(r.comment));
    else if (comments === "public_pending")
      list = list.filter((r) => r.allowPublic && !r.approved);
    const dir = (n: number) => n;
    return [...list].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.createdAt.localeCompare(b.createdAt);
        case "rating_desc":
          return dir(b.rating - a.rating);
        case "rating_asc":
          return dir(a.rating - b.rating);
        case "nps_desc":
          return dir(b.nps - a.nps);
        case "nps_asc":
          return dir(a.nps - b.nps);
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
  }, [data, search, sentiment, comments, sort]);

  useEffect(() => setOffset(0), [search, sentiment, comments, sort, limit, since, until]);

  const paged = useMemo(() => filtered.slice(offset, offset + limit), [filtered, offset, limit]);

  const exportFiltered = () => {
    exportCsv(csvFileStem("feedback", sentiment), filtered, [
      { header: "Feedback ID", value: (r: FeedbackItem) => r.id },
      { header: "Stars", value: (r: FeedbackItem) => r.rating },
      { header: "Recommend score", value: (r: FeedbackItem) => r.nps },
      { header: "Comment", value: (r: FeedbackItem) => r.comment ?? "" },
      { header: "Allows public use", value: (r: FeedbackItem) => (r.allowPublic ? "yes" : "no") },
      { header: "Approved", value: (r: FeedbackItem) => (r.approved ? "yes" : "no") },
      { header: "Submitted", value: (r: FeedbackItem) => r.createdAt },
    ]);
  };

  return (
    <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-ink/10">
      <h3 className="font-serif text-2xl text-ink">Customer feedback</h3>
      <p className="mt-1 text-base text-muted-foreground">
        Ratings and comments left by paying customers in this period. Read only.
      </p>

      {loading && <p className="mt-4 text-base text-muted-foreground">Loading...</p>}
      {error && <p className="mt-4 text-base text-[#7a4a4a]">{error}</p>}

      {data && !loading && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Responses" value={String(data.responses)} />
            <Stat
              label="Average stars"
              value={data.avgRating === null ? "No data" : `${data.avgRating.toFixed(1)} of 5`}
            />
            <Stat
              label="Average recommend score"
              value={data.avgNps === null ? "No data" : `${data.avgNps.toFixed(1)} of 10`}
            />
            <Stat
              label="Net promoter score"
              value={data.npsScore === null ? "No data" : String(data.npsScore)}
              note="Promoters minus detractors, as a percentage."
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Promoters (9 to 10)" value={String(data.promoters)} />
            <Stat label="Passives (7 to 8)" value={String(data.passives)} />
            <Stat label="Detractors (0 to 6)" value={String(data.detractors)} />
          </div>

          <div className="mt-5">
            <h4 className="text-lg font-medium text-ink">Responses</h4>
            <div className="mt-3">
              <AdminTableToolbar
                search={search}
                onSearch={setSearch}
                searchPlaceholder="Search comment text…"
                chips={[
                  {
                    label: "Sentiment",
                    value: sentiment,
                    options: [
                      { value: "all", label: "All" },
                      { value: "promoters", label: "Promoters" },
                      { value: "passives", label: "Passives" },
                      { value: "detractors", label: "Detractors" },
                      { value: "low_stars", label: "3 stars or fewer" },
                    ],
                    onChange: (v: SentimentFilter) => setSentiment(v),
                  },
                  {
                    label: "Comments",
                    value: comments,
                    options: [
                      { value: "with_comment", label: "With comment" },
                      { value: "public_pending", label: "Public, awaiting approval" },
                      { value: "all", label: "All responses" },
                    ],
                    onChange: (v: CommentFilter) => setComments(v),
                  },
                ]}
                sort={{
                  value: sort,
                  options: [
                    { value: "newest", label: "Newest first" },
                    { value: "oldest", label: "Oldest first" },
                    { value: "rating_desc", label: "Most stars" },
                    { value: "rating_asc", label: "Fewest stars" },
                    { value: "nps_desc", label: "Highest recommend score" },
                    { value: "nps_asc", label: "Lowest recommend score" },
                  ],
                  onChange: (v: FeedbackSort) => setSort(v),
                }}
                pageSize={limit}
                onPageSize={setLimit}
                onExport={exportFiltered}
                exportDisabled={filtered.length === 0}
              />
            </div>
            {filtered.length === 0 ? (
              <p className="mt-2 text-base text-muted-foreground">
                No responses match these filters.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {paged
                  .map((r) => (
                    <li key={r.id} className="rounded-2xl bg-paper p-4 ring-1 ring-ink/10">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex items-center gap-0.5"
                          aria-label={`${r.rating} of 5 stars`}
                        >
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`h-4 w-4 ${
                                s <= r.rating ? "fill-primary text-primary" : "text-ink/25"
                              }`}
                            />
                          ))}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          Recommend score {r.nps} of 10
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {usDateTime(r.createdAt)}
                        </span>
                        {r.allowPublic && (
                          <span className="rounded-full bg-[#3F6B52]/10 px-2 py-0.5 text-sm text-[#33573f]">
                            {r.approved ? "Shown publicly" : "Public, waiting for approval"}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-base text-ink">{r.comment}</p>
                    </li>
                  ))}
              </ul>
            )}
            <div className="mt-3">
              <AdminPaginationBar
                math={pageMath(filtered.length, offset, limit)}
                noun="responses"
                onPrev={() => setOffset(Math.max(0, offset - limit))}
                onNext={() => setOffset(offset + limit)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
