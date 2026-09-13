// Host-side Photo Wall management: moderation (hide / remove), bulk download of
// every photo after the event, and licensed background music for the slideshow.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { listEventPhotosForHost, moderateEventPhoto } from "@/lib/photo-wall.functions";
import { WallSoundtrackPanel } from "@/components/wall-soundtrack-panel";
import { canManageSoundtrack } from "@/lib/wall-soundtrack-access";
import { useIsOwner } from "@/lib/use-is-owner";
import { getEntitlements } from "@/lib/entitlements-client";
import { getPhotoWallAccess } from "@/lib/branding.functions";
import { confirmDialog } from "@/lib/confirm-dialog";

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

type HostPhoto = {
  id: string;
  label: string | null;
  status: "visible" | "hidden";
  createdAt: string;
  url: string;
  path: string;
};

export function PhotoWallPanel({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const [photos, setPhotos] = useState<HostPhoto[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [access, setAccess] = useState<boolean | undefined>(undefined);
  // Soundtrack tools are internal-only for now (see wall-soundtrack-access.ts).
  const { isOwner } = useIsOwner();
  const [hasAtelier, setHasAtelier] = useState(false);
  const soundtrackAllowed = canManageSoundtrack({ isOwner, hasAtelier });

  useEffect(() => {
    let cancelled = false;
    getEntitlements()
      .then((e) => {
        if (!cancelled) setHasAtelier(!!e.hasAtelier);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);



  useEffect(() => {
    let cancelled = false;
    getPhotoWallAccess({ data: { eventId } })
      .then((r) => {
        if (!cancelled) setAccess(r.allowed);
      })
      .catch(() => {
        if (!cancelled) setAccess(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const load = useCallback(async () => {
    try {
      const rows = await listEventPhotosForHost({ data: { eventId } });
      setPhotos(rows);
    } catch (e) {
      toast.error(errMsg(e, "Couldn't load photos"));
      setPhotos([]);
    }
  }, [eventId]);

  useEffect(() => {
    if (access !== true) return;
    void load();
  }, [access, load]);

  async function moderate(photoId: string, action: "hide" | "show" | "remove") {
    if (
      action === "remove" &&
      !(await confirmDialog({
        title: "Remove this photo permanently?",
        body: "The photo is deleted for good. If you only want it off the wall for now, choose Hide instead.",
        confirmLabel: "Yes, delete it",
      }))
    )
      return;
    setBusy(photoId);
    try {
      await moderateEventPhoto({ data: { eventId, photoId, action } });
      await load();
      toast.success(
        action === "remove"
          ? "Photo removed."
          : action === "hide"
            ? "Hidden from the wall."
            : "Back on the wall.",
      );
    } catch (e) {
      toast.error(errMsg(e, "Couldn't update that photo"));
    } finally {
      setBusy(null);
    }
  }

  async function downloadAll() {
    if (!photos || photos.length === 0) return;
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (const p of photos) {
        const res = await fetch(p.url);
        if (!res.ok) continue;
        const blob = await res.blob();
        const name = p.path.split("/").pop() || `${p.id}.jpg`;
        zip.file(p.label ? `${p.label.replace(/[^\w -]+/g, "")}-${name}` : name, blob);
      }
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${eventTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "event"}-photos.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download started.");
    } catch (e) {
      toast.error(errMsg(e, "Couldn't build the download"));
    } finally {
      setZipping(false);
    }
  }

  if (access !== true) return null;

  const visibleCount = photos?.filter((p) => p.status === "visible").length ?? 0;

  return (
    <section className="rounded-2xl border border-ink/10 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl text-ink">Photo Wall</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {photos === null
              ? "Loading photos…"
              : photos.length === 0
                ? "No guest photos yet. Share the upload link or QR code and they'll land here."
                : `${visibleCount} on the wall, ${photos.length - visibleCount} hidden.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/wall/${eventId}?tv=1`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90"
          >
            Open TV mode ↗
          </a>
          <button
            type="button"
            onClick={() => void downloadAll()}
            disabled={zipping || !photos || photos.length === 0}
            className="rounded-lg border border-ink/15 bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
          >
            {zipping ? "Preparing…" : "Download all photos"}
          </button>
        </div>
      </div>

      {photos && photos.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-xl border border-ink/10">
              <img
                src={p.url}
                alt={p.label ? `Photo from ${p.label}` : "Guest photo"}
                loading="lazy"
                className={`aspect-square w-full object-cover object-center ${p.status === "hidden" ? "opacity-40" : ""}`}
              />
              <div className="p-2">
                <p className="truncate text-[11px] text-ink/60">{p.label || "Guest"}</p>
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => void moderate(p.id, p.status === "visible" ? "hide" : "show")}
                    className="rounded-md border border-ink/15 px-2 py-0.5 text-[11px] hover:bg-secondary disabled:opacity-50"
                  >
                    {p.status === "visible" ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => void moderate(p.id, "remove")}
                    className="rounded-md border border-destructive/30 px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {soundtrackAllowed && <WallSoundtrackPanel eventId={eventId} />}
    </section>
  );
}
