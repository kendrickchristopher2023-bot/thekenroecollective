// Guest-facing Photo Wall entry point on the invitation. Self-hides when the
// event doesn't have Photo Wall, so it's safe to render unconditionally.
// No account needed: the invite link is the access.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getPhotoWallAccess } from "@/lib/branding.functions";
import { listEventPhotos } from "@/lib/photo-wall.functions";
import { isShowcaseEvent } from "@/lib/showcase";

export function InvitePhotoWall({ eventId }: { eventId: string }) {
  // On the public sample the wall can be browsed but not added to.
  const readOnly = isShowcaseEvent(eventId);
  const [allowed, setAllowed] = useState<boolean | undefined>(undefined);
  const [previews, setPreviews] = useState<{ id: string; url: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    getPhotoWallAccess({ data: { eventId } })
      .then((r) => { if (!cancelled) setAllowed(r.allowed); })
      .catch(() => { if (!cancelled) setAllowed(false); });
    return () => { cancelled = true; };
  }, [eventId]);

  useEffect(() => {
    if (allowed !== true) return;
    let cancelled = false;
    listEventPhotos({ data: { eventId } })
      .then((rows) => { if (!cancelled) setPreviews(rows.slice(0, 6).map((r) => ({ id: r.id, url: r.url }))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [allowed, eventId]);

  if (allowed !== true) return null;

  return (
    <section className="mx-auto max-w-2xl px-6 pb-14">
      <div className="rounded-2xl border border-ink/10 bg-card p-5 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-velvet">Photo Wall</p>
        <h3 className="mt-1 font-serif text-2xl">Share your photos</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {readOnly
            ? "Browse the wall from the day. On your own event, this is where guests add their photos."
            : "Add photos from the day and they'll appear on the live wall. No sign-up needed."}
        </p>

        {previews.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {previews.map((p) => (
              <img
                key={p.id}
                src={p.url}
                alt="Photo shared by a guest"
                loading="lazy"
                className="aspect-square w-full rounded-lg object-cover"
              />
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {!readOnly && (
            <Link
              to="/wall/$eventId/upload"
              params={{ eventId }}
              className="inline-flex min-h-11 items-center rounded-full bg-ink px-4 py-2 text-base font-medium text-paper hover:opacity-90"
            >
              Add your photos
            </Link>
          )}
          <Link
            to="/wall/$eventId"
            params={{ eventId }}
            search={{}}
            className="inline-flex min-h-11 items-center rounded-full border border-ink/15 bg-card px-4 py-2 text-base font-medium hover:bg-secondary"
          >
            View the wall
          </Link>
        </div>
      </div>
    </section>
  );
}
