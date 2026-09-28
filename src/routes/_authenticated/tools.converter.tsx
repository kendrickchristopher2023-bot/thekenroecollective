import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Download, FolderOpen, Folder, Image as ImageIcon, Link2, Loader2, Lock, RotateCcw,
  Sparkles, Tag, Trash2, Upload, X, Copy, Code2,
} from "lucide-react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { getEntitlements, type Entitlements } from "@/lib/entitlements-client";
import { usePreviewTier } from "@/lib/preview-tier";
import {
  uploadAndRecord, listMyUploads, deleteMyUpload, restoreMyUpload,
  updateMyUpload, listMyFolders, getStorageUsage, getSignedMediaUrl,
} from "@/lib/media-uploads.functions";
import logoAsset from "@/assets/kenroes-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useEvents } from "@/lib/events-store";
import { confirmDialog, promptDialog } from "@/lib/confirm-dialog";

export const Route = createFileRoute("/_authenticated/tools/converter")({
  head: () => ({
    meta: [
      { title: "Media Converter — Atelier · The Kenroe Collective" },
      { name: "description", content: "Batch convert to WebP/AVIF/JPEG/PNG, resize, build responsive sets, organize a private media library, and share via CDN." },
    ],
  }),
  component: ConverterPage,
});

type Fmt = "image/webp" | "image/avif" | "image/jpeg" | "image/png";
const FORMATS: { value: Fmt; label: string; ext: string }[] = [
  { value: "image/webp", label: "WebP", ext: "webp" },
  { value: "image/avif", label: "AVIF", ext: "avif" },
  { value: "image/jpeg", label: "JPEG", ext: "jpg" },
  { value: "image/png", label: "PNG", ext: "png" },
];
const RESPONSIVE_WIDTHS = [480, 960, 1440, 1920];

async function detectAvifEncode(): Promise<boolean> {
  try {
    const c = document.createElement("canvas");
    c.width = 2; c.height = 2;
    const blob: Blob | null = await new Promise((res) => c.toBlob((b) => res(b), "image/avif", 0.8));
    return !!blob && blob.type === "image/avif";
  } catch { return false; }
}

function isHeic(file: File): boolean {
  const n = file.name.toLowerCase();
  return /\.(heic|heif)$/.test(n) || /heic|heif/.test(file.type);
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type Item = {
  id: string;
  file: File;
  status: "queued" | "encoding" | "uploading" | "done" | "error";
  preview: string;
  outBlobUrl?: string;
  outSize?: number;
  shareUrl?: string;
  srcset?: string;
  error?: string;
};

async function decodeBitmap(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as any);
      return { width: bmp.width, height: bmp.height, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => ctx.drawImage(bmp, 0, 0, w, h), dispose: () => bmp.close?.() };
    } catch { /* fall through */ }
  }
  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("Decode failed")); img.src = url; });
  return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => ctx.drawImage(img, 0, 0, w, h), dispose: () => URL.revokeObjectURL(url) };
}

let cachedWatermark: HTMLImageElement | null = null;
async function loadWatermark(): Promise<HTMLImageElement | null> {
  if (cachedWatermark) return cachedWatermark;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("logo")); img.src = logoAsset; });
    cachedWatermark = img;
    return img;
  } catch { return null; }
}

async function encodeAt(
  file: File,
  format: Fmt,
  quality: number,
  targetW: number,
  opts: { watermark?: boolean } = {},
) {
  const decoded = await decodeBitmap(file);
  try {
    const w = Math.min(targetW, decoded.width);
    const h = Math.round(w * (decoded.height / decoded.width));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    decoded.draw(ctx, w, h);
    if (opts.watermark) {
      const mark = await loadWatermark();
      if (mark) {
        // Composite a small monogram in the bottom-right at ~14% width, 55% opacity.
        const wmW = Math.max(48, Math.round(w * 0.14));
        const ratio = mark.naturalHeight / mark.naturalWidth || 1;
        const wmH = Math.round(wmW * ratio);
        const pad = Math.round(Math.min(w, h) * 0.025);
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.drawImage(mark, w - wmW - pad, h - wmH - pad, wmW, wmH);
        ctx.restore();
      }
    }
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), format, quality));
    if (!blob) throw new Error(format === "image/avif" ? "AVIF not supported here. Try WebP." : "Conversion failed.");
    return { blob, width: w, height: h, sourceWidth: decoded.width };
  } finally { decoded.dispose(); }
}

