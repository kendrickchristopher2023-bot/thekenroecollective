import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TEMPLATES, getTemplate, defaultContentFor, pagesOf, type DesignTemplate, type TemplateField } from "@/lib/design-templates";
import { DesignSvg, exportSvgElementsToPdf, exportSvgElementsToPrintPdf, exportSvgElementToPng, getFreeformItems, freeformSafeArea, freeformDefaultInk, type FreeformItem } from "@/lib/design-render";
import {
  listDesigns, saveDesign, deleteDesign, createDesignShare, revokeDesignShare, aiRewriteCopy,
  listBrandKits, saveBrandKit, deleteBrandKit, sendDesignToRfq,
  type DesignAssetRow, type BrandKitRow,
} from "@/lib/design-studio.functions";
import { useFreeformDrag } from "@/lib/use-freeform-drag";
import { CourseIconPicker } from "@/components/course-icon-picker";
import { confirmDialog } from "@/lib/confirm-dialog";
import { useUrlParam, useSetUrlParams } from "@/lib/use-url-view-state";

type Props = { eventId?: string };

const EMOJI_PICKS = ["✨","🌿","🍷","🥂","🌸","🤍","🔥","🌙","⭐","🍰","🥩","🍅","🦪","🍯","🌹","🎉","💛","🕯️","🍇","🥖"];
const RFQ_CATEGORIES = ["Venue","Caterer","Photographer","Videographer","Musician/Band","DJ","Florist","Baker","Bartender","Planner","Rentals","Officiant","Transportation","Hair & Makeup","Other"];

const DRAFT_KEY = "kc:studio-draft:v2";

type StudioDraft = {
  templateId: string;
  title: string;
  content: Record<string, any>;
  currentId: string | null;
};

/** Last in-progress design, so a refresh doesn't throw away unsaved work. */
function readDraft(): StudioDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as StudioDraft;
    if (!d || typeof d.templateId !== "string" || !getTemplate(d.templateId)) return null;
    return d;
  } catch {
    return null;
  }
}

