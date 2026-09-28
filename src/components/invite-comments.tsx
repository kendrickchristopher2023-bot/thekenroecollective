import { useCallback, useEffect, useState } from "react";
import {
  fetchEventComments,
  postEventComment,
  type GuestComment,
} from "@/lib/comments.functions";
import { formatTimestamp } from "@/lib/datetime";
import { isShowcaseEvent, SHOWCASE_READONLY_MESSAGE } from "@/lib/showcase";

type Props = {
  eventId: string;
  guest: { id: string; name?: string } | null;
  publicCommentsEnabled: boolean;
};

function when(iso: string) {
  return formatTimestamp((iso));
}

/**
 * Guest-facing comments on the invitation. Private is the default because
 * these invite links get shared widely; a guest has to deliberately choose
 * "Everyone" and the host has to have allowed public comments at all.
 */
export function InviteComments({ eventId, guest, publicCommentsEnabled }: Props) {
  // The public sample shows what comments look like, but nobody can post one.
  const readOnly = isShowcaseEvent(eventId);
  const [comments, setComments] = useState<GuestComment[]>([]);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchEventComments({ data: { eventId, ...(guest?.id ? { guestId: guest.id } : {}) } })
      .then(setComments)
      .catch(() => {});
  }, [eventId, guest?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const threads = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  async function submit() {
    if (!guest || !body.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await postEventComment({
        data: {
          eventId,
          guestId: guest.id,
          ...(guest.name ? { guestName: guest.name } : {}),
          body: body.trim(),
          visibility,
        },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody("");
      if (res.held) {
        setNotice("Thanks. Your comment was sent to the host for review.");
      } else if (res.visibility === "private") {
        setNotice("Sent privately to the host.");
      } else {
        setNotice("Posted for everyone to see.");
      }
      load();
    } catch {
      setError("Could not post that comment. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-8">
      <h2 className="font-display text-2xl text-ink">Comments</h2>
      <p className="mt-1 text-sm text-ink/60">
        {publicCommentsEnabled
          ? "Leave a note for the host, privately or for everyone to see."
          : "Leave a private note for the host. Only the host and co-hosts will see it."}
      </p>

      {readOnly ? (
        <p className="mt-4 rounded-xl bg-secondary/60 px-4 py-3 text-sm text-ink/70">
          {SHOWCASE_READONLY_MESSAGE}
        </p>
      ) : !guest ? (
        <p className="mt-4 rounded-xl bg-secondary/60 px-4 py-3 text-sm text-ink/70">
          Find your name on the guest list above to leave a comment.
        </p>
      ) : (
        <div className="mt-4 space-y-3 rounded-2xl border border-ink/10 bg-paper p-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={1200}
            placeholder={`Add a comment as ${guest.name || "you"}`}
            className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm"
          />
          {publicCommentsEnabled && (
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["private", "Private to the host"],
                  ["public", "Everyone can see"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setVisibility(value)}
                  aria-pressed={visibility === value}
                  className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 text-sm font-medium ${
                    visibility === value
                      ? "border-velvet bg-velvet/10 text-velvet"
                      : "border-ink/15 text-ink/70 hover:bg-secondary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-ink/50">
              {visibility === "public" && publicCommentsEnabled
                ? "Other guests will see your name and this comment."
                : "Only the host and co-hosts will see this."}
            </p>
            <button
              type="button"
              disabled={busy || !body.trim()}
              onClick={() => void submit()}
              className="min-h-11 rounded-full bg-velvet px-5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Posting..." : "Post comment"}
            </button>
          </div>
          {notice && <p className="text-sm text-emerald-700">{notice}</p>}
          {error && <p className="text-sm text-rose-700">{error}</p>}
        </div>
      )}

      {threads.length > 0 && (
        <ul className="mt-6 space-y-4">
          {threads.map((c) => (
            <li key={c.id} className="rounded-2xl border border-ink/10 bg-paper p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">{c.name || "A guest"}</span>
                <span className="text-xs text-ink/45">{when(c.createdAt)}</span>
                {c.visibility === "private" && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-ink/60">
                    Private
                  </span>
                )}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink/80">{c.body}</p>
              {repliesOf(c.id).map((r) => (
                <div key={r.id} className="mt-3 rounded-xl bg-secondary/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-velvet">
                      {r.name || "Host"} · Host
                    </span>
                    <span className="text-[11px] text-ink/45">{when(r.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink/80">{r.body}</p>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
