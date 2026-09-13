import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, ArrowLeft, ArrowRight, Upload, Crop } from "lucide-react";
import { toast } from "sonner";
import { uploadMediaFile } from "@/lib/media-upload-client";
import { FocalImage, ImageFocalControl } from "@/components/image-focal-control";


const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const MAX_BYTES = 8 * 1024 * 1024;

type Source = "converter" | "invite" | "announcement" | "wall" | "design" | "rfq" | "other";

/** Shared validation so every upload surface rejects the same things the same way. */
export function checkImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return `${file.name} isn't an image. Use JPG, PNG, WEBP or GIF.`;
  if (!ACCEPTED.includes(file.type)) return `${file.name} is an unsupported image type. Use JPG, PNG, WEBP or GIF.`;
  if (file.size > MAX_BYTES) return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 8MB.`;
  return null;
}

export function ImageUploadField({
  value,
  onChange,
  source = "other",
  altText,
  aspect = "aspect-video",
  hint,
  buttonLabel = "Upload image",
  reposition = true,
  round = false,
}: {
  value: string;
  onChange: (url: string) => void;
  source?: Source;
  altText?: string;
  aspect?: string;
  hint?: string;
  buttonLabel?: string;
  /** Offer the drag/zoom reposition control once an image is present. */
  reposition?: boolean;
  /** Preview the reposition frame as a circle (avatar/logo style frames). */
  round?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    const problem = checkImageFile(file);
    if (problem) return toast.error(problem);
    setBusy(true);
    try {
      onChange(await uploadMediaFile(file, { source, altText }));
      toast.success("Uploaded.");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed. Please try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className={`relative overflow-hidden rounded-xl bg-secondary ring-1 ring-ink/10 ${aspect}`}>
          <FocalImage url={value} alt={altText || "Uploaded image preview"} className="h-full w-full" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
            aria-label="Remove image"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`grid w-full place-items-center rounded-xl border border-dashed border-ink/20 bg-paper/60 text-xs text-muted-foreground hover:bg-secondary ${aspect}`}
        >
          <span className="flex flex-col items-center gap-1">
            <ImagePlus className="h-5 w-5 text-ink/30" />
            {busy ? "Uploading…" : buttonLabel}
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-secondary px-4 text-xs font-medium text-ink hover:bg-ink/10 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {value ? "Replace" : buttonLabel}
        </button>
        {value && reposition && (
          <button
            type="button"
            onClick={() => setAdjusting((v) => !v)}
            aria-expanded={adjusting}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-secondary px-4 text-xs font-medium text-ink hover:bg-ink/10"
          >
            <Crop className="h-3.5 w-3.5" />
            {adjusting ? "Done adjusting" : "Reposition"}
          </button>
        )}
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {value && reposition && adjusting && (
        <div className="rounded-xl border border-ink/10 bg-paper/70 p-3">
          <ImageFocalControl
            url={value}
            onChange={onChange}
            aspectClassName={aspect}
            round={round}
            label="Reposition this image"
          />
        </div>
      )}

    </div>
  );
}

export function ImageGalleryUploader({
  value,
  onChange,
  source = "other",
  altText,
  max = 8,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  source?: Source;
  altText?: string;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    const room = max - value.length;
    if (room <= 0) return toast.error(`You can upload up to ${max} photos.`);
    const chosen = Array.from(files).slice(0, room);
    if (files.length > room) toast.error(`Only ${room} more photo${room === 1 ? "" : "s"} will fit.`);
    setBusy(true);
    const added: string[] = [];
    for (const file of chosen) {
      const problem = checkImageFile(file);
      if (problem) {
        toast.error(problem);
        continue;
      }
      try {
        added.push(await uploadMediaFile(file, { source, altText }));
      } catch (e: any) {
        toast.error(e?.message ?? `${file.name} failed to upload.`);
      }
    }
    if (added.length) {
      onChange([...value, ...added]);
      toast.success(`Added ${added.length} photo${added.length === 1 ? "" : "s"}.`);
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function move(index: number, delta: number) {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {value.map((url, i) => (
            <li key={`${url}-${i}`} className="group relative overflow-hidden rounded-xl ring-1 ring-ink/10">
              <img
                src={url}
                alt={altText ? `${altText} photo ${i + 1}` : `Gallery photo ${i + 1}`}
                className="aspect-square w-full bg-secondary object-cover"
              />
              {i === 0 && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
                  Cover
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-1.5">
                <div className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} aria-label="Move earlier" className="rounded-full bg-white/20 p-1 text-white hover:bg-white/35">
                    <ArrowLeft className="h-3 w-3" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} aria-label="Move later" className="rounded-full bg-white/20 p-1 text-white hover:bg-white/35">
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label="Remove photo"
                  className="rounded-full bg-white/20 p-1 text-white hover:bg-red-500/80"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || value.length >= max}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/10 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          Add photos
        </button>
        <span className="text-[11px] text-muted-foreground">
          {value.length}/{max} photos, JPG, PNG, WEBP or GIF up to 8MB each. The first photo is the cover.
        </span>
      </div>
    </div>
  );
}
