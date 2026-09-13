import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { fetchPublicEvent, type KEvent } from "@/lib/events-store";
import { getPhotoWallAccess } from "@/lib/branding.functions";
import { uploadEventPhoto } from "@/lib/photo-wall.functions";

export const Route = createFileRoute("/wall/$eventId/upload")({
  head: ({ params }) => ({
    meta: [
      { title: "Share photos — The Kenroe Collective" },
      { name: "description", content: "Tap, snap, and share photos to the live event gallery." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Share your photos" },
      { property: "og:description", content: "Add photos to the live event gallery." },
      { property: "og:url", content: `https://thekenroecollective.com/wall/${params.eventId}/upload` },
    ],
    links: [{ rel: "canonical", href: `https://thekenroecollective.com/wall/${params.eventId}/upload` }],
  }),
  component: UploadPage,
});

type Uploaded = { name: string; url: string };

const LABEL_KEY = "kenroe.wall.label";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

function UploadPage() {
  const { eventId } = Route.useParams();
  const [event, setEvent] = useState<KEvent | null | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [recent, setRecent] = useState<Uploaded[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<boolean | undefined>(undefined);
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicEvent(eventId).then((e) => { if (!cancelled) setEvent(e ?? null); });
    return () => { cancelled = true; };
  }, [eventId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setLabel(window.localStorage.getItem(LABEL_KEY) ?? "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPhotoWallAccess({ data: { eventId } })
      .then((r) => { if (!cancelled) setAccess(r.allowed); })
      .catch(() => { if (!cancelled) setAccess(false); });
    return () => { cancelled = true; };
  }, [eventId]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    const total = files.length;
    setProgress({ done: 0, total });
    if (typeof window !== "undefined") window.localStorage.setItem(LABEL_KEY, label.trim());
    const accepted: Uploaded[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const done = () => setProgress({ done: i + 1, total });
      // Reject non-images loudly. Silently skipping them looked like the upload
      // had worked, which is worse than a plain error.
      if (!file.type.startsWith("image/")) {
        setError(`"${file.name}" isn't an image. Add a JPG, PNG, WebP or GIF.`);
        done();
        continue;
      }


      // HEIC/HEIF (the default iPhone camera format) isn't decodable by most
      // browsers — it would upload "successfully" but show as a broken image
      // on the slideshow (which usually runs on a TV/laptop, not Safari/Mac).
      const isHeic = /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
      if (isHeic) {
        setError("HEIC photos can't be shown on the slideshow. On iPhone: Settings → Camera → Formats → \"Most Compatible\", then retake or re-select the photo.");
        done();
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        setError(`"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)}MB. Each photo must be under 20MB.`);
        done();
        continue;
      }

      try {
        const dataBase64 = await toBase64(file);
        const res = await uploadEventPhoto({
          data: {
            eventId,
            fileName: file.name,
            contentType: file.type,
            label: label.trim() || undefined,
            dataBase64,
          },
        });
        accepted.push({ name: file.name, url: res.url });
      } catch (e: any) {
        setError(e?.message ?? "Couldn't add that photo.");
      }
      done();
    }

    setRecent((prev) => [...accepted, ...prev].slice(0, 12));
    setUploading(false);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const title = event?.title || "this event";

  if (access === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-8 text-center">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-velvet">Photo Wall</p>
          <h1 className="mt-2 font-serif text-2xl">Not enabled for this event</h1>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Photo Wall isn't turned on for {title} yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper px-4 py-8">
      <div className="mx-auto max-w-md">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-velvet">Photo Wall</p>
        <h1 className="mt-1 font-serif text-3xl leading-tight">Share photos from {title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick photos from your camera roll or snap a new one, they'll appear on the big screen. No account needed.
        </p>

        <label className="mt-5 block text-xs font-medium uppercase tracking-wide text-ink/60" htmlFor="wall-label">
          Your name (optional)
        </label>
        <input
          id="wall-label"
          value={label}
          onChange={(e) => setLabel(e.target.value.slice(0, 60))}
          placeholder="So the host knows who to thank"
          className="mt-1 w-full rounded-xl border border-ink/15 bg-card px-3 py-2 text-sm"
        />

        <label
          htmlFor="photo-input"
          className="mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-velvet/40 bg-velvet/5 px-6 py-12 text-center transition-colors hover:bg-velvet/10"
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-velvet">
            <path d="M12 16V8M12 8l-4 4M12 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="3" y="4" width="18" height="16" rx="2" />
          </svg>
          <span className="font-medium text-ink">{uploading ? "Uploading…" : "Tap to add photos"}</span>
          <span className="text-xs text-muted-foreground">JPG, PNG, WebP or GIF • up to 20MB each</span>
        </label>
        <input
          ref={inputRef}
          id="photo-input"
          type="file"
          accept="image/*"
          
          multiple
          className="sr-only"
          onChange={(e) => void handleFiles(e.target.files)}
          disabled={uploading}
        />

        {progress && (
          <div className="mt-4 rounded-2xl bg-secondary/40 px-4 py-3 text-sm">
            Uploading {progress.done} of {progress.total}…
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
        )}

        {recent.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/50">Just added</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {recent.map((r) => (
                <img key={r.url} src={r.url} alt="Your uploaded photo" loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between text-xs text-muted-foreground">
          <Link to="/wall/$eventId" params={{ eventId }} search={{}} className="font-medium text-velvet hover:underline">
            Open live slideshow →
          </Link>
          <span>Powered by The Kenroe Collective</span>
        </div>
      </div>
    </div>
  );
}
