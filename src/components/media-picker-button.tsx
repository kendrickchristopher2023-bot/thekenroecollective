import { useEffect, useRef, useState } from "react";
import { SkeletonTileGrid } from "@/components/skeletons";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2, Upload, X, Copy, Check } from "lucide-react";
import { listMyUploads, deleteMyUpload, uploadAndRecord } from "@/lib/media-uploads.functions";
import { confirmDialog } from "@/lib/confirm-dialog";
import { useDialogA11y } from "@/lib/use-dialog-a11y";

type Upload = {
  id: string;
  public_url: string;
  original_filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  source: string;
  created_at: string;
  alt_text?: string | null;
  visibility?: string;
};

type Source = "invite" | "announcement" | "wall" | "converter" | "other";

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

export type PickedMeta = { alt?: string | null; width?: number | null; height?: number | null };

export function MediaPickerButton({
  onPick,
  source = "other",
  label = "Choose from My Uploads",
  className = "",
}: {
  onPick: (url: string, meta?: PickedMeta) => void;
  source?: Source;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          "inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/10"
        }
      >
        <ImagePlus className="h-3.5 w-3.5" /> {label}
      </button>
      {open && (
        <MediaPickerModal
          onClose={() => setOpen(false)}
          onPick={(url, meta) => {
            onPick(url, meta);
            setOpen(false);
          }}
          source={source}
        />
      )}
    </>
  );
}

function MediaPickerModal({
  onClose,
  onPick,
  source,
}: {
  onClose: () => void;
  onPick: (url: string, meta?: PickedMeta) => void;
  source: Source;
}) {
  const dialogRef = useDialogA11y(onClose);
  const list = useServerFn(listMyUploads);
  const del = useServerFn(deleteMyUpload);
  const upload = useServerFn(uploadAndRecord);
  const [items, setItems] = useState<Upload[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      const r = (await list({ data: { limit: 60 } } as any)) as { items: Upload[] };
      setItems(r.items ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't load your uploads");
      setItems([]);
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFile(f: File) {
    if (!f.type.startsWith("image/")) return toast.error("Please choose an image.");
    if (f.size > 20 * 1024 * 1024) return toast.error("Max 20MB.");
    setBusy(true);
    try {
      const buf = await f.arrayBuffer();
      const res = await upload({
        data: {
          filename: f.name,
          contentType: f.type,
          base64: arrayBufferToBase64(buf),
          source,
          originalFilename: f.name,
        },
      } as any);
      toast.success("Uploaded.");
      onPick((res as any).url, { width: null, height: null });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!(await confirmDialog({ title: "Delete this upload? Anything still using its URL will break." }))) return;
    try {
      await del({ data: { id } } as any);
      setItems((prev) => (prev ?? []).filter((x) => x.id !== id));
      toast.success("Deleted.");
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    }
  }

  async function copyUrl(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }

  const filtered = (items ?? []).filter((x) =>
    !query.trim() ? true : (x.original_filename ?? "").toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="relative max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-paper text-ink shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-3">
          <div>
            <h2 className="font-serif text-lg">My Uploads</h2>
            <p className="text-[11px] text-ink/55">Reuse any image you've shared before, or upload a new one.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-ink/10 px-5 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by filename…"
            className="flex-1 min-w-[160px] rounded-full border border-ink/15 bg-paper px-3 py-1.5 text-xs"
          />
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-velvet px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload new
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5">
          {items === null ? (
            <SkeletonTileGrid tiles={8} />
          ) : filtered.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-ink/15 py-16 text-center text-sm text-ink/55">
              <div>
                <ImagePlus className="mx-auto mb-2 h-6 w-6 text-ink/30" />
                Nothing here yet. Upload your first image to start a reusable library.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((it) => (
                <div key={it.id} className="group relative overflow-hidden rounded-xl ring-1 ring-ink/10">
                  <button
                    type="button"
                    onClick={() => onPick(it.public_url, { alt: it.alt_text ?? null, width: it.width, height: it.height })}
                    className="block aspect-square w-full overflow-hidden bg-secondary"
                    title="Use this image"
                  >
                    <img src={it.public_url} alt={it.original_filename ?? ""} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                  </button>
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 text-[10px] text-white">
                    <span className="truncate" title={it.original_filename ?? ""}>
                      {it.original_filename ?? "image"}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyUrl(it.id, it.public_url);
                        }}
                        title="Copy URL"
                        className="rounded-full bg-white/15 p-1 hover:bg-white/25"
                      >
                        {copiedId === it.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(it.id);
                        }}
                        title="Delete"
                        className="rounded-full bg-white/15 p-1 hover:bg-red-500/80"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
