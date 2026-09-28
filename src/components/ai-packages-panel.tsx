import { toUserMessage } from "@/lib/user-error";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getEntitlements, type Entitlements } from "@/lib/entitlements-client";
import { usePreviewTier, setPreviewTier } from "@/lib/preview-tier";
import { isPaymentsConfigured } from "@/lib/stripe";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import {
  hasAiPackagesAccess,
  listAiPackages,
  generateAiPackage,
  deleteAiPackage,
  createPackageShare,
  revokePackageShare,
  createRfqFromPackage,
  previewRfqVendorMatch,

  transcribeBrief,
  RFQ_CATEGORIES_LIST,
  type AiPackageRow,
  type AiPackageKind,
  type AiPackageContent,
} from "@/lib/ai-packages.functions";
import { extractAllergens, rollupCost, fmtUsd, exportPackageToPdf } from "@/lib/ai-packages-helpers";
import { confirmDialog } from "@/lib/confirm-dialog";


/**
 * AI Packages & Menus panel.
 *
 * - Gated by has_ai_packages_access (Atelier tier, account-monthly add-on,
 *   per-event/project one-time unlock, or owner).
 * - When locked: shows two upsell options ($9/mo or $14 one-time) with the
 *   Atelier-only 25% auto-discount surfaced.
 * - When unlocked: lets the user pick a kind (menu / service bundle / merch
 *   pack), enter a brief, and generate a structured package the AI returns.
 * - Generated drafts are stored per event/project and listed below the form.
 *
 * All checkout flows use the inline Stripe modal — no full-page redirects.
 */
type Props = {
  eventId?: string;
  projectId?: string;
  className?: string;
};

const KIND_OPTIONS: Array<{ id: AiPackageKind; label: string; hint: string }> = [
  { id: "food_menu", label: "Food & drink menu", hint: "Welcome • First • Main • Sweet • Drinks" },
  { id: "service_bundle", label: "Service package", hint: "Bronze / Silver / Gold tiers with deliverables" },
  { id: "merch_pack", label: "Merchandise / favors / decor", hint: "T-shirts, totes, photo packs, reunion bundles" },
  { id: "other", label: "Custom package", hint: "Anything else — vendor checklists, run-of-show, etc." },
];

