import { toUserMessage } from "@/lib/user-error";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listEventComments,
  markCommentsRead,
  moderateComment,
  replyToComment,
  type HostComment,
} from "@/lib/comments.functions";
import { formatTimestamp } from "@/lib/datetime";

function when(iso: string) {
  return formatTimestamp((iso));
}

/**
 * Host-side comment moderation. Hosts and co-hosts see every comment
 * regardless of the visibility the guest chose, can reply to any of them, and
 * can hide, unhide, flip a public comment to private, or remove it outright,
 * matching the Well wishes moderation pattern.
 */
export function EventCommentsPanel({ eventId }: { eventId: string }) {
  const list = useServerFn(listEventComments);
  const reply = useServerFn(replyToComment);
  const moderate = useServerFn(moderateComment);
  const markRead = useServerFn(markCommentsRead);

  const [comments, setComments] = useState<HostComment[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await list({ data: { eventId } });
      setComments(res.comments);
      setUnread(res.unread);
    } catch (e) {
      setComments([]);
      setError(toUserMessage(e, "Could not load comments."));
    }
  }, [list, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const threads = (comments ?? []).filter((c) => c.authorRole === "guest");
  const repliesOf = (id: string) => (comments ?? []).filter((c) => c.parentId === id);

  async function sendReply(parentId: string) {
    if (!replyBody.trim()) return;
    setBusy(true);
    try {
      await reply({ data: { eventId, parentId, body: replyBody.trim() } });
      setReplyBody("");
      setReplyTo(null);
      await load();
    } catch (e) {
      setError(toUserMessage(e, "Could not send that reply."));
    } finally {
      setBusy(false);
    }
  }

  async function apply(id: string, patch: Parameters<typeof moderateComment>[0]) {
    await moderate({ data: { id, ...(patch as any) } });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">Guest comments</h3>
          {unread > 0 && (
            <span className="rounded-full bg-velvet px-2 py-0.5 text-[11px] font-semibold text-white">
              {unread} new
            </span>
          )}
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={async () => {
              await markRead({ data: { eventId } });
              await load();
            }}
            className="rounded-full border border-ink/15 px-3 py-1 text-xs text-ink/70 hover:bg-secondary"
          >
            Mark all read
          </button>
        )}
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p>}

      {comments === null ? (
        <p className="text-sm text-ink/50">Loading comments...</p>
      ) : threads.length === 0 ? (
        <p className="text-sm text-ink/60">
          No comments yet. Guests can leave private notes for you from the invitation, and public
          ones too when you allow it.
        </p>
      ) : (
        <ul className="space-y-3">
          {threads.map((c) => (
            <li key={c.id} className="rounded-2xl border border-ink/10 bg-paper p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">{c.name || "A guest"}</span>
                <span className="text-xs text-ink/45">{when(c.createdAt)}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    c.visibility === "public"
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-secondary text-ink/60"
                  }`}
                >
                  {c.visibility === "public" ? "Public" : "Private to you"}
                </span>
                {c.hidden && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">
                    Hidden
                  </span>
                )}
                {!c.hostReadAt && (
                  <span className="rounded-full bg-velvet/10 px-2 py-0.5 text-[11px] text-velvet">
                    New
                  </span>
                )}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink/80">{c.body}</p>

              {repliesOf(c.id).map((r) => (
                <div key={r.id} className="mt-3 rounded-xl bg-secondary/60 p-3">
                  <p className="text-xs font-semibold text-velvet">
                    Your reply · {when(r.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink/80">{r.body}</p>
                </div>
              ))}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReplyTo(replyTo === c.id ? null : c.id);
                    setReplyBody("");
                  }}
                  className="rounded-full border border-ink/15 px-3 py-1 text-xs text-ink/70 hover:bg-secondary"
                >
                  {replyTo === c.id ? "Cancel" : "Reply"}
                </button>
                <button
                  type="button"
                  onClick={() => void apply(c.id, { id: c.id, hidden: !c.hidden } as any)}
                  className="rounded-full border border-ink/15 px-3 py-1 text-xs text-ink/70 hover:bg-secondary"
                >
                  {c.hidden ? "Unhide" : "Hide"}
                </button>
                {c.visibility === "public" && (
                  <button
                    type="button"
                    onClick={() => void apply(c.id, { id: c.id, visibility: "private" } as any)}
                    className="rounded-full border border-ink/15 px-3 py-1 text-xs text-ink/70 hover:bg-secondary"
                  >
                    Make private
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void apply(c.id, { id: c.id, remove: true } as any)}
                  className="rounded-full border border-rose-200 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50"
                >
                  Remove
                </button>
              </div>

              {replyTo === c.id && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={3}
                    placeholder="Reply to this guest"
                    className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={busy || !replyBody.trim()}
                    onClick={() => void sendReply(c.id)}
                    className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {busy ? "Sending..." : "Send reply"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