export function DesignStudio({ eventId }: Props) {
  // Template and page live in the URL; unsaved copy lives in a local draft.
  // Between them a hard refresh lands back on the same design, same page.
  const urlTemplate = useUrlParam("t");
  const urlPage = useUrlParam("pg");
  const setUrl = useSetUrlParams();
  const draft = useMemo(() => (typeof window === "undefined" ? null : readDraft()), []);

  const [templateId, setTemplateId] = useState<string>(
    () => (urlTemplate && getTemplate(urlTemplate) ? urlTemplate : draft?.templateId) ?? TEMPLATES[0].id,
  );
  const template = useMemo(() => getTemplate(templateId)!, [templateId]);
  const pages = useMemo(() => pagesOf(template), [template]);
  const [activePage, setActivePage] = useState<string>(() =>
    urlPage && pages.includes(urlPage) ? urlPage : pages[0],
  );
  const [content, setContent] = useState<Record<string, any>>(() => {
    if (draft && draft.templateId === templateId) return draft.content ?? {};
    return defaultContentFor(getTemplate(templateId) ?? TEMPLATES[0]);
  });
  const [title, setTitle] = useState(draft?.title ?? "Untitled design");
  const [designs, setDesigns] = useState<DesignAssetRow[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(draft?.currentId ?? null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [kits, setKits] = useState<BrandKitRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [rfqOpen, setRfqOpen] = useState(false);
  const [selectedFf, setSelectedFf] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const offscreenRef = useRef<HTMLDivElement>(null);

  const listFn = useServerFn(listDesigns);
  const saveFn = useServerFn(saveDesign);
  const delFn = useServerFn(deleteDesign);
  const shareFn = useServerFn(createDesignShare);
  const unshareFn = useServerFn(revokeDesignShare);
  const rewriteFn = useServerFn(aiRewriteCopy);
  const listKitsFn = useServerFn(listBrandKits);
  const saveKitFn = useServerFn(saveBrandKit);
  const delKitFn = useServerFn(deleteBrandKit);
  const sendRfqFn = useServerFn(sendDesignToRfq);

  useEffect(() => {
    listFn({ data: { eventId } }).then(({ designs }) => setDesigns(designs)).catch(() => {});
    listKitsFn().then(({ kits }) => setKits(kits)).catch(() => {});
  }, [eventId, listFn, listKitsFn]);

  // Reset active page when template changes, unless the current page still exists.
  useEffect(() => {
    setActivePage((prev) => (pages.includes(prev) ? prev : pages[0]));
  }, [templateId, pages]);

  // Mirror template + page into the URL so a refresh restores this view.
  useEffect(() => {
    setUrl({ t: templateId, pg: activePage });
  }, [templateId, activePage, setUrl]);

  // Keep the in-progress design in a local draft for refresh recovery.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ templateId, title, content, currentId } satisfies StudioDraft),
      );
    } catch {
      /* storage full or blocked — autosave to cloud still applies */
    }
  }, [templateId, title, content, currentId]);

  function pickTemplate(id: string) {
    const t = getTemplate(id);
    if (!t) return;
    setTemplateId(id);
    setContent(defaultContentFor(t));
    setCurrentId(null);
    setShareToken(null);
  }

  function loadDesign(d: DesignAssetRow) {
    setTemplateId(d.template_id);
    setContent(d.content ?? {});
    setTitle(d.title);
    setCurrentId(d.id);
    setShareToken(d.share_token);
  }

  async function save() {
    setBusy(true);
    try {
      const { design } = await saveFn({ data: {
        id: currentId ?? undefined, eventId, kind: template.kind as any,
        templateId: template.id, title, content,
      }});
      setCurrentId(design.id);
      setShareToken(design.share_token);
      setDesigns((prev) => [design, ...prev.filter((d) => d.id !== design.id)]);
      toast.success("Saved");
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!(await confirmDialog({ title: "Delete this design?" }))) return;
    await delFn({ data: { id } });
    setDesigns((prev) => prev.filter((d) => d.id !== id));
    if (currentId === id) { setCurrentId(null); setShareToken(null); }
    toast.success("Deleted");
  }

  async function toggleShare() {
    if (!currentId) { toast.error("Save the design first"); return; }
    if (shareToken) { await unshareFn({ data: { id: currentId } }); setShareToken(null); toast.success("Share link revoked"); }
    else { const { token } = await shareFn({ data: { id: currentId } }); setShareToken(token); toast.success("Share link created"); }
  }

  function copyShareUrl() {
    if (!shareToken) return;
    const url = `${window.location.origin}/d/${shareToken}`;
    navigator.clipboard?.writeText(url); toast.success("Copied to clipboard");
  }

  // Render every page into the offscreen container and return its SVG elements.
  // Used by all PDF exports so multi-page templates emit one PDF page per design page.
  function getAllPageSvgs(): SVGSVGElement[] {
    const root = offscreenRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll("svg")) as SVGSVGElement[];
  }

  async function exportPdf(printReady = false) {
    const svgs = getAllPageSvgs();
    if (svgs.length === 0) return;
    setBusy(true);
    try {
      if (printReady) await exportSvgElementsToPrintPdf(svgs, `${title || "design"}-print`);
      else await exportSvgElementsToPdf(svgs, title || "design");
      toast.success(printReady ? "Print-ready PDF (bleed + crop marks)" : "PDF ready");
    } catch (e: any) { toast.error(e?.message ?? "Export failed"); }
    finally { setBusy(false); }
  }

  async function exportPng() {
    // Read from the offscreen render, not the visible preview: the preview
    // carries the selection outline and resize handle, which would otherwise
    // be baked into the exported image.
    const idx = Math.max(0, pages.indexOf(activePage));
    const svg = getAllPageSvgs()[idx] ?? (previewRef.current?.querySelector("svg") as SVGSVGElement | null);
    if (!svg) return;

    setBusy(true);
    try {
      const blob = await exportSvgElementToPng(svg, 2);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${title || "design"}-${activePage}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("PNG downloaded");
    } finally { setBusy(false); }
  }

  async function aiRewrite(key: string, current: string) {
    setBusy(true);
    try {
      const res = await rewriteFn({ data: { text: current || title, tone: "editorial", maxChars: 80 } });
      if ("error" in res) { toast.error(res.error); return; }
      setContent((c) => ({ ...c, [key]: res.text }));
      toast.success("Rewritten");
    } catch (e: any) { toast.error(e?.message ?? "AI unavailable"); }
    finally { setBusy(false); }
  }

  async function uploadImage(key: string, file: File) {
    if (file.size > 8 * 1024 * 1024) { toast.error("Image too large (8MB max)"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const path = `${user.id}/designs/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g,"_")}`;
    const { error } = await supabase.storage.from("atelier-shared").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("atelier-shared").getPublicUrl(path);
    setContent((c) => ({ ...c, [key]: data.publicUrl }));
    toast.success("Image added");
  }

  // ── Brand Kit helpers ─────────────────────────────────────
  function applyKit(k: BrandKitRow) {
    setContent((c) => ({
      ...c,
      palette: { ...k.palette },
      fontFamily: { display: k.font_display, body: k.font_body },
      logo_url: k.logo_url ?? c.logo_url ?? "",
    }));
    toast.success(`Applied ${k.name}`);
  }

  async function saveCurrentAsKit() {
    const name = prompt("Name this brand kit:", "My brand");
    if (!name) return;
    const p = content.palette ?? template.palette;
    const f = content.fontFamily ?? template.fontFamily;
    try {
      const { kit } = await saveKitFn({ data: {
        name, palette: p, logo_url: content.logo_url || null,
        font_display: f.display, font_body: f.body, is_default: kits.length === 0,
      }});
      setKits((prev) => [kit, ...prev.filter((k) => k.id !== kit.id)]);
      toast.success("Brand kit saved");
    } catch (e: any) { toast.error(e?.message ?? "Could not save"); }
  }

  async function removeKit(id: string) {
    if (!(await confirmDialog({ title: "Delete this brand kit?" }))) return;
    await delKitFn({ data: { id } });
    setKits((prev) => prev.filter((k) => k.id !== id));
  }

  async function uploadKitLogo(kit: BrandKitRow, file: File) {
    if (file.size > 4 * 1024 * 1024) { toast.error("Logo too large (4MB max)"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const path = `${user.id}/brand-kits/${kit.id}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g,"_")}`;
    const { error } = await supabase.storage.from("atelier-shared").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("atelier-shared").getPublicUrl(path);
    const { kit: updated } = await saveKitFn({ data: {
      id: kit.id, name: kit.name, palette: kit.palette, logo_url: data.publicUrl,
      font_display: kit.font_display, font_body: kit.font_body, is_default: kit.is_default,
    }});
    setKits((prev) => prev.map((k) => k.id === updated.id ? updated : k));
    toast.success("Logo uploaded");
  }

  // ── RFQ handoff ───────────────────────────────────────────
  async function sendRfq(form: { subject: string; category: string; message: string; location?: string; vendor_cap?: number }) {
    if (!currentId) { toast.error("Save the design first"); return; }
    try {
      const { rfqId, invitedCount } = await sendRfqFn({ data: {
        designId: currentId, origin: window.location.origin,
        subject: form.subject, category: form.category, message: form.message,
        location: form.location,
        vendor_cap: form.vendor_cap,
      }});
      if (invitedCount > 0) {
        toast.success(`Sent to ${invitedCount} matching vendor${invitedCount === 1 ? "" : "s"} — you'll see bids in your RFQ inbox.`);
      } else {
        toast.warning("No verified vendors match yet — your RFQ is saved and you can also share the link directly.", { duration: 7000 });
      }
      setRfqOpen(false);
      window.history.pushState({}, "", `/rfq/${rfqId}`);
    } catch (e: any) { toast.error(e?.message ?? "Could not create RFQ"); }
  }

  // ── Free-form layer helpers ──────────────────────────────
  const freeform = getFreeformItems(content, activePage);
  function setFreeform(next: FreeformItem[]) {
    setContent((c) => {
      const ff = (c.freeform && !Array.isArray(c.freeform)) ? { ...c.freeform } : {};
      ff[activePage] = next;
      return { ...c, freeform: ff };
    });
  }
  function addFf(it: Omit<FreeformItem, "id">) {
    const id = `ff_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
    // Place inside the template's safe area (on apparel that's the shirt's print
    // area, not the empty canvas around it) and stagger each new item so it
    // lands visibly separate from the previous one instead of stacking.
    const area = freeformSafeArea(template);
    const step = 28;
    const offset = (freeform.length % 6) * step;
    const w = Math.min(it.w, area.w);
    const h = Math.min(it.h, area.h);
    const x = Math.min(area.x + offset, area.x + area.w - w);
    const y = Math.min(area.y + offset, area.y + area.h - h);
    const placed: Omit<FreeformItem, "id"> = { ...it, x: Math.round(x), y: Math.round(y), w, h };
    // Auto-contrast ink so new text is never invisible against a dark garment
    // or background.
    if ((placed.type === "text" || placed.type === "emoji") && !placed.color) {
      placed.color = freeformDefaultInk(template, content);
    }
    setFreeform([...freeform, { id, ...placed }]);
    setSelectedFf(id);
  }

  function updateFf(id: string, patch: Partial<FreeformItem>) {
    setFreeform(freeform.map((i) => i.id === id ? { ...i, ...patch } : i));
  }
  function removeFf(id: string) {
    setFreeform(freeform.filter((i) => i.id !== id));
    if (selectedFf === id) setSelectedFf(null);
  }

  // Drag + resize (coordinates converted to the SVG viewBox). See
  // use-freeform-drag.ts: drag state must not live in an effect keyed on the
  // items array, or every move resets the gesture.
  useFreeformDrag({ hostRef: previewRef, items: freeform, onUpdate: updateFf, onSelect: setSelectedFf });

  // Keyboard nudging for the selected layer: arrows move 1px, Shift+arrows 10px.
  // Ignored while typing in a field so text editing is never hijacked.
  useEffect(() => {
    if (!selectedFf) return;
    const id: string = selectedFf;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) return;
      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else return;
      const item = freeform.find((i) => i.id === id);
      if (!item) return;
      e.preventDefault();
      updateFf(id, {
        x: Math.round(Math.max(0, Math.min(template.width - item.w, item.x + dx))),
        y: Math.round(Math.max(0, Math.min(template.height - item.h, item.y + dy))),
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedFf, freeform, template.width, template.height]);

  async function uploadFreeformImage(file: File) {
    if (file.size > 8 * 1024 * 1024) { toast.error("Image too large (8MB max)"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const path = `${user.id}/designs/ff-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g,"_")}`;
    const { error } = await supabase.storage.from("atelier-shared").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("atelier-shared").getPublicUrl(path);
    addFf({ type: "image", x: 80, y: 80, w: 200, h: 200, src: data.publicUrl });
  }

  async function uploadBackgroundImage(file: File) {
    if (file.size > 8 * 1024 * 1024) { toast.error("Image too large (8MB max)"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const path = `${user.id}/designs/bg-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g,"_")}`;
    const { error } = await supabase.storage.from("atelier-shared").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("atelier-shared").getPublicUrl(path);
    setContent((c) => ({ ...c, background: { fit: "cover", opacity: 1, ...(c.background ?? {}), image: data.publicUrl } }));
    toast.success("Background added");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr_280px]">
      {/* Left: templates + saved designs + brand kits */}
      <aside className="space-y-4">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/60">Templates</h3>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => pickTemplate(t.id)}
                aria-pressed={templateId === t.id}
                className={`rounded-lg border p-2 text-left text-xs transition ${templateId === t.id ? "border-velvet bg-velvet/5" : "border-ink/10 hover:border-ink/30"}`}>
                {/* Live thumbnail: the real renderer on default content, so the
                    picker shows what the template actually looks like. */}
                <div
                  aria-hidden
                  className="mb-2 overflow-hidden rounded border border-ink/10 bg-white"
                  style={{ aspectRatio: `${t.width} / ${t.height}` }}
                >
                  <TemplateThumb template={t} />
                </div>
                <div className="font-medium">{t.name}</div>
                <div className="text-[10px] text-ink/50 line-clamp-2">{t.blurb}</div>
                {t.pages && t.pages.length > 1 ? (
                  <div className="mt-1 inline-block rounded bg-ink/10 px-1 text-[9px]">{t.pages.length} pages</div>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <BrandKitPanel
          kits={kits} onApply={applyKit} onSaveCurrent={saveCurrentAsKit}
          onDelete={removeKit} onUploadLogo={uploadKitLogo}
        />

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/60">Your designs</h3>
          {designs.length === 0 ? <p className="text-xs text-ink/40">No saved designs yet.</p> : (
            <ul className="space-y-1 text-xs">
              {designs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded border border-ink/10 px-2 py-1">
                  <button className="flex-1 truncate text-left hover:underline" onClick={() => loadDesign(d)}>{d.title}</button>
                  <button onClick={() => remove(d.id)} className="text-ink/40 hover:text-red-600" aria-label="Delete">✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Center: preview */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="flex-1 min-w-[200px] rounded border border-ink/10 px-3 py-2 text-sm" placeholder="Design title" />
          <button disabled={busy} onClick={save} className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">Save</button>
          <button disabled={busy} onClick={() => exportPdf(false)} className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50">Export PDF</button>
          <button disabled={busy} onClick={() => exportPdf(true)} className="rounded-full border border-ink/30 px-4 py-2 text-xs font-medium hover:bg-ink/5 disabled:opacity-50" title="Adds 0.125 inch bleed + crop marks">Print-ready PDF</button>
          <button disabled={busy} onClick={exportPng} className="rounded-full border border-ink/20 px-4 py-2 text-xs font-medium hover:bg-ink/5 disabled:opacity-50">PNG</button>
          <button disabled={busy} onClick={toggleShare} className="rounded-full border border-ink/20 px-4 py-2 text-xs font-medium hover:bg-ink/5 disabled:opacity-50">{shareToken ? "Revoke link" : "Share link"}</button>
          {shareToken && <button onClick={copyShareUrl} className="text-xs text-velvet underline">Copy</button>}
          <button disabled={busy} onClick={() => setRfqOpen(true)} className="rounded-full border border-velvet/40 px-4 py-2 text-xs font-medium text-velvet hover:bg-velvet/5 disabled:opacity-50">Send to vendor (RFQ)</button>
        </div>

        {pages.length > 1 && (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-ink/50">Page:</span>
            {pages.map((p) => (
              <button key={p} onClick={() => setActivePage(p)}
                className={`rounded-full border px-3 py-1 capitalize ${activePage === p ? "border-velvet bg-velvet/5 text-velvet" : "border-ink/15 text-ink/70 hover:bg-ink/5"}`}>
                {p}
              </button>
            ))}
          </div>
        )}

        <div ref={previewRef} className="rounded-lg border border-ink/10 bg-card p-4 shadow-sm">
          <div className="mx-auto" style={{ maxWidth: Math.min(template.width, 600) }}>
            <DesignSvg template={template} content={content} page={activePage} selectedFreeformId={selectedFf} />
          </div>
          {freeform.length > 0 && (
            <p className="mt-2 text-center text-[10px] text-ink/40">Click any free-form element to select · drag to move · drag the blue handle to resize</p>
          )}
        </div>

        {/* Offscreen multi-page render — source for PDF exports.
            Kept invisible but rendered so we can read every page's SVG. */}
        <div ref={offscreenRef} aria-hidden style={{ position: "absolute", left: -99999, top: 0, width: template.width }}>
          {pages.map((p) => (
            <div key={p} style={{ width: template.width }}>
              <DesignSvg template={template} content={content} page={p} />
            </div>
          ))}
        </div>
      </section>

      {/* Right: field editor + free-form layer */}
      <aside className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/60">Edit</h3>
        {/* Apparel renderers draw with shirt_color / ink_color, not the page
            palette, so the palette swatches are hidden there rather than shown
            doing nothing. */}
        {template.kind !== "apparel" && (
          <PaletteEditor content={content} setContent={setContent} template={template} />
        )}
        <TypographyEditor content={content} setContent={setContent} template={template} />
        <BackgroundEditor content={content} setContent={setContent} onUpload={uploadBackgroundImage} template={template} />

        <FreeformPanel
          items={freeform} selectedId={selectedFf} setSelected={setSelectedFf}
          onAdd={addFf} onUpdate={updateFf} onRemove={removeFf} onUploadImage={uploadFreeformImage}
        />
        {template.fields.map((f) => (
          <FieldEditor key={f.key} field={f} content={content} setContent={setContent}
            onRewrite={aiRewrite} onUploadImage={uploadImage} />
        ))}
      </aside>

      {rfqOpen && <RfqDialog
        defaultSubject={title} onClose={() => setRfqOpen(false)} onSubmit={sendRfq}
      />}
    </div>
  );
}

/** Static preview of a template on its default content, used in the picker. */
function TemplateThumb({ template }: { template: DesignTemplate }) {
  const content = useMemo(() => defaultContentFor(template), [template]);
  return <DesignSvg template={template} content={content} page={pagesOf(template)[0]} />;
}

function FreeformPanel({ items, selectedId, setSelected, onAdd, onUpdate, onRemove, onUploadImage }: {
  items: FreeformItem[]; selectedId: string | null; setSelected: (id: string | null) => void;
  onAdd: (it: Omit<FreeformItem, "id">) => void;
  onUpdate: (id: string, patch: Partial<FreeformItem>) => void;
  onRemove: (id: string) => void;
  onUploadImage: (file: File) => Promise<void>;
}) {
  const sel = items.find((i) => i.id === selectedId) ?? null;
  const EMOJI = ["✨","🌿","🍷","🥂","🌸","🤍","🔥","🌙","⭐","🍰","🌹","💛","🕯️","🥖","🍯"];
  return (
    <div className="rounded border border-ink/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">Free-form layer</h4>
        <span className="text-[10px] text-ink/40">{items.length} on page</span>
      </div>
      <div className="grid grid-cols-2 gap-1 text-[11px]">
        {/* No hardcoded color: addFf picks an auto-contrasting ink for the
            current garment / background so new text is never invisible. */}
        <button onClick={() => onAdd({ type: "text", x: 60, y: 60, w: 240, h: 56, text: "Your text", fontSize: 32 })}

          className="rounded border border-ink/15 px-2 py-1 hover:bg-ink/5">+ Text</button>
        <button onClick={() => onAdd({ type: "emoji", x: 80, y: 80, w: 80, h: 80, text: "✨", fontSize: 64 })}
          className="rounded border border-ink/15 px-2 py-1 hover:bg-ink/5">+ Emoji</button>
        <label className="cursor-pointer rounded border border-ink/15 px-2 py-1 text-center hover:bg-ink/5">
          + Image
          <input type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(f); e.currentTarget.value = ""; }} />
        </label>
        <button onClick={() => onAdd({ type: "rect", x: 80, y: 80, w: 200, h: 120, fill: "#3B82F6", opacity: 0.85 })}
          className="rounded border border-ink/15 px-2 py-1 hover:bg-ink/5">+ Shape</button>
      </div>

      {items.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11px]">
          {items.map((i) => (
            <li key={i.id} className={`flex items-center gap-2 rounded px-2 py-1 ${selectedId === i.id ? "bg-velvet/10" : "hover:bg-ink/5"}`}>
              <button className="flex-1 truncate text-left" onClick={() => setSelected(i.id)}>
                <span className="mr-1 uppercase text-[9px] text-ink/40">{i.type}</span>
                {i.type === "image" ? "image" : (i.text ?? i.type)}
              </button>
              <button onClick={() => onRemove(i.id)} className="text-ink/40 hover:text-red-600" aria-label="Delete">✕</button>
            </li>
          ))}
        </ul>
      )}

      {sel && (
        <div className="mt-3 space-y-2 border-t border-ink/10 pt-3">
          {(sel.type === "text" || sel.type === "emoji") && (
            <>
              <input value={sel.text ?? ""} onChange={(e) => onUpdate(sel.id, { text: e.target.value })}
                className="min-h-11 w-full rounded border border-ink/10 px-2 py-1 text-sm" placeholder="Text" />
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-ink/50">Size</label>
                <input type="number" value={sel.fontSize ?? 32} min={8} max={300}
                  onChange={(e) => onUpdate(sel.id, { fontSize: Number(e.target.value) })}
                  className="min-h-11 w-16 rounded border border-ink/10 px-2 py-1 text-sm" />
                <label className="ml-auto text-[10px] text-ink/50">Color</label>
                <input type="color" value={sel.color ?? "#111111"} onChange={(e) => onUpdate(sel.id, { color: e.target.value })}
                  aria-label="Text color"
                  className="h-11 w-11 cursor-pointer rounded border border-ink/10" />
              </div>
              {sel.type === "emoji" && (
                <div className="flex flex-wrap gap-1">
                  {EMOJI.map((e) => (
                    <button key={e} onClick={() => onUpdate(sel.id, { text: e })}
                      aria-label={`Use ${e}`}
                      className={`flex min-h-11 min-w-11 items-center justify-center rounded border text-xl ${sel.text === e ? "border-velvet bg-velvet/5" : "border-ink/10 hover:bg-ink/5"}`}>{e}</button>
                  ))}
                </div>
              )}
            </>
          )}
          {sel.type === "rect" && (
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-ink/50">Fill</label>
              <input type="color" value={sel.fill ?? "#3B82F6"} onChange={(e) => onUpdate(sel.id, { fill: e.target.value })}
                aria-label="Shape fill color"
                className="h-11 w-11 cursor-pointer rounded border border-ink/10" />
              <label className="ml-auto text-[10px] text-ink/50">Opacity</label>
              <input type="range" min={0.1} max={1} step={0.05} value={sel.opacity ?? 1}
                onChange={(e) => onUpdate(sel.id, { opacity: Number(e.target.value) })} className="w-24" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-ink/50">Rotate</label>
            <input type="range" min={-180} max={180} value={sel.rotate ?? 0}
              onChange={(e) => onUpdate(sel.id, { rotate: Number(e.target.value) })} className="flex-1" />
            <span className="w-10 text-right text-[10px] text-ink/50">{sel.rotate ?? 0}°</span>
          </div>
          <div className="grid grid-cols-4 gap-1 text-[10px]">
            {(["x","y","w","h"] as const).map((k) => (
              <label key={k} className="flex flex-col">
                <span className="text-ink/40 uppercase">{k}</span>
                <input type="number" value={sel[k]} onChange={(e) => onUpdate(sel.id, { [k]: Number(e.target.value) })}
                  className="min-h-11 rounded border border-ink/10 px-2 py-1 text-sm" />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PaletteEditor({ content, setContent, template }: any) {
  const p = content.palette ?? template.palette;
  function set(k: string, v: string) { setContent((c: any) => ({ ...c, palette: { ...(c.palette ?? template.palette), [k]: v } })); }
  return (
    <div className="rounded border border-ink/10 p-3">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink/50">Palette</div>
      <div className="grid grid-cols-4 gap-2">
        {(["bg","fg","accent","muted"] as const).map((k) => (
          <label key={k} className="flex flex-col items-center gap-1 text-[10px] text-ink/60">
            <input type="color" value={p[k]} onChange={(e) => set(k, e.target.value)} aria-label={`${k} color`} className="h-11 w-11 cursor-pointer rounded border border-ink/10" />
            {k}
          </label>
        ))}
      </div>
    </div>
  );
}

const FONT_CHOICES: { label: string; family: string }[] = [
  { label: "Playfair (serif)", family: "Playfair Display, Georgia, serif" },
  { label: "Cormorant (serif)", family: "Cormorant Garamond, Georgia, serif" },
  { label: "Libre Bodoni (serif)", family: "Libre Bodoni, Georgia, serif" },
  { label: "DM Serif Display", family: "DM Serif Display, Georgia, serif" },
  { label: "Marcellus (serif)", family: "Marcellus, Georgia, serif" },
  { label: "Cinzel (serif caps)", family: "Cinzel, Georgia, serif" },
  { label: "Inter (sans)", family: "Inter, system-ui, sans-serif" },
  { label: "Geist (sans)", family: "Geist, system-ui, sans-serif" },
  { label: "Outfit (sans)", family: "Outfit, system-ui, sans-serif" },
  { label: "Great Vibes (script)", family: "Great Vibes, cursive" },
  { label: "Dancing Script", family: "Dancing Script, cursive" },
  { label: "Parisienne (script)", family: "Parisienne, cursive" },
  { label: "Allura (script)", family: "Allura, cursive" },
  { label: "Italianno (script)", family: "Italianno, cursive" },
  { label: "Pinyon Script", family: "Pinyon Script, cursive" },
  { label: "Tangerine (script)", family: "Tangerine, cursive" },
];

function TypographyEditor({ content, setContent, template }: any) {
  const f = content.fontFamily ?? template.fontFamily;
  function setFont(slot: "display" | "body", family: string) {
    setContent((c: any) => ({ ...c, fontFamily: { ...(c.fontFamily ?? template.fontFamily), [slot]: family } }));
  }
  return (
    <div className="rounded border border-ink/10 p-3 space-y-2">
      <div className="text-[11px] font-medium uppercase tracking-wider text-ink/50">Typography</div>
      <label className="block text-[10px] text-ink/60">
        Display (headings)
        <select value={f.display} onChange={(e) => setFont("display", e.target.value)}
          className="mt-1 w-full rounded border border-ink/10 px-2 py-1 text-xs" style={{ fontFamily: f.display }}>
          {FONT_CHOICES.map((c) => <option key={c.family} value={c.family} style={{ fontFamily: c.family }}>{c.label}</option>)}
        </select>
      </label>
      <label className="block text-[10px] text-ink/60">
        Body (paragraphs)
        <select value={f.body} onChange={(e) => setFont("body", e.target.value)}
          className="mt-1 w-full rounded border border-ink/10 px-2 py-1 text-xs" style={{ fontFamily: f.body }}>
          {FONT_CHOICES.map((c) => <option key={c.family} value={c.family} style={{ fontFamily: c.family }}>{c.label}</option>)}
        </select>
      </label>
      <p className="text-[10px] text-ink/40">Per-element font size lives in the free-form layer (+ Text) — drag to position, set size & color there.</p>
    </div>
  );
}

function BackgroundEditor({ content, setContent, onUpload, template }: {
  content: Record<string, any>;
  setContent: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  onUpload: (file: File) => Promise<void>;
  template: DesignTemplate;
}) {
  const bg = content.background ?? {};
  const palette = content.palette ?? {};
  // Apparel draws a garment, not a flat page, so its "background" is the shirt
  // itself. The swatch writes shirt_color there instead of the page palette,
  // which the apparel renderers ignore.
  const isApparel = template.kind === "apparel";
  function patchBg(patch: Record<string, any>) {
    setContent((c) => ({ ...c, background: { ...(c.background ?? {}), ...patch } }));
  }
  function setBgColor(v: string) {
    if (isApparel) { setContent((c) => ({ ...c, shirt_color: v })); return; }
    setContent((c) => ({ ...c, palette: { ...(c.palette ?? {}), bg: v } }));
  }
  return (
    <div className="rounded border border-ink/10 p-3 space-y-2">
      <div className="text-[11px] font-medium uppercase tracking-wider text-ink/50">
        {isApparel ? "Garment" : "Background"}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-ink/60">{isApparel ? "Shirt color" : "Color"}</label>
        <input type="color" aria-label={isApparel ? "Shirt color" : "Background color"}
          value={(isApparel ? content.shirt_color : palette.bg) ?? "#ffffff"} onChange={(e) => setBgColor(e.target.value)}
          className="h-7 w-7 cursor-pointer rounded border border-ink/10" />
        <label className="ml-auto cursor-pointer text-[10px] text-velvet hover:underline">
          {bg.image ? "Replace image" : "+ Image"}
          <input type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.currentTarget.value = ""; }} />
        </label>
        {bg.image && (
          <button onClick={() => patchBg({ image: "" })} className="text-[10px] text-ink/40 hover:text-red-600">Remove</button>
        )}
      </div>
      {isApparel && (
        <p className="text-[10px] text-ink/40">Images and patterns print on the garment only, clipped to the shirt shape.</p>
      )}

      {bg.image && (
        <>
          <div className="flex items-center gap-2 text-[10px] text-ink/60">
            <span>Fit</span>
            {(["cover","contain","tile"] as const).map((k) => (
              <button key={k} onClick={() => patchBg({ fit: k })}
                className={`rounded border px-2 py-0.5 capitalize ${bg.fit === k ? "border-velvet bg-velvet/5 text-velvet" : "border-ink/15"}`}>{k}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-ink/60">
            <span>Opacity</span>
            <input type="range" min={0.1} max={1} step={0.05} value={bg.opacity ?? 1}
              onChange={(e) => patchBg({ opacity: Number(e.target.value) })} className="flex-1" />
            <span className="w-8 text-right">{Math.round((bg.opacity ?? 1) * 100)}%</span>
          </div>
        </>
      )}
      <div className="border-t border-ink/10 pt-2 space-y-2">
        <div className="flex flex-wrap items-center gap-1 text-[10px] text-ink/60">
          <span>Pattern</span>
          {(["none","dots","grid","diagonal"] as const).map((k) => (
            <button key={k} onClick={() => patchBg({ pattern: k })}
              className={`rounded border px-2 py-0.5 capitalize ${(bg.pattern ?? "none") === k ? "border-velvet bg-velvet/5 text-velvet" : "border-ink/15"}`}>{k}</button>
          ))}
        </div>
        {bg.pattern && bg.pattern !== "none" && (
          <div className="flex items-center gap-2 text-[10px] text-ink/60">
            <label>Ink</label>
            <input type="color" value={bg.patternColor ?? "#000000"} onChange={(e) => patchBg({ patternColor: e.target.value })}
              className="h-6 w-6 cursor-pointer rounded border border-ink/10" />
            <label className="ml-2">Strength</label>
            <input type="range" min={0.02} max={0.5} step={0.02} value={bg.patternOpacity ?? 0.08}
              onChange={(e) => patchBg({ patternOpacity: Number(e.target.value) })} className="flex-1" />
          </div>
        )}
      </div>
    </div>
  );
}

function BrandKitPanel({ kits, onApply, onSaveCurrent, onDelete, onUploadLogo }: {
  kits: BrandKitRow[];
  onApply: (k: BrandKitRow) => void;
  onSaveCurrent: () => void;
  onDelete: (id: string) => void;
  onUploadLogo: (k: BrandKitRow, f: File) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/60">Brand kits</h3>
        <button onClick={onSaveCurrent} className="text-[11px] text-velvet hover:underline">+ Save current</button>
      </div>
      {kits.length === 0 ? (
        <p className="text-xs text-ink/40">Save your palette, logo, and fonts as a kit. Apply to any design with one click.</p>
      ) : (
        <ul className="space-y-2 text-xs">
          {kits.map((k) => (
            <li key={k.id} className="rounded border border-ink/10 p-2">
              <div className="flex items-center justify-between gap-2">
                <button className="min-h-11 flex-1 truncate text-left hover:underline" onClick={() => onApply(k)}>
                  {k.name}{k.is_default ? " · default" : ""}
                </button>
                <button type="button" onClick={() => onDelete(k.id)} className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-ink/40 hover:bg-secondary hover:text-red-600" aria-label="Delete brand kit" title="Delete">✕</button>
              </div>
              <div className="mt-1 flex items-center gap-1">
                {(["bg","fg","accent","muted"] as const).map((c) => (
                  <span key={c} className="h-3 w-3 rounded-sm border border-ink/10" style={{ background: (k.palette as any)[c] }} />
                ))}
                {k.logo_url ? <img src={k.logo_url} alt="" className="ml-2 h-5 w-5 rounded object-contain" /> : null}
                <label className="ml-auto cursor-pointer text-[10px] text-ink/40 hover:text-velvet">
                  {k.logo_url ? "Replace logo" : "+ Logo"}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadLogo(k, f); }} />
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RfqDialog({ defaultSubject, onClose, onSubmit }: {
  defaultSubject: string;
  onClose: () => void;
  onSubmit: (form: { subject: string; category: string; message: string; location?: string; vendor_cap?: number }) => Promise<void>;
}) {
  const [subject, setSubject] = useState(defaultSubject || "New request");
  const [category, setCategory] = useState("Caterer");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("I've attached a design that captures the vibe. Pricing and availability?");
  const [vendorCap, setVendorCap] = useState(10);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-5 text-card-foreground shadow-xl">
        <h2 className="mb-3 text-base font-semibold">Send this design as an RFQ</h2>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink/50">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded border border-ink/15 px-2 py-1.5" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink/50">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded border border-ink/15 px-2 py-1.5">
              {RFQ_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink/50">Location (optional)</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1 w-full rounded border border-ink/15 px-2 py-1.5" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink/50">Message</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="mt-1 w-full rounded border border-ink/15 px-2 py-1.5" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-ink/50">
              Send to up to {vendorCap} vendor{vendorCap === 1 ? "" : "s"}
            </span>
            <input
              type="range" min={1} max={25} value={vendorCap}
              onChange={(e) => setVendorCap(Number(e.target.value))}
              className="mt-1 w-full"
            />
            <span className="text-[10px] text-ink/50">Higher = more bids. Lower = more curated. Default 10.</span>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-ink/20 px-4 py-2 text-xs hover:bg-ink/5">Cancel</button>
          <button disabled={busy}
            onClick={async () => { setBusy(true); try { await onSubmit({ subject, category, message, location: location || undefined, vendor_cap: vendorCap }); } finally { setBusy(false); } }}
            className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white disabled:opacity-50">
            {busy ? "Sending…" : "Create RFQ"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldEditor({ field, content, setContent, onRewrite, onUploadImage }: {
  field: TemplateField; content: Record<string, any>;
  setContent: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  onRewrite: (k: string, current: string) => Promise<void>;
  onUploadImage: (k: string, file: File) => Promise<void>;
}) {
  const val = content[field.key];
  function set(v: any) { setContent((c) => ({ ...c, [field.key]: v })); }
  if (field.type === "text" || field.type === "longtext") {
    const Tag: any = field.type === "longtext" ? "textarea" : "input";
    return (
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[11px] font-medium uppercase tracking-wider text-ink/50">{field.label}</label>
          <button onClick={() => onRewrite(field.key, String(val ?? ""))} className="text-[10px] text-velvet hover:underline">AI rewrite</button>
        </div>
        <Tag value={val ?? ""} onChange={(e: any) => set(e.target.value)} maxLength={field.maxLength}
          rows={field.type === "longtext" ? 4 : undefined}
          className="w-full rounded border border-ink/10 px-2 py-1.5 text-sm" />
      </div>
    );
  }
  if (field.type === "color") {
    return (
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-ink/50">{field.label}</label>
        <input type="color" value={val || "#000000"} onChange={(e) => set(e.target.value)} className="h-9 w-full cursor-pointer rounded border border-ink/10" />
      </div>
    );
  }
  if (field.type === "emoji") {
    return (
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-ink/50">{field.label}</label>
        <div className="flex flex-wrap gap-1">
          {EMOJI_PICKS.map((e) => (
            <button key={e} onClick={() => set(e)} className={`rounded border px-2 py-1 text-lg ${val === e ? "border-velvet bg-velvet/5" : "border-ink/10 hover:bg-ink/5"}`}>{e}</button>
          ))}
        </div>
      </div>
    );
  }
  if (field.type === "image") {
    return (
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-ink/50">{field.label}</label>
        {val ? <img src={val} alt="" className="mb-2 h-24 w-full rounded object-cover" /> : null}
        <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(field.key, f); }}
          className="block w-full text-xs" />
        {val && <button onClick={() => set("")} className="mt-1 text-[10px] text-ink/40 hover:text-red-600">Remove</button>}
      </div>
    );
  }
  if (field.type === "list") {
    const items: any[] = Array.isArray(val) ? val : [];
    function updateItem(i: number, patch: Record<string, any>) {
      const next = [...items]; next[i] = { ...items[i], ...patch }; set(next);
    }
    return (
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-ink/50">{field.label}</label>
        <div className="space-y-2">
          {items.map((it, i) => {
            const keys = Array.from(new Set([...Object.keys(it), "iconUrl"]));
            return (
              <div key={i} className="rounded border border-ink/10 p-2">
                {/* Row of icon + name */}
                {("emoji" in it || "iconUrl" in it) && (
                  <div className="mb-2 flex items-start gap-2">
                    <CourseIconPicker
                      value={{ emoji: it.emoji, iconUrl: it.iconUrl }}
                      onChange={(v) => updateItem(i, { emoji: v.emoji ?? "", iconUrl: v.iconUrl ?? "" })}
                    />
                    {"name" in it && (
                      <input value={String(it.name ?? "")}
                        onChange={(e) => updateItem(i, { name: e.target.value })}
                        placeholder="name"
                        className="flex-1 rounded border border-ink/10 px-2 py-1.5 text-sm" />
                    )}
                  </div>
                )}
                {keys.filter((k) => k !== "emoji" && k !== "iconUrl" && !(("emoji" in it || "iconUrl" in it) && k === "name")).map((k) => {
                  if (k === "badges" || k === "includes") {
                    const arr: string[] = Array.isArray(it[k]) ? it[k] : [];
                    return (
                      <div key={k} className="mb-2">
                        <div className="mb-1 text-[10px] uppercase tracking-wider text-ink/40">{k}</div>
                        <div className="flex flex-wrap items-center gap-1">
                          {arr.map((b, j) => (
                            <span key={j} className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[11px]">
                              {b}
                              <button onClick={() => { const next = arr.filter((_, x) => x !== j); updateItem(i, { [k]: next }); }}
                                className="text-ink/40 hover:text-red-600">×</button>
                            </span>
                          ))}
                          <input
                            placeholder={k === "badges" ? "+ badge (V, GF, …)" : "+ item"}
                            onKeyDown={(e) => {
                              const v = (e.target as HTMLInputElement).value.trim();
                              if (e.key === "Enter" && v) { e.preventDefault(); updateItem(i, { [k]: [...arr, v] }); (e.target as HTMLInputElement).value = ""; }
                            }}
                            onBlur={(e) => { const v = e.target.value.trim(); if (v) { updateItem(i, { [k]: [...arr, v] }); e.target.value = ""; } }}
                            className="min-w-[120px] flex-1 rounded border border-ink/10 px-2 py-0.5 text-[11px]" />
                        </div>
                        {k === "badges" && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {["V","VG","GF","DF","NF","Spicy"].filter((p) => !arr.includes(p)).map((p) => (
                              <button key={p} onClick={() => updateItem(i, { [k]: [...arr, p] })}
                                className="rounded-full border border-ink/15 px-1.5 py-0 text-[10px] text-ink/60 hover:bg-ink/5">+{p}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  if (k === "desc") {
                    return (
                      <textarea key={k} value={String(it[k] ?? "")}
                        onChange={(e) => updateItem(i, { [k]: e.target.value })}
                        placeholder="description"
                        rows={2}
                        className="mb-1 block w-full rounded border border-ink/10 px-2 py-1 text-xs" />
                    );
                  }
                  return (
                    <input key={k} value={String(it[k] ?? "")}
                      onChange={(e) => updateItem(i, { [k]: e.target.value })}
                      placeholder={k}
                      className="mb-1 block w-full rounded border border-ink/10 px-2 py-1 text-xs" />
                  );
                })}
                <div className="flex gap-3 text-[10px]">
                  <button onClick={() => { const next = [...items]; next.splice(i + 1, 0, { ...it }); set(next); }} className="text-ink/40 hover:text-velvet">Duplicate</button>
                  <button onClick={() => { const next = [...items]; next.splice(i,1); set(next); }} className="text-ink/40 hover:text-red-600">Remove</button>
                </div>
              </div>
            );
          })}
          <button onClick={() => set([...items, { ...(items[0] ?? { name: "", desc: "" }) }])}
            className="rounded border border-dashed border-ink/20 px-2 py-1 text-[11px] hover:bg-ink/5">+ Add item</button>
        </div>
      </div>
    );
  }
  return null;
}