export function AiPackagesPanel({ eventId, projectId, className }: Props) {
  const checkAccess = useServerFn(hasAiPackagesAccess);
  const listFn = useServerFn(listAiPackages);
  const generateFn = useServerFn(generateAiPackage);
  const deleteFn = useServerFn(deleteAiPackage);

  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [packages, setPackages] = useState<AiPackageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [showCheckout, setShowCheckout] = useState<null | "ai_packages_monthly" | "ai_packages_yearly" | "ai_packages_event">(null);

  // form
  const [kind, setKind] = useState<AiPackageKind>("food_menu");
  const [prompt, setPrompt] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [budget, setBudget] = useState("");
  const [dietary, setDietary] = useState("");
  const [vibe, setVibe] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [linkInput, setLinkInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const draftStorageKey = useMemo(
    () => `kenroes:ai-packages-draft:${projectId ? `project:${projectId}` : eventId ? `event:${eventId}` : "account"}`,
    [eventId, projectId],
  );

  // voice intake (Atelier)
  const transcribeFn = useServerFn(transcribeBrief);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(draftStorageKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<{
        kind: AiPackageKind;
        prompt: string;
        guestCount: string;
        budget: string;
        dietary: string;
        vibe: string;
        attachments: string[];
      }>;
      if (draft.kind && KIND_OPTIONS.some((opt) => opt.id === draft.kind)) setKind(draft.kind);
      setPrompt(draft.prompt ?? "");
      setGuestCount(draft.guestCount ?? "");
      setBudget(draft.budget ?? "");
      setDietary(draft.dietary ?? "");
      setVibe(draft.vibe ?? "");
      setAttachments(Array.isArray(draft.attachments) ? draft.attachments.filter((url) => typeof url === "string") : []);
    } catch { /* ignore corrupt draft */ }
  }, [draftStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasDraft = prompt.trim() || guestCount || budget || dietary.trim() || vibe.trim() || attachments.length > 0 || kind !== "food_menu";
    try {
      if (!hasDraft) {
        window.sessionStorage.removeItem(draftStorageKey);
        return;
      }
      window.sessionStorage.setItem(draftStorageKey, JSON.stringify({ kind, prompt, guestCount, budget, dietary, vibe, attachments }));
    } catch { /* storage can be unavailable */ }
  }, [attachments, budget, dietary, draftStorageKey, guestCount, kind, prompt, vibe]);

  const refreshAccessAndList = useCallback(async () => {
    try {
      const [accessRes, listRes] = await Promise.all([
        checkAccess({ data: { eventId, projectId } }),
        listFn({ data: { eventId, projectId } }),
      ]);
      setHasAccess(accessRes.hasAccess);
      setPackages(listRes.packages);
    } catch (err) {
      console.error(err);
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  }, [checkAccess, listFn, eventId, projectId]);

  useEffect(() => {
    let alive = true;
    Promise.all([supabase.auth.getUser(), getEntitlements()]).then(([{ data }, ent]) => {
      if (!alive) return;
      setUser(data.user ? { id: data.user.id, email: data.user.email ?? undefined } : null);
      setEntitlements(ent);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshAccessAndList();
  }, [user, refreshAccessAndList]);

  // Detect a checkout return (?ai_packages=1) and poll the entitlement so we
  // never flash the locked pricing UI while the webhook is still landing.
  const [activating, setActivating] = useState(false);
  const previewTier = usePreviewTier();
  const isPreviewing = entitlements?.isOwner === true && previewTier !== null;

  useEffect(() => {
    if (!user) return;
    let alive = true;
    getEntitlements()
      .then((next) => {
        if (alive) setEntitlements(next);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [previewTier, user]);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("ai_packages") !== "1") return;
    let cancelled = false;
    let attempts = 0;
    setActivating(true);
    (async () => {
      while (!cancelled && attempts < 15) {
        attempts++;
        try {
          const res = await checkAccess({ data: { eventId, projectId } });
          if (res.hasAccess) {
            if (!cancelled) {
              setHasAccess(true);
              setActivating(false);
              toast.success("Packages & Menus unlocked.");
              try {
                const url = new URL(window.location.href);
                url.searchParams.delete("ai_packages");
                url.searchParams.delete("resumed");
                window.history.replaceState({}, "", url.toString());
              } catch { /* ignore */ }
              void refreshAccessAndList();
            }
            return;
          }
        } catch { /* keep polling */ }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!cancelled) setActivating(false);
    })();
    return () => { cancelled = true; };
  }, [user, eventId, projectId, checkAccess, refreshAccessAndList]);

  // Re-check after checkout success message from embedded modal
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.type === "kenroes:addon-success") {
        setShowCheckout(null);
        void refreshAccessAndList();
        toast.success("Packages & Menus unlocked.");
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [refreshAccessAndList]);

  const handleExitPreview = useCallback(async () => {
    setPreviewTier(null);
    setEntitlements((current) => current ? { ...current, previewing: false, tier: current.isOwner ? "atelier" : current.tier } : current);
    toast.success("Preview exited. Your unlocked studio is ready.");
    try {
      const [nextEntitlements] = await Promise.all([getEntitlements(), refreshAccessAndList()]);
      setEntitlements(nextEntitlements);
    } catch {
      void refreshAccessAndList();
    }
  }, [refreshAccessAndList]);

  const scrollToSavedPackages = useCallback(() => {
    if (packages.length === 0) {
      toast.message("No saved packages yet.");
      return;
    }
    const target = document.getElementById("kc-saved-packages");
    if (!target) {
      toast.message("Saved packages are loading — try again in a moment.");
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [packages.length]);

  async function addLink() {
    const url = linkInput.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      toast.error("Please paste a full URL (https://…).");
      return;
    }
    if (attachments.includes(url)) {
      setLinkInput("");
      return;
    }
    setAttachments((a) => [...a, url]);
    setLinkInput("");
  }

  async function onUploadFiles(files: FileList | null) {
    if (!files || files.length === 0 || !user) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 8 * 1024 * 1024) {
          toast.error(`${file.name} is over 8MB — skipped.`);
          continue;
        }
        const ext = file.name.split(".").pop() || "bin";
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
        const path = `${user.id}/ai-packages/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
        const { error } = await supabase.storage.from("atelier-shared").upload(path, file, {
          contentType: file.type || `image/${ext}`,
          upsert: false,
        });
        if (error) {
          toast.error(`Upload failed: ${error.message}`);
          continue;
        }
        const { data } = supabase.storage.from("atelier-shared").getPublicUrl(path);
        if (data?.publicUrl) uploaded.push(data.publicUrl);
      }
      if (uploaded.length) {
        setAttachments((a) => [...a, ...uploaded]);
        toast.success(`Attached ${uploaded.length} file${uploaded.length === 1 ? "" : "s"}.`);
      }
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(url: string) {
    setAttachments((a) => a.filter((x) => x !== url));
  }

  async function onGenerate() {
    if (!prompt.trim()) {
      toast.error("Tell me a little about what you want.");
      return;
    }
    setGenerating(true);
    try {
      const res = await generateFn({
        data: {
          kind,
          prompt: prompt.trim(),
          guestCount: guestCount ? Math.max(1, parseInt(guestCount, 10) || 0) : undefined,
          budgetCents: budget ? Math.max(0, Math.round(parseFloat(budget) * 100) || 0) : undefined,
          dietary: dietary.trim() || undefined,
          vibe: vibe.trim() || undefined,
          attachments: attachments.length ? attachments : undefined,
          eventId,
          projectId,
        },
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Package generated.");
      setPrompt("");
      setAttachments([]);
      setGuestCount("");
      setBudget("");
      setDietary("");
      setVibe("");
      try { window.sessionStorage.removeItem(draftStorageKey); } catch { /* ignore */ }
      await refreshAccessAndList();
    } catch (err) {
      toast.error(toUserMessage(err, "Generation failed"));
    } finally {
      setGenerating(false);
    }
  }

  async function onDelete(id: string) {
    if (!(await confirmDialog({ title: "Delete this package?" }))) return;
    const res = await deleteFn({ data: { id } });
    if ("error" in res) toast.error(res.error);
    else {
      setPackages((p) => p.filter((x) => x.id !== id));
      toast.success("Deleted.");
    }
  }

  // Voice intake — record → upload → transcribe → append to brief
  async function startRecording() {
    if (!isAtelier) {
      toast.error("Voice intake is on the Atelier plan.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Microphone is not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType });
      recordedChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        if (blob.size < 500) {
          toast.error("That was too quiet — try again.");
          return;
        }
        if (blob.size > 4 * 1024 * 1024) {
          toast.error("Recording is too long — keep it under ~60 seconds.");
          return;
        }
        setTranscribing(true);
        try {
          const buf = await blob.arrayBuffer();
          let bin = "";
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i += 0x8000) {
            bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
          }
          const b64 = btoa(bin);
          const fmt = mimeType.includes("mp4") ? "mp4" : "webm";
          const res = await transcribeFn({ data: { audioBase64: b64, format: fmt } });
          if ("error" in res) toast.error(res.error);
          else {
            setPrompt((p) => (p ? `${p}\n\n${res.text}` : res.text));
            toast.success("Added to your brief.");
          }
        } catch (err) {
          toast.error(toUserMessage(err, "Transcription failed"));
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Couldn't access the microphone.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }

  if (!user) return null;
  if (loading) {
    return <div className={className}><p className="text-sm text-muted-foreground">Loading Packages & Menus…</p></div>;
  }

  const previewHidesPackages = isPreviewing && previewTier !== "atelier";
  const isOwnerInRealView = entitlements?.isOwner && !isPreviewing;
  const isAtelier = entitlements?.tier === "atelier" || isOwnerInRealView;

  // When an owner is previewing a non-owner tier, ignore their real owner access
  // and show the same locked upsell a real customer of that tier would see.
  const effectiveHasAccess = previewHidesPackages ? false : hasAccess;


  const scopeLabel = projectId ? "this project" : eventId ? "this event" : "your account";
  const previewTierLabel = previewTier
    ? previewTier.charAt(0).toUpperCase() + previewTier.slice(1)
    : null;

  return (
    <section className={className}>
      <header className="mb-4">
        <h2 className="font-serif text-xl text-ink">Packages & Menus</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          AI-generated menus, tiered service packages, and merchandise packs tailored to {scopeLabel}.
        </p>
      </header>

      {activating ? (
        <div className="rounded-2xl bg-secondary/40 p-6 ring-1 ring-velvet/20">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-velvet" />
            <div>
              <h3 className="font-serif text-lg text-ink">Activating Packages & Menus…</h3>
              <p className="mt-1 text-sm text-ink/70">
                We're confirming your purchase. This usually takes just a few seconds — please don't refresh.
              </p>
            </div>
          </div>
        </div>
      ) : !effectiveHasAccess ? (
        previewHidesPackages && hasAccess ? (
          // Owner is previewing a lower tier but actually owns access — don't
          // re-show pricing. Surface a clear "already unlocked" card with a
          // one-click way out of preview mode and a jump to saved packages.
          <>
          <div className="overflow-hidden rounded-2xl bg-velvet/5 ring-1 ring-velvet/20">
            <div className="border-b border-velvet/10 bg-paper/70 px-5 py-3">
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">Unlocked studio</div>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-velvet text-paper text-xs">✓</span>
                <div>
                  <h3 className="font-serif text-lg text-ink">Packages & Menus — already unlocked</h3>
                  <p className="mt-1 text-sm text-ink/70">
                    You own this for {scopeLabel}. You're previewing the
                    {previewTierLabel ? ` ${previewTierLabel}` : ""} tier, so the generator is hidden.
                    Exit preview to create menus and packages.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-ink/60">
                    <span className="rounded-full bg-paper px-2.5 py-1 ring-1 ring-ink/10">{packages.length} saved</span>
                    <span className="rounded-full bg-paper px-2.5 py-1 ring-1 ring-ink/10">Access: {scopeLabel}</span>
                    <span className="rounded-full bg-paper px-2.5 py-1 ring-1 ring-ink/10">Preview: {previewTierLabel ?? "lower tier"}</span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExitPreview}
                  className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:bg-ink/90"
                >
                  Exit preview
                </button>
                {packages.length > 0 && (
                  <button
                    type="button"
                    onClick={scrollToSavedPackages}
                    className="rounded-md bg-paper px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink/10 hover:ring-velvet"
                  >
                    View {packages.length} saved
                  </button>
                )}
                <Link
                  to="/studio"
                  search={{ tab: "design" } as any}
                  className="rounded-md bg-paper px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink/10 hover:ring-velvet"
                >
                  Open Design tab
                </Link>
              </div>
            </div>
          </div>
          <SavedPackagesList packages={packages} onDelete={onDelete} onChange={refreshAccessAndList} />
          </>
        ) : (
        <div className="rounded-2xl bg-secondary/40 p-5 ring-1 ring-ink/5">
          <h3 className="font-serif text-lg text-ink">Unlock Packages & Menus</h3>
          <p className="mt-1 text-sm text-ink/70">
            Generate cohesive menus (with dietary preferences &amp; allergies), Bronze/Silver/Gold service tiers (good / better / best inclusion levels — staffing, courses, bar), and non-food packages
            like reunion t-shirts, photo packs, or decor kits — all priced and ready to share.
          </p>
          {isAtelier ? (
            <p className="mt-2 text-xs font-medium text-velvet">
              Atelier members save 20% on the event unlock and 25% on the monthly or yearly add-on.
            </p>
          ) : (
            <p className="mt-2 text-xs font-medium text-velvet">
              Save 10% monthly or 20% yearly with the subscription add-on.
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setShowCheckout("ai_packages_event")}
              className="rounded-2xl bg-paper p-4 text-left ring-1 ring-ink/10 hover:ring-velvet"
            >
              <div className="text-xs uppercase tracking-wide text-ink/60">One-time, this {projectId ? "project" : "event"}</div>
              <div className="mt-1 font-serif text-2xl text-ink">${isAtelier ? "11.20" : "14"}</div>
              <div className="mt-2 text-xs text-ink/70">Unlimited regenerations for this {projectId ? "project" : "event"}.</div>
            </button>
            <button
              type="button"
              onClick={() => setShowCheckout("ai_packages_monthly")}
              className="rounded-2xl bg-paper p-4 text-left ring-1 ring-ink/10 hover:ring-velvet"
            >
              <div className="text-xs uppercase tracking-wide text-ink/60">Monthly, all events & projects</div>
              <div className="mt-1 font-serif text-2xl text-ink">${isAtelier ? "6.75" : "9"}<span className="text-sm font-normal text-ink/60">/mo</span></div>
              <div className="mt-2 text-xs text-ink/70">Unlimited menus & packages across everything you create.</div>
            </button>
            <button
              type="button"
              onClick={() => setShowCheckout("ai_packages_yearly")}
              className="rounded-2xl bg-paper p-4 text-left ring-1 ring-ink/10 hover:ring-velvet"
            >
              <div className="text-xs uppercase tracking-wide text-ink/60">Yearly — best value</div>
              <div className="mt-1 font-serif text-2xl text-ink">${isAtelier ? "59.25" : "79"}<span className="text-sm font-normal text-ink/60">/yr</span></div>
              <div className="mt-2 text-xs text-ink/70">A full year of unlimited menus & packages.</div>
            </button>
          </div>
        </div>
        )

      ) : (
        <>
          <div className="mb-4 overflow-hidden rounded-2xl bg-velvet/5 ring-1 ring-velvet/20">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3 text-sm text-ink">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-velvet text-paper text-sm">✓</span>
                <div>
                  <div className="font-serif text-lg leading-tight">Your Packages & Menus studio is open</div>
                  <div className="text-xs text-ink/60">
                    Access for {scopeLabel}{packages.length > 0 ? ` · ${packages.length} saved` : " · ready to create"}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => document.getElementById("kc-package-generator")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90"
                >
                  Create package
                </button>
                {packages.length > 0 && (
                  <button type="button" onClick={scrollToSavedPackages} className="rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink/10 hover:ring-velvet">
                    View saved
                  </button>
                )}
                <Link to="/studio" search={{ tab: "design" } as any} className="rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink/10 hover:ring-velvet">
                  Design tab
                </Link>
              </div>
            </div>
          </div>

          <div id="kc-package-generator" className="scroll-mt-24 rounded-2xl bg-paper p-5 ring-1 ring-ink/10">
            <div className="grid gap-2 sm:grid-cols-2">
              {KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setKind(opt.id)}
                  className={`rounded-xl p-3 text-left ring-1 transition ${
                    kind === opt.id ? "bg-secondary ring-velvet" : "bg-paper ring-ink/10 hover:ring-ink/30"
                  }`}
                >
                  <div className="text-sm font-medium text-ink">{opt.label}</div>
                  <div className="mt-0.5 text-xs text-ink/60">{opt.hint}</div>
                </button>
              ))}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink/70">Brief</span>
                {isAtelier ? (
                  <button
                    type="button"
                    onClick={recording ? stopRecording : startRecording}
                    disabled={transcribing}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                      recording
                        ? "bg-velvet text-paper ring-velvet animate-pulse"
                        : "bg-paper text-ink ring-ink/10 hover:ring-velvet"
                    } disabled:opacity-50`}
                    title="Speak your brief — Atelier"
                  >
                    <span aria-hidden>{recording ? "■" : "🎙"}</span>
                    {transcribing ? "Transcribing…" : recording ? "Stop & transcribe" : "Speak your brief"}
                  </button>
                ) : (
                  <span className="text-[10px] uppercase tracking-wider text-ink/40" title="Atelier-only">Voice intake · Atelier</span>
                )}
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder={
                  kind === "food_menu"
                    ? "e.g., 60-guest sit-down dinner, late summer, Mediterranean, family-style mains, wine pairings."
                    : kind === "merch_pack"
                    ? "e.g., Smith family reunion 75 attendees, soft cotton t-shirts in 3 colors, custom logo, mugs and tote add-ons."
                    : "Describe what you want this package to cover."
                }
                className="mt-1 w-full rounded-md bg-secondary/40 px-3 py-2 text-sm text-ink ring-1 ring-ink/10 focus:outline-none focus:ring-velvet"
              />
            </div>


            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <label className="text-xs font-medium text-ink/70">
                Guests
                <input value={guestCount} onChange={(e) => setGuestCount(e.target.value)} inputMode="numeric"
                  className="mt-1 w-full rounded-md bg-secondary/40 px-3 py-2 text-sm ring-1 ring-ink/10 focus:outline-none focus:ring-velvet" />
              </label>
              <label className="text-xs font-medium text-ink/70">
                Budget ($)
                <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal"
                  className="mt-1 w-full rounded-md bg-secondary/40 px-3 py-2 text-sm ring-1 ring-ink/10 focus:outline-none focus:ring-velvet" />
              </label>
              <label className="text-xs font-medium text-ink/70 sm:col-span-2">
                Dietary / restrictions
                <input value={dietary} onChange={(e) => setDietary(e.target.value)} placeholder="vegan, GF, nut-free…"
                  className="mt-1 w-full rounded-md bg-secondary/40 px-3 py-2 text-sm ring-1 ring-ink/10 focus:outline-none focus:ring-velvet" />
              </label>
              <label className="text-xs font-medium text-ink/70 sm:col-span-4">
                Vibe / style
                <input value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="editorial garden party, lo-fi backyard, black tie…"
                  className="mt-1 w-full rounded-md bg-secondary/40 px-3 py-2 text-sm ring-1 ring-ink/10 focus:outline-none focus:ring-velvet" />
              </label>
            </div>

            <div className="mt-4 rounded-xl bg-secondary/30 p-3 ring-1 ring-ink/5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-ink/70">References & inspiration</div>
                  <div className="text-xs text-ink/60">Paste links (Pinterest, vendor pages) or upload photos for the AI to reference.</div>
                </div>
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink/10 hover:ring-velvet">
                  {uploading ? "Uploading…" : "Upload photos"}
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => { void onUploadFiles(e.target.files); e.target.value = ""; }}
                  />
                </label>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addLink(); } }}
                  placeholder="Paste a link (https://…)"
                  className="flex-1 rounded-md bg-paper px-3 py-2 text-sm ring-1 ring-ink/10 focus:outline-none focus:ring-velvet"
                />
                <button type="button" onClick={addLink} className="rounded-full bg-ink/10 px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/20">
                  Add link
                </button>
              </div>
              {attachments.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {attachments.map((url) => {
                    const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test(url);
                    return (
                      <li key={url} className="group relative">
                        {isImage ? (
                          <img src={url} alt="reference" className="h-16 w-16 rounded-md object-cover ring-1 ring-ink/10" />
                        ) : (
                          <a href={url} target="_blank" rel="noreferrer" className="inline-flex max-w-[220px] items-center rounded-md bg-paper px-2 py-1 text-xs text-ink/80 ring-1 ring-ink/10 hover:text-velvet">
                            <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachment(url)}
                          className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] text-paper group-hover:flex"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <LiveEstimate guestCount={guestCount} budget={budget} />

            <button
              type="button"
              onClick={onGenerate}
              disabled={generating}
              className="mt-4 inline-flex items-center justify-center rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-40"
            >
              {generating ? "Generating…" : "Generate package"}
            </button>
          </div>
          <SavedPackagesList packages={packages} onDelete={onDelete} onChange={refreshAccessAndList} />

        </>
      )}

      {showCheckout && user && (
        <CheckoutModal
          priceId={showCheckout}
          userId={user.id}
          email={user.email}
          eventId={eventId}
          projectId={projectId}
          onClose={() => setShowCheckout(null)}
        />
      )}
    </section>
  );
}

function LiveEstimate({ guestCount, budget }: { guestCount: string; budget: string }) {
  const guests = parseInt(guestCount, 10);
  const budgetN = parseFloat(budget);
  const hasGuests = Number.isFinite(guests) && guests > 0;
  const hasBudget = Number.isFinite(budgetN) && budgetN > 0;
  const perGuest = hasGuests && hasBudget ? budgetN / guests : null;
  if (!hasGuests && !hasBudget) return null;
  return (
    <div className="mt-3 rounded-xl bg-secondary/30 px-3 py-2 text-xs text-ink/70 ring-1 ring-ink/5">
      <span className="font-semibold uppercase tracking-wider text-ink/60">Target</span>
      <span className="ml-3">{hasGuests ? `${guests} guests` : "—"}</span>
      <span className="mx-2 text-ink/30">·</span>
      <span>{hasBudget ? `$${budgetN.toLocaleString()} budget` : "—"}</span>
      {perGuest !== null && (
        <>
          <span className="mx-2 text-ink/30">·</span>
          <span className="font-medium text-ink">≈ ${perGuest.toFixed(2)}/guest</span>
        </>
      )}
    </div>
  );
}

function SavedPackagesList({
  packages,
  onDelete,
  onChange,
}: {
  packages: AiPackageRow[];
  onDelete: (id: string) => void;
  onChange: () => Promise<void> | void;
}) {
  if (packages.length === 0) return null;
  return (
    <div id="kc-saved-packages" className="mt-8 space-y-4 scroll-mt-24">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">Saved collection</div>
          <h3 className="mt-1 font-serif text-lg text-ink">Packages & Menus</h3>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs text-ink/60">{packages.length} total</span>
      </div>
      {packages.map((p) => (
        <PackageCard key={p.id} pkg={p} onDelete={() => onDelete(p.id)} onChange={onChange} />
      ))}
    </div>
  );
}

function PackageCard({ pkg, onDelete, onChange }: { pkg: AiPackageRow; onDelete: () => void; onChange: () => Promise<void> | void }) {
  const c = pkg.content as AiPackageContent;
  const shareFn = useServerFn(createPackageShare);
  const revokeFn = useServerFn(revokePackageShare);
  const rfqFn = useServerFn(createRfqFromPackage);
  const allergens = useMemo(() => extractAllergens(pkg), [pkg]);
  const roll = useMemo(() => rollupCost(pkg), [pkg]);
  const [showRfq, setShowRfq] = useState(false);
  const [rfqCategory, setRfqCategory] = useState<(typeof RFQ_CATEGORIES_LIST)[number]>(
    pkg.kind === "food_menu" ? "Caterer" : pkg.kind === "merch_pack" ? "Other" : "Planner",
  );
  const [rfqLocation, setRfqLocation] = useState("");
  const [rfqDate, setRfqDate] = useState("");
  const [rfqCap, setRfqCap] = useState<number>(10);
  const [sharing, setSharing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const previewFn = useServerFn(previewRfqVendorMatch);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);

  // Debounced "how many vendors will actually get this?" preview, so hosts
  // know about an empty market BEFORE they hit Send.
  useEffect(() => {
    if (!showRfq) return;
    let cancelled = false;
    setMatchLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await previewFn({
          data: { category: rfqCategory, location: rfqLocation.trim() || undefined },
        });
        if (!cancelled) setMatchCount(res.count);
      } catch {
        if (!cancelled) setMatchCount(null);
      } finally {
        if (!cancelled) setMatchLoading(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [showRfq, rfqCategory, rfqLocation, previewFn]);


  async function onShare() {
    setSharing(true);
    try {
      const res = await shareFn({ data: { id: pkg.id } });
      if ("error" in res) { toast.error(res.error); return; }
      const url = `${window.location.origin}/p/${res.shareToken}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Share link copied.");
      } catch {
        toast.success(`Share link: ${url}`);
      }
    } finally {
      setSharing(false);
    }
  }

  async function onRevoke() {
    if (!(await confirmDialog({ title: "Revoke the share link? Existing recipients will lose access." }))) return;
    const res = await revokeFn({ data: { id: pkg.id } });
    if ("error" in res) toast.error(res.error);
    else { toast.success("Share link revoked."); await onChange(); }
  }

  async function onExport() {
    setExporting(true);
    try {
      await exportPackageToPdf(pkg);
    } catch (err) {
      toast.error(toUserMessage(err, "Export failed"));
    } finally {
      setExporting(false);
    }
  }

  async function onSendRfq() {
    const res = await rfqFn({
      data: {
        packageId: pkg.id,
        category: rfqCategory,
        location: rfqLocation.trim() || undefined,
        eventDate: rfqDate || undefined,
        vendorCap: rfqCap,
      },
    });
    if ("error" in res) toast.error(res.error);
    else {
      const n = (res as { invitedCount?: number }).invitedCount ?? 0;
      if (n > 0) {
        toast.success(`Sent to ${n} matching vendor${n === 1 ? "" : "s"} — bids will appear in your RFQ inbox.`);
      } else {
        toast.warning(
          "No verified vendors match yet — your RFQ is saved and we'll alert you the moment one joins your area.",
          { duration: 7000 },
        );
      }
      setShowRfq(false);
    }
  }

  return (
    <article className="rounded-2xl bg-paper p-5 ring-1 ring-ink/10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg text-ink">{c.title || pkg.title}</h3>
          {c.summary && <p className="mt-1 text-sm text-ink/70">{c.summary}</p>}
        </div>
        <button type="button" onClick={onDelete} className="text-xs text-ink/50 hover:text-velvet">Delete</button>
      </header>

      {(roll.itemsTotalCents > 0 || pkg.guest_count || roll.estimatedTotalCents) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {pkg.guest_count && (
            <span className="rounded-full bg-secondary/50 px-2 py-1 text-ink/70">{pkg.guest_count} guests</span>
          )}
          {roll.itemsTotalCents > 0 && (
            <span className="rounded-full bg-secondary/50 px-2 py-1 text-ink/70">Items total {fmtUsd(roll.itemsTotalCents)}</span>
          )}
          {roll.perGuestCents !== null && (
            <span className="rounded-full bg-ink text-paper px-2 py-1">{fmtUsd(roll.perGuestCents)}/guest</span>
          )}
          {roll.estimatedTotalCents && (
            <span className="rounded-full bg-secondary/50 px-2 py-1 text-ink/70">AI estimate {fmtUsd(roll.estimatedTotalCents)}</span>
          )}
        </div>
      )}

      {allergens.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {allergens.map((a) => (
            <span
              key={a.label}
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
                a.tone === "warn"
                  ? "bg-velvet/10 text-velvet ring-velvet/30"
                  : "bg-secondary/60 text-ink/80 ring-ink/10"
              }`}
            >
              {a.label}
            </span>
          ))}
        </div>
      )}

      {c.sections?.length > 0 && (
        <div className="mt-4 space-y-3">
          {c.sections.map((s, i) => (
            <div key={i}>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink/60">{s.heading}</div>
              <ul className="mt-1 space-y-1">
                {s.items.map((it, j) => (
                  <li key={j} className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      <span className="font-medium text-ink">{it.name}</span>
                      {it.description && <span className="text-ink/60"> — {it.description}</span>}
                    </span>
                    {typeof it.price_cents === "number" && (
                      <span className="shrink-0 text-ink/70">${(it.price_cents / 100).toFixed(2)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {c.tiers && c.tiers.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {c.tiers.map((t, i) => (
            <div key={i} className="rounded-xl bg-secondary/40 p-3">
              <div className="text-sm font-medium text-ink">{t.name}</div>
              {typeof t.price_cents === "number" && (
                <div className="mt-0.5 font-serif text-xl text-ink">${(t.price_cents / 100).toFixed(2)}</div>
              )}
              <ul className="mt-2 list-disc pl-4 text-xs text-ink/70">
                {t.includes.map((inc, j) => <li key={j}>{inc}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {pkg.attachments && pkg.attachments.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink/60">References</div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {pkg.attachments.map((url) => {
              const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test(url);
              return (
                <li key={url}>
                  {isImage ? (
                    <a href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt="reference" className="h-16 w-16 rounded-md object-cover ring-1 ring-ink/10" />
                    </a>
                  ) : (
                    <a href={url} target="_blank" rel="noreferrer" className="inline-flex max-w-[260px] items-center rounded-md bg-secondary/40 px-2 py-1 text-xs text-ink/80 ring-1 ring-ink/10 hover:text-velvet">
                      <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-ink/5 pt-4">
        <button type="button" onClick={onExport} disabled={exporting}
          className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50">
          {exporting ? "Exporting…" : "Export PDF"}
        </button>
        <button type="button" onClick={() => setShowRfq((s) => !s)}
          className="rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink/10 hover:ring-velvet">
          Send as RFQ to vendors
        </button>
        <button type="button" onClick={onShare} disabled={sharing}
          className="rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink/10 hover:ring-velvet disabled:opacity-50">
          {sharing ? "Generating…" : "Copy share link"}
        </button>
        <button type="button" onClick={onRevoke}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-ink/50 hover:text-velvet">
          Revoke share
        </button>
      </div>

      {showRfq && (
        <div className="mt-3 rounded-xl bg-secondary/40 p-3 ring-1 ring-ink/10">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs font-medium text-ink/70">
              Vendor category
              <select value={rfqCategory} onChange={(e) => setRfqCategory(e.target.value as typeof rfqCategory)}
                className="mt-1 w-full rounded-md bg-paper px-2 py-1.5 text-sm ring-1 ring-ink/10">
                {RFQ_CATEGORIES_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-ink/70">
              Location
              <input value={rfqLocation} onChange={(e) => setRfqLocation(e.target.value)} placeholder="City, ST"
                className="mt-1 w-full rounded-md bg-paper px-2 py-1.5 text-sm ring-1 ring-ink/10" />
            </label>
            <label className="text-xs font-medium text-ink/70">
              Event date
              <input type="date" value={rfqDate} onChange={(e) => setRfqDate(e.target.value)}
                className="mt-1 w-full rounded-md bg-paper px-2 py-1.5 text-sm ring-1 ring-ink/10" />
            </label>
          </div>
          <label className="mt-2 block text-xs font-medium text-ink/70">
            Send to up to {rfqCap} vendor{rfqCap === 1 ? "" : "s"}
            <input
              type="range"
              min={1}
              max={25}
              value={rfqCap}
              onChange={(e) => setRfqCap(Number(e.target.value))}
              className="mt-1 w-full"
            />
            <span className="mt-0.5 block text-[10px] text-ink/50">
              Higher = more bids, lower = more curated. Default is 10.
            </span>
          </label>
          <p
            className={`mt-2 text-[11px] ${
              matchCount === 0 ? "text-velvet" : "text-ink/60"
            }`}
            aria-live="polite"
          >
            {matchLoading
              ? "Checking vendor coverage…"
              : matchCount === null
                ? "Vendor coverage unavailable right now."
                : matchCount === 0
                  ? "No verified vendors match this category and area yet. You can still send — we'll save the request and alert you when one joins."
                  : `${matchCount} verified vendor${matchCount === 1 ? "" : "s"} match — up to ${Math.min(matchCount, rfqCap)} will be invited.`}
          </p>
          <button type="button" onClick={onSendRfq}
            className="mt-3 rounded-full bg-velvet px-4 py-1.5 text-xs font-medium text-paper hover:opacity-90">
            {matchCount === 0 ? "Send anyway" : "Send RFQ"}
          </button>

        </div>
      )}
    </article>
  );
}


function CheckoutModal({
  priceId,
  userId,
  email,
  eventId,
  projectId,
  onClose,
}: {
  priceId: "ai_packages_monthly" | "ai_packages_yearly" | "ai_packages_event";
  userId: string;
  email?: string;
  eventId?: string;
  projectId?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const returnUrl = typeof window !== "undefined"
    ? `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(
        projectId ? `/projects/${projectId}?ai_packages=1` : `/events/${eventId ?? ""}?ai_packages=1`,
      )}`
    : "";

  if (!isPaymentsConfigured()) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-md rounded-3xl bg-paper p-6 text-center">
          <p className="font-serif text-lg">Payments aren't configured yet.</p>
          <button type="button" onClick={onClose} className="mt-4 rounded-full bg-ink px-5 py-2 text-sm text-paper">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/60 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-3xl bg-paper p-5">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="font-serif text-lg text-ink">
            {priceId === "ai_packages_monthly"
              ? "Unlock Packages & Menus — Monthly"
              : priceId === "ai_packages_yearly"
                ? "Unlock Packages & Menus — Yearly"
                : `Unlock Packages & Menus — This ${projectId ? "project" : "event"}`}
          </h3>
          <button type="button" onClick={onClose} className="text-sm text-ink/60 hover:text-velvet">Close</button>
        </header>
        <StripeEmbeddedCheckout
          priceId={priceId}
          userId={userId}
          customerEmail={email}
          eventId={eventId}
          projectId={projectId}
          returnUrl={returnUrl}
        />
      </div>
    </div>
  );
}