function ConverterPage() {
  const upload = useServerFn(uploadAndRecord);
  const usage = useServerFn(getStorageUsage);
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [tab, setTab] = useState<"convert" | "uploads" | "trash">("convert");
  const [items, setItems] = useState<Item[]>([]);
  const [format, setFormat] = useState<Fmt>("image/webp");
  const [quality, setQuality] = useState(0.85);
  const [maxWidth, setMaxWidth] = useState<number | "">("");
  const [responsive, setResponsive] = useState(false);
  const [privateUpload, setPrivateUpload] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [running, setRunning] = useState(false);
  const [avifSupported, setAvifSupported] = useState<boolean | null>(null);
  const [storage, setStorage] = useState<{ used: number; cap: number | null; owner: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewTier = usePreviewTier();

  async function refreshUsage() {
    try { setStorage(await usage({} as any) as any); } catch { /* noop */ }
  }

  useEffect(() => {
    getEntitlements().then(setEnt).catch(() => setEnt(null));
  }, [previewTier]);

  useEffect(() => {
    detectAvifEncode().then((ok) => {
      setAvifSupported(ok);
      if (!ok) setFormat((f) => (f === "image/avif" ? "image/webp" : f));
    });
    refreshUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const availableFormats = FORMATS.filter((f) => f.value !== "image/avif" || avifSupported !== false);
  const canUsePrivate = !!ent && (ent.isOwner || ent.hasAtelier);

  function addFiles(files: FileList | File[]) {
    const next: Item[] = [];
    for (const f of Array.from(files)) {
      if (isHeic(f)) { toast.error(`${f.name}: HEIC not supported in-browser. Convert to JPEG first.`); continue; }
      if (!f.type.startsWith("image/")) { toast.error(`${f.name}: not an image`); continue; }
      if (f.size > 20 * 1024 * 1024) { toast.error(`${f.name}: over 20MB`); continue; }
      next.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file: f, status: "queued", preview: URL.createObjectURL(f) });
    }
    if (next.length) setItems((prev) => [...prev, ...next]);
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it) { URL.revokeObjectURL(it.preview); if (it.outBlobUrl) URL.revokeObjectURL(it.outBlobUrl); }
      return prev.filter((x) => x.id !== id);
    });
  }

  function clearCompleted() {
    setItems((prev) => {
      prev.filter((x) => x.status === "done").forEach((it) => { URL.revokeObjectURL(it.preview); if (it.outBlobUrl) URL.revokeObjectURL(it.outBlobUrl); });
      return prev.filter((x) => x.status !== "done");
    });
  }

  function update(id: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function processOne(it: Item) {
    update(it.id, { status: "encoding", error: undefined });
    try {
      const visibility = privateUpload && canUsePrivate ? "private" : "public";
      if (responsive) {
        // Make a group id; encode and upload 4 widths
        const groupId = crypto.randomUUID();
        const ext = FORMATS.find((f) => f.value === format)?.ext ?? "bin";
        const base = it.file.name.replace(/\.[^.]+$/, "");
        const out: { url: string; w: number }[] = [];
        const seenW = new Set<number>();
        let lastShare = "";
        for (const w of RESPONSIVE_WIDTHS) {
          const r = await encodeAt(it.file, format, quality, w, { watermark });
          if (seenW.has(r.width)) continue;
          seenW.add(r.width);
          const buf = await r.blob.arrayBuffer();
          update(it.id, { status: "uploading", outSize: (it.outSize ?? 0) + r.blob.size });
          const res = await upload({
            data: {
              filename: `${base}-${r.width}w.${ext}`,
              contentType: format,
              base64: arrayBufferToBase64(buf),
              width: r.width, height: r.height,
              source: "converter",
              originalFilename: it.file.name,
              visibility,
              responsiveGroupId: groupId,
            },
          } as any);
          out.push({ url: (res as any).url, w: r.width });
          lastShare = (res as any).url;
          if (r.sourceWidth <= w) break;
        }
        const srcset = out.map((o) => `${o.url} ${o.w}w`).join(", ");
        update(it.id, { status: "done", shareUrl: lastShare, srcset });
      } else {
        const target = maxWidth && Number(maxWidth) > 0 ? Number(maxWidth) : Number.MAX_SAFE_INTEGER;
        const r = await encodeAt(it.file, format, quality, target, { watermark });
        const outBlobUrl = URL.createObjectURL(r.blob);
        update(it.id, { outBlobUrl, outSize: r.blob.size, status: "uploading" });
        const ext = FORMATS.find((f) => f.value === format)?.ext ?? "bin";
        const base = it.file.name.replace(/\.[^.]+$/, "");
        const buf = await r.blob.arrayBuffer();
        const res = await upload({
          data: {
            filename: `${base}.${ext}`,
            contentType: format,
            base64: arrayBufferToBase64(buf),
            width: r.width, height: r.height,
            source: "converter",
            originalFilename: it.file.name,
            visibility,
          },
        } as any);
        update(it.id, { status: "done", shareUrl: (res as any).url });
      }
    } catch (e: any) {
      update(it.id, { status: "error", error: e?.message ?? "Failed" });
    }
  }

  async function runBatch() {
    const queued = items.filter((x) => x.status === "queued" || x.status === "error");
    if (!queued.length) return;
    setRunning(true);
    const concurrency = 3;
    let i = 0;
    const workers = Array.from({ length: Math.min(concurrency, queued.length) }, async () => {
      while (i < queued.length) {
        const it = queued[i++];
        await processOne(it);
      }
    });
    await Promise.all(workers);
    setRunning(false);
    refreshUsage();
    toast.success("Batch complete.");
  }

  async function copyAllUrls() {
    const urls = items.filter((x) => x.shareUrl).map((x) => x.shareUrl!).join("\n");
    if (!urls) return toast.error("Nothing to copy yet.");
    await navigator.clipboard.writeText(urls);
    toast.success(`Copied ${items.filter((x) => x.shareUrl).length} URLs.`);
  }

  const counts = useMemo(() => ({
    total: items.length,
    done: items.filter((x) => x.status === "done").length,
    error: items.filter((x) => x.status === "error").length,
  }), [items]);

  if (!ent) {
    return (
      <div className="min-h-screen bg-paper text-ink">
        <SiteNav />
        <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-6 py-16">
          <p className="text-sm text-muted-foreground" role="status">Checking Media Converter access…</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (!ent.hasConverter) {
    return (
      <div className="min-h-screen bg-paper text-ink">
        <SiteNav />
        <section className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-3xl border border-ink/10 bg-secondary p-10 text-center">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-velvet/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-velvet">
              <Sparkles className="h-3 w-3" /> Add-on
            </div>
            <h1 className="mb-2 font-serif text-3xl">Media Converter</h1>
            <p className="mx-auto mb-6 max-w-prose text-ink/80">
              Batch convert, resize, build responsive sets, and organize a personal media library with folders, tags, and private galleries.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link to="/pricing" className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:opacity-90">Unlock for $5 — one time</Link>
              <Link to="/pricing" className="inline-flex items-center rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">Or get it free with Atelier</Link>
            </div>
          </div>
        </section>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteNav />
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-velvet/10 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-velvet">
              <Sparkles className="h-3 w-3" /> {ent?.hasAtelier ? "Atelier tool" : "Add-on unlocked"}
            </div>
            <h1 className="font-serif text-4xl">Media Converter</h1>
            <p className="mt-2 max-w-prose font-serif text-lg text-ink/80">
              Drop in one image or a whole gallery — optimize, resize, and copy shareable URLs.
            </p>
          </div>
          <StorageMeter storage={storage} />
        </div>

        <div className="mb-5 inline-flex rounded-full bg-secondary p-1 text-xs">
          <button onClick={() => setTab("convert")} className={`rounded-full px-4 py-1.5 font-medium ${tab === "convert" ? "bg-paper shadow-sm" : "text-ink/60"}`}>Convert</button>
          <button onClick={() => setTab("uploads")} className={`rounded-full px-4 py-1.5 font-medium inline-flex items-center gap-1.5 ${tab === "uploads" ? "bg-paper shadow-sm" : "text-ink/60"}`}>
            <FolderOpen className="h-3.5 w-3.5" /> My uploads
          </button>
          <button onClick={() => setTab("trash")} className={`rounded-full px-4 py-1.5 font-medium inline-flex items-center gap-1.5 ${tab === "trash" ? "bg-paper shadow-sm" : "text-ink/60"}`}>
            <Trash2 className="h-3.5 w-3.5" /> Trash
          </button>
        </div>

        {tab === "uploads" ? <UploadsPanel onChange={refreshUsage} /> : tab === "trash" ? <TrashPanel onChange={refreshUsage} /> : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="rounded-3xl border border-ink/10 bg-paper p-6 shadow-sm">
            <div
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
            >
              <button
                onClick={() => inputRef.current?.click()}
                className="flex h-32 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ink/15 bg-secondary/40 text-ink/60 transition hover:border-velvet/40 hover:bg-secondary"
              >
                <Upload className="mb-1 h-5 w-5" />
                <div className="font-serif text-base text-ink">Drop images or click to choose</div>
                <div className="text-[11px]">PNG · JPEG · WebP{avifSupported !== false ? " · AVIF" : ""} · up to 20MB each</div>
              </button>
              <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
            </div>

            {items.length > 0 && (
              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between text-xs text-ink/60">
                  <div>{counts.total} file{counts.total === 1 ? "" : "s"} · {counts.done} done{counts.error ? ` · ${counts.error} failed` : ""}</div>
                  <div className="flex gap-2">
                    <button onClick={copyAllUrls} className="rounded-full bg-secondary px-3 py-1 hover:bg-ink/10">Copy all URLs</button>
                    <button onClick={clearCompleted} className="rounded-full bg-secondary px-3 py-1 hover:bg-ink/10">Clear done</button>
                  </div>
                </div>
                <div className="max-h-[480px] divide-y divide-ink/5 overflow-y-auto rounded-xl ring-1 ring-ink/10">
                  {items.map((it) => (
                    <div key={it.id} className="flex items-center gap-3 p-2">
                      <img src={it.preview} alt="" className="h-12 w-12 rounded-md object-cover ring-1 ring-ink/10" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{it.file.name}</div>
                        <div className="text-[10px] text-ink/55">
                          {(it.file.size / 1024).toFixed(0)} KB
                          {it.outSize ? <> → {(it.outSize / 1024).toFixed(0)} KB</> : null}
                          {it.error ? <span className="ml-2 text-red-600">· {it.error}</span> : null}
                        </div>
                        {it.shareUrl && (
                          <div className="mt-1 space-y-0.5">
                            <div className="flex items-center gap-1">
                              <div className="flex-1 truncate text-[10px] text-ink/55">{it.shareUrl}</div>
                              <button onClick={() => { navigator.clipboard.writeText(it.shareUrl!); toast.success("Copied URL."); }} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] hover:bg-ink/10"><Copy className="inline h-2.5 w-2.5" /> URL</button>
                              {it.srcset && (
                                <button onClick={() => { navigator.clipboard.writeText(`<img src="${it.shareUrl}" srcset="${it.srcset}" sizes="(max-width:768px) 100vw, 50vw" alt="" />`); toast.success("Copied <img> HTML."); }} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] hover:bg-ink/10"><Code2 className="inline h-2.5 w-2.5" /> HTML</button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-[10px] uppercase tracking-widest text-ink/50">
                        {it.status === "queued" && "queued"}
                        {(it.status === "encoding" || it.status === "uploading") && <Loader2 className="inline h-3 w-3 animate-spin" />}
                        {it.status === "done" && <span className="text-velvet">done</span>}
                        {it.status === "error" && <span className="text-red-600">error</span>}
                      </div>
                      <button onClick={() => removeItem(it.id)} className="rounded-full p-1 text-ink/40 hover:bg-secondary hover:text-ink"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-5 rounded-3xl border border-ink/10 bg-paper p-6 shadow-sm">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-ink/60">Format</label>
              <div className="grid grid-cols-2 gap-2">
                {availableFormats.map((f) => (
                  <button key={f.value} onClick={() => setFormat(f.value)} className={`rounded-xl px-3 py-2 text-sm ring-1 transition ${format === f.value ? "bg-velvet text-white ring-velvet" : "bg-paper text-ink ring-ink/15 hover:bg-secondary"}`}>{f.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-ink/60">Quality · {Math.round(quality * 100)}%</label>
              <input type="range" min={50} max={100} value={Math.round(quality * 100)} onChange={(e) => setQuality(Number(e.target.value) / 100)} className="w-full" disabled={format === "image/png"} />
              {format === "image/png" && <div className="mt-1 text-[10px] text-ink/50">PNG is lossless.</div>}
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-ink/60">Max width (px)</label>
              <input type="number" min={1} placeholder="Keep original" value={maxWidth} onChange={(e) => setMaxWidth(e.target.value ? Number(e.target.value) : "")} disabled={responsive} className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm disabled:opacity-50" />
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-secondary/60 p-3 text-xs">
              <input type="checkbox" checked={responsive} onChange={(e) => setResponsive(e.target.checked)} className="mt-0.5" />
              <span>
                <b>Responsive set</b> — encodes 480 / 960 / 1440 / 1920 widths and returns a ready-to-paste <code>srcset</code> snippet.
              </span>
            </label>
            <label className={`flex items-start gap-2 rounded-xl p-3 text-xs ${canUsePrivate ? "cursor-pointer bg-secondary/60" : "bg-secondary/30 text-ink/50"}`}>
              <input type="checkbox" checked={privateUpload && canUsePrivate} disabled={!canUsePrivate} onChange={(e) => setPrivateUpload(e.target.checked)} className="mt-0.5" />
              <span>
                <Lock className="mr-1 inline h-3 w-3" /> <b>Private</b> — upload to a private bucket. Only signed, expiring URLs serve the file. {canUsePrivate ? null : <span className="text-velvet"> Atelier-only.</span>}
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-secondary/60 p-3 text-xs">
              <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} className="mt-0.5" />
              <span>
                <b>Stamp with Kenroe monogram</b> — quietly composites the K monogram in the bottom-right at 55% opacity. Great for previews and sneak peeks; turn off for final shareable assets.
              </span>
            </label>
            <button onClick={runBatch} disabled={running || !items.some((x) => x.status === "queued" || x.status === "error")} className="flex w-full items-center justify-center gap-2 rounded-full bg-velvet px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {running ? "Processing…" : items.length > 1 ? `Convert ${items.filter((x) => x.status === "queued" || x.status === "error").length} files` : "Convert"}
            </button>
            <p className="text-[10px] text-ink/55">
              Converted files upload to your private CDN (a global edge network) and are saved to <b>My uploads</b>.
            </p>
          </aside>
        </div>
        )}
      </section>
      <SiteFooter />
    </div>
  );
}

function StorageMeter({ storage }: { storage: { used: number; cap: number | null; owner: boolean } | null }) {
  if (!storage) return null;
  if (storage.owner || storage.cap === null) {
    return <div className="rounded-full bg-secondary px-3 py-1 text-[11px] text-ink/70">{fmtBytes(storage.used)} used · unlimited</div>;
  }
  const pct = Math.min(100, Math.round((storage.used / storage.cap) * 100));
  const over = storage.used >= storage.cap;
  return (
    <div className="min-w-[240px] rounded-2xl bg-secondary px-4 py-2.5">
      <div className="mb-1 flex items-center justify-between text-[11px] text-ink/70">
        <span>{fmtBytes(storage.used)} of {fmtBytes(storage.cap)}</span>
        <span className={over ? "text-red-600" : "text-ink/55"}>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-paper">
        <div className={`h-full ${over ? "bg-red-500" : "bg-velvet"}`} style={{ width: `${pct}%` }} />
      </div>
      {over && (
        <div className="mt-1.5 text-[10px] text-red-600">
          Cap reached. <Link to="/pricing" className="underline">Upgrade for more storage</Link>.
        </div>
      )}
    </div>
  );
}

type Upload = {
  id: string; public_url: string; object_path: string; bucket: string;
  original_filename: string | null; content_type: string | null;
  size_bytes: number | null; width: number | null; height: number | null;
  source: string; created_at: string;
  folder: string; tags: string[]; alt_text: string | null;
  visibility: string; responsive_group_id: string | null; deleted_at: string | null;
};

function UploadsPanel({ onChange }: { onChange?: () => void }) {
  const list = useServerFn(listMyUploads);
  const listFolders = useServerFn(listMyFolders);
  const del = useServerFn(deleteMyUpload);
  const updateMeta = useServerFn(updateMyUpload);
  const signed = useServerFn(getSignedMediaUrl);
  const [items, setItems] = useState<Upload[] | null>(null);
  const [folders, setFolders] = useState<{ name: string; count: number }[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingAlt, setEditingAlt] = useState<string | null>(null);

  async function reload() {
    const r = await list({ data: { limit: 200, folder: folder ?? undefined, tag: tagFilter ?? undefined } } as any) as any;
    setItems(r.items ?? []);
    const f = await listFolders({} as any) as any;
    setFolders(f.folders ?? []);
  }

  useEffect(() => { reload().catch(() => setItems([])); /* eslint-disable-next-line */ }, [folder, tagFilter]);

  async function trash(id: string) {
    await del({ data: { id } } as any);
    toast.success("Moved to Trash. Restore from the Trash tab.");
    setItems((p) => (p ?? []).filter((x) => x.id !== id));
    onChange?.();
    reload();
  }

  async function moveFolder(id: string, target: string) {
    await updateMeta({ data: { id, folder: target } } as any);
    toast.success(`Moved to ${target}.`);
    reload();
  }

  async function saveAlt(id: string, alt: string) {
    await updateMeta({ data: { id, altText: alt || null } } as any);
    setItems((p) => (p ?? []).map((x) => (x.id === id ? { ...x, alt_text: alt } : x)));
    setEditingAlt(null);
  }

  async function openSigned(id: string) {
    const r = await signed({ data: { id } } as any) as any;
    window.open(r.url, "_blank", "noopener,noreferrer");
  }

  const myEvents = useEvents();
  const [wallPickerFor, setWallPickerFor] = useState<string | null>(null);

  async function sendToWall(it: Upload, eventId: string) {
    setWallPickerFor(null);
    const pending = toast.loading("Sending to Photo Wall…");
    try {
      const sourceUrl =
        it.visibility === "private"
          ? ((await signed({ data: { id: it.id } } as any) as any).url as string)
          : it.public_url;
      const res = await fetch(sourceUrl);
      if (!res.ok) throw new Error(`Could not fetch image (${res.status})`);
      const blob = await res.blob();
      const ext = ((blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg")).split("+")[0];
      const path = `${eventId}/library-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("event-photos")
        .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
      if (error) throw error;
      toast.dismiss(pending);
      toast.success("Added to the event's Photo Wall.");
    } catch (e: any) {
      toast.dismiss(pending);
      toast.error(e?.message ?? "Couldn't add to wall.");
    }
  }

  const allTags = useMemo(() => {
    const t = new Set<string>();
    (items ?? []).forEach((i) => (i.tags ?? []).forEach((x) => t.add(x)));
    return Array.from(t).sort();
  }, [items]);

  const filtered = (items ?? []).filter((x) => {
    if (!query.trim()) return true;
    return (x.original_filename ?? "").toLowerCase().includes(query.toLowerCase()) ||
      (x.tags ?? []).some((t) => t.toLowerCase().includes(query.toLowerCase()));
  });

  // Collapse responsive groups: only show the largest (max width)
  const groupSeen = new Set<string>();
  const display: Upload[] = [];
  for (const it of filtered) {
    if (it.responsive_group_id) {
      if (groupSeen.has(it.responsive_group_id)) continue;
      groupSeen.add(it.responsive_group_id);
    }
    display.push(it);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
      <aside className="rounded-2xl border border-ink/10 bg-paper p-3 text-sm">
        <div className="mb-2 px-1 text-[10px] font-medium uppercase tracking-widest text-ink/50">Folders</div>
        <button onClick={() => setFolder(null)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${folder === null ? "bg-secondary" : "hover:bg-secondary/60"}`}>
          <Folder className="h-3.5 w-3.5" /> All
        </button>
        {folders.map((f) => (
          <button key={f.name} onClick={() => setFolder(f.name)} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${folder === f.name ? "bg-secondary" : "hover:bg-secondary/60"}`}>
            <span className="inline-flex items-center gap-2 truncate"><Folder className="h-3.5 w-3.5" /> {f.name}</span>
            <span className="text-[10px] text-ink/50">{f.count}</span>
          </button>
        ))}
        <button
          onClick={async () => {
            const name = (await promptDialog({ title: "New folder name", confirmLabel: "Create" }))?.trim();
            if (name) setFolder(name);
          }}
          className="mt-2 w-full rounded-lg border border-dashed border-ink/20 px-2 py-1.5 text-xs text-ink/55 hover:bg-secondary/60"
        >
          + New folder
        </button>
        {allTags.length > 0 && (
          <>
            <div className="mt-4 mb-2 px-1 text-[10px] font-medium uppercase tracking-widest text-ink/50">Tags</div>
            <div className="flex flex-wrap gap-1 px-1">
              <button onClick={() => setTagFilter(null)} className={`rounded-full px-2 py-0.5 text-[10px] ${tagFilter === null ? "bg-ink text-paper" : "bg-secondary"}`}>any</button>
              {allTags.map((t) => (
                <button key={t} onClick={() => setTagFilter(t)} className={`rounded-full px-2 py-0.5 text-[10px] ${tagFilter === t ? "bg-ink text-paper" : "bg-secondary"}`}>#{t}</button>
              ))}
            </div>
          </>
        )}
      </aside>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search filename or tag…" className="flex-1 rounded-full border border-ink/15 bg-paper px-3 py-1.5 text-xs" />
        </div>
        {items === null ? (
          <div className="grid place-items-center py-16 text-sm text-ink/55"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : display.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-ink/15 py-16 text-center text-sm text-ink/55">
            <div><FolderOpen className="mx-auto mb-2 h-6 w-6 text-ink/30" />No images here yet.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {display.map((it) => (
              <div key={it.id} className="group relative overflow-hidden rounded-xl ring-1 ring-ink/10">
                <div className="block aspect-square overflow-hidden bg-secondary">
                  {it.visibility === "private" ? (
                    <button onClick={() => openSigned(it.id)} className="grid h-full w-full place-items-center bg-secondary/70 text-ink/60">
                      <Lock className="h-6 w-6" />
                      <span className="mt-1 text-[10px]">Private · click for signed URL</span>
                    </button>
                  ) : (
                    <a href={it.public_url} target="_blank" rel="noreferrer">
                      <img src={it.public_url} alt={it.alt_text ?? it.original_filename ?? ""} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                    </a>
                  )}
                </div>
                <div className="absolute right-1 top-1 flex gap-1">
                  {it.responsive_group_id && <span className="rounded-full bg-velvet/90 px-1.5 py-0.5 text-[9px] font-medium text-white">SET</span>}
                  {it.visibility === "private" && <span className="rounded-full bg-ink/80 px-1.5 py-0.5 text-[9px] font-medium text-white"><Lock className="inline h-2 w-2" /></span>}
                </div>
                <div className="space-y-1 p-2 text-[10px]">
                  <div className="truncate font-medium" title={it.original_filename ?? ""}>{it.original_filename ?? "image"}</div>
                  {editingAlt === it.id ? (
                    <input
                      autoFocus
                      defaultValue={it.alt_text ?? ""}
                      onBlur={(e) => saveAlt(it.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingAlt(null); }}
                      placeholder="Alt text"
                      className="w-full rounded border border-ink/20 px-1.5 py-0.5 text-[10px]"
                    />
                  ) : (
                    <button onClick={() => setEditingAlt(it.id)} className="block w-full truncate text-left text-ink/55 hover:text-ink" title="Click to edit alt text">
                      Alt: {it.alt_text ?? <i className="text-ink/40">add description</i>}
                    </button>
                  )}
                  <div className="flex items-center justify-between gap-1 pt-1">
                    <span className="text-ink/45">{it.width && it.height ? `${it.width}×${it.height}` : "—"} · {it.size_bytes ? fmtBytes(it.size_bytes) : ""}</span>
                    <div className="flex gap-0.5">
                      <button onClick={async () => { const url = it.visibility === "private" ? ((await signed({ data: { id: it.id } } as any) as any).url) : it.public_url; navigator.clipboard.writeText(url); toast.success("URL copied."); }} title="Copy URL" className="rounded-full p-1 hover:bg-secondary"><Link2 className="h-3 w-3" /></button>
                      <button onClick={async () => { const url = it.visibility === "private" ? ((await signed({ data: { id: it.id } } as any) as any).url) : it.public_url; navigator.clipboard.writeText(`<img src="${url}" alt="${(it.alt_text ?? "").replace(/"/g, "&quot;")}" />`); toast.success("HTML copied."); }} title="Copy <img> HTML" className="rounded-full p-1 hover:bg-secondary"><Code2 className="h-3 w-3" /></button>
                      <button
                        onClick={async () => {
                          const name = (await promptDialog({
                            title: "Move to folder",
                            defaultValue: it.folder || "Uncluttered",
                            confirmLabel: "Move",
                          }))?.trim();
                          if (name) moveFolder(it.id, name);
                        }}
                        title="Move folder"
                        className="rounded-full p-1 hover:bg-secondary"
                      ><Folder className="h-3 w-3" /></button>
                      <button
                        onClick={async () => {
                          const current = (it.tags ?? []).join(", ");
                          const next = await promptDialog({
                            title: "Tags (comma-separated)",
                            defaultValue: current,
                            confirmLabel: "Save",
                          });
                          if (next === null) return;
                          updateMeta({ data: { id: it.id, tags: next.split(",").map((s) => s.trim()).filter(Boolean) } } as any).then(reload);
                        }}
                        title="Tags"
                        className="rounded-full p-1 hover:bg-secondary"
                      ><Tag className="h-3 w-3" /></button>
                      {it.visibility === "public" && (
                        <a href={it.public_url} download className="rounded-full p-1 hover:bg-secondary" title="Download"><Download className="h-3 w-3" /></a>
                      )}
                      <div className="relative">
                        <button
                          onClick={() => setWallPickerFor((cur) => (cur === it.id ? null : it.id))}
                          title="Send to an event's Photo Wall"
                          className="rounded-full p-1 hover:bg-secondary"
                        >
                          <ImageIcon className="h-3 w-3" />
                        </button>
                        {wallPickerFor === it.id && (
                          <div className="absolute right-0 top-7 z-20 w-56 rounded-xl border border-ink/10 bg-paper p-2 text-left shadow-lg">
                            <div className="px-1 pb-1 text-[10px] uppercase tracking-widest text-ink/50">Add to Photo Wall</div>
                            {myEvents.length === 0 ? (
                              <div className="px-1 py-2 text-[11px] text-ink/55">No events yet. Create one first.</div>
                            ) : (
                              <div className="max-h-48 overflow-y-auto">
                                {myEvents.map((e) => (
                                  <button
                                    key={e.id}
                                    onClick={() => sendToWall(it, e.id)}
                                    className="block w-full truncate rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-secondary"
                                    title={e.title}
                                  >
                                    {e.title || "Untitled event"}
                                  </button>
                                ))}
                              </div>
                            )}
                            <button onClick={() => setWallPickerFor(null)} className="mt-1 w-full rounded-md px-2 py-1 text-[10px] text-ink/50 hover:bg-secondary">Cancel</button>
                          </div>
                        )}
                      </div>
                      <button onClick={() => trash(it.id)} title="Move to Trash" className="rounded-full p-1 hover:bg-red-500/10 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TrashPanel({ onChange }: { onChange?: () => void }) {
  const list = useServerFn(listMyUploads);
  const del = useServerFn(deleteMyUpload);
  const restore = useServerFn(restoreMyUpload);
  const [items, setItems] = useState<Upload[] | null>(null);

  async function reload() {
    const r = await list({ data: { trashOnly: true, limit: 200 } } as any) as any;
    setItems(r.items ?? []);
  }
  useEffect(() => { reload().catch(() => setItems([])); }, []);

  async function purge(id: string) {
    if (!(await confirmDialog({ title: "Permanently delete? Anything still using its URL will break." }))) return;
    await del({ data: { id, permanent: true } } as any);
    setItems((p) => (p ?? []).filter((x) => x.id !== id));
    toast.success("Permanently deleted.");
    onChange?.();
  }
  async function undo(id: string) {
    await restore({ data: { id } } as any);
    setItems((p) => (p ?? []).filter((x) => x.id !== id));
    toast.success("Restored to My uploads.");
    onChange?.();
  }

  if (items === null) return <div className="grid place-items-center py-16 text-sm text-ink/55"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (items.length === 0) return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-ink/15 py-16 text-center text-sm text-ink/55">
      <div><Trash2 className="mx-auto mb-2 h-6 w-6 text-ink/30" />Trash is empty.</div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map((it) => (
        <div key={it.id} className="group relative overflow-hidden rounded-xl ring-1 ring-ink/10 opacity-80">
          <div className="block aspect-square overflow-hidden bg-secondary">
            {it.visibility === "private" ? (
              <div className="grid h-full w-full place-items-center text-ink/40"><Lock className="h-6 w-6" /></div>
            ) : (
              <img src={it.public_url} alt={it.original_filename ?? ""} className="h-full w-full object-cover" loading="lazy" />
            )}
          </div>
          <div className="space-y-1 p-2 text-[10px]">
            <div className="truncate font-medium" title={it.original_filename ?? ""}>{it.original_filename ?? "image"}</div>
            <div className="flex justify-end gap-1">
              <button onClick={() => undo(it.id)} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 hover:bg-ink/10"><RotateCcw className="h-3 w-3" /> Restore</button>
              <button onClick={() => purge(it.id)} className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-red-600 hover:bg-red-500/20"><Trash2 className="h-3 w-3" /> Delete</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
