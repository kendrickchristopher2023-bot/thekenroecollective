import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supportChat, getConciergeAttachmentUrl } from "@/lib/support.functions";
import { useContactEmail } from "@/hooks/use-contact-email";
import { getEntitlements, type Tier } from "@/lib/entitlements-client";
import { usePreviewTier } from "@/lib/preview-tier";
import { TIERS, TIER_LIMITS } from "@/lib/tier-config";
import { MessageCircle, X, Send, Sparkles, Mic, MicOff, Volume2, VolumeX, Lock, Plus, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDraggable } from "@/lib/use-draggable";

type Msg = { role: "user" | "assistant"; content: string };

const GREETING =
  "Hi there 👋 I'm your personal Concierge. I can help with plans, invitations, RSVPs, guest imports, gift funds, the Tip & Donation Jar, Photo Wall, SMS reminders, seating, check-in, projects, vendors, thank-you cards, Group eCards, and Atelier Studio. Tell me what you're hosting and I'll guide the next step.";

// Web Speech API types (lightweight, browser-only)
type SpeechRecognitionLike = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.continuous = false;
  r.interimResults = false;
  r.lang = "en-US";
  return r;
}

function ConciergeMarkdown({ text }: { text: string }) {
  return (
    <div className="concierge-md space-y-2 [&_p]:m-0 [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:m-0 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...rest }) => {
            const url = href ?? "";
            const isInternal = url.startsWith("/") && !url.startsWith("//");
            if (isInternal) {
              return (
                <Link
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  to={url as any}
                  className="font-medium text-velvet underline underline-offset-2 hover:opacity-80"
                  onClick={() => {
                    try { sessionStorage.setItem("kc_concierge_open", "1"); } catch { /* ignore */ }
                  }}
                >
                  {children}
                </Link>
              );
            }
            return (
              <a
                href={url}
                target={url.startsWith("mailto:") ? undefined : "_blank"}
                rel="noopener noreferrer"
                className="font-medium text-velvet underline underline-offset-2 hover:opacity-80"
                {...rest}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function getContextualNudge(): string {
  if (typeof window === "undefined") return "Curious how it works? I can match you to the right plan in 30 seconds.";
  const path = window.location.pathname;
  if (path.startsWith("/events/new")) return "Setting up a gathering? I can walk you through it in 3 steps.";
  if (path.startsWith("/events/")) return "Need help with reminders, seating, or check-in? I'm right here.";
  if (path.startsWith("/studio")) return "Want a hand designing your invitation? I can suggest copy and a theme.";
  if (path.startsWith("/pricing")) return "Not sure which plan fits? Tell me your guest count and I'll match you.";
  if (path.startsWith("/ecards")) return "Signing a card as a group? I can help with the theme, the reveal date, and the invite wording.";
  if (path.startsWith("/projects")) return "Planning a project? I can help you break it into a kanban board.";
  if (path.startsWith("/vendors") || path.startsWith("/rfq")) return "Looking for a vendor? I can help you write the perfect RFQ.";
  if (path.startsWith("/tools/converter")) return "Need a specific format or size? Tell me and I'll set up the right preset.";
  return "Curious how The Kenroe Collective works? I can guide you in 30 seconds.";
}

export function SupportWidget() {
  const ask = useServerFn(supportChat);
  const email = useContactEmail();
  // Initialize with SSR-safe defaults; hydrate from sessionStorage after mount
  // to avoid hydration mismatches that cause React to remount the entire tree
  // (which the user perceives as a page refresh).
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState<boolean>(false);
  const [showNudge, setShowNudge] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: GREETING }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [tier, setTier] = useState<Tier>("postcard");
  const [hasPmAddon, setHasPmAddon] = useState(false);
  const [isOwnerAcct, setIsOwnerAcct] = useState(false);
  const voiceLocked = tier === "postcard";
  // Uploads (+ button) require Host or Atelier (or owner). Postcard/Whisper blocked.
  const uploadAllowed = tier === "host" || tier === "atelier";
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [voiceOn, setVoiceOn] = useState<boolean>(false);
  const { ref: dragRef, style: dragStyle, handleProps } = useDraggable("kenroes:pos:concierge", () => {
    if (typeof window === "undefined") return { x: 320, y: 560 };
    return { x: Math.max(8, window.innerWidth - 76), y: Math.max(8, window.innerHeight - 76) };
  });

  useEffect(() => {
    try {
      if (sessionStorage.getItem("kc_concierge_open") === "1") setOpen(true);
      const raw = sessionStorage.getItem("kc_concierge_msgs");
      if (raw) {
        const parsed = JSON.parse(raw) as Msg[];
        if (Array.isArray(parsed) && parsed.length) setMessages(parsed);
      }
      if (sessionStorage.getItem("kc_concierge_voice") === "1") setVoiceOn(true);
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);
  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewTier = usePreviewTier();
  useEffect(() => {
    let cancelled = false;
    getEntitlements()
      .then((e) => {
        if (cancelled) return;
        setTier(e.tier);
        setHasPmAddon(!!e.hasPmAddon);
        setIsOwnerAcct(!!e.isOwner && !e.previewing);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [previewTier]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("kc_concierge_open", open ? "1" : "0");
    window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("kc_concierge_voice", voiceOn && !voiceLocked ? "1" : "0");
  }, [voiceOn, voiceLocked]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      // Cap stored history so sessionStorage stays small.
      const trimmed = messages.slice(-40);
      sessionStorage.setItem("kc_concierge_msgs", JSON.stringify(trimmed));
    } catch { /* ignore */ }
  }, [messages, hydrated]);

  // Proactive helper: show a contextual nudge at most once per session, quietly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const seenKey = "kc_concierge_nudged_once";
    if (sessionStorage.getItem(seenKey)) return;
    if (open) return;
    const t = setTimeout(() => {
      setShowNudge(true);
      sessionStorage.setItem(seenKey, "1");
    }, 20000);
    return () => clearTimeout(t);
  }, [open]);

  // Listener wired below after `send` is defined.

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !voiceOn || voiceLocked) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      u.pitch = 1;
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }, [voiceOn, voiceLocked]);

  const buildTierContext = useCallback((): string => {
    let dismissed: string[] = [];
    try {
      const raw = sessionStorage.getItem("kc_concierge_dismissed_upsells");
      if (raw) dismissed = JSON.parse(raw) as string[];
    } catch { /* ignore */ }
    const current = TIERS[tier];
    const limits = TIER_LIMITS[tier];
    const pmLine = (() => {
      if (isOwnerAcct) return "Project Management: owner access (20 seats).";
      if (hasPmAddon) {
        const seats = tier === "atelier" ? 20 : tier === "host" ? 5 : 3;
        return `Project Management: add-on active — ${seats} seats.`;
      }
      return "Project Management: not active — purchase add-on at /pricing ($5/mo). Required for every tier, including Atelier.";
    })();
    return [
      `Current tier: ${current.name} (${tier}).`,
      `Tier tagline: ${current.tagline}.`,
      `Monthly $${current.monthlyPrice} · Yearly $${current.yearlyPrice}${current.oneTimePrice ? ` · One-time $${current.oneTimePrice}` : ""}.`,
      `Numeric limits: activeEvents=${Number.isFinite(limits.activeEvents) ? limits.activeEvents : "unlimited"}, guestsPerEvent=${Number.isFinite(limits.guestsPerEvent) ? limits.guestsPerEvent : "unlimited"}, smsRemindersPerEvent=${Number.isFinite(limits.smsRemindersPerEvent) ? limits.smsRemindersPerEvent : "unlimited"}.`,
      pmLine,
      `Included features on this tier: ${current.features.join("; ")}.`,
      current.notIncluded.length ? `NOT included on this tier: ${current.notIncluded.join("; ")}.` : "",
      `Full catalog for reference: ${(["postcard","whisper","host","atelier"] as const).map((k) => `${TIERS[k].name}[$${TIERS[k].monthlyPrice}/mo, ${TIERS[k].features.slice(0,4).join("; ")}]`).join(" | ")}.`,
      dismissed.length ? `Dismissed upsells (do NOT re-suggest this session): ${dismissed.join(", ")}.` : "",
      `Manage billing at [/settings/billing](/settings/billing). Compare plans at [/pricing](/pricing).`,
    ].filter(Boolean).join("\n");
  }, [tier, hasPmAddon, isOwnerAcct]);

  const send = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if ((!text && attachments.length === 0) || loading) return;
    const attachNote = attachments.length
      ? `\n\n[Attached ${attachments.length} reference${attachments.length === 1 ? "" : "s"}]`
      : "";
    const next: Msg[] = [...messages, { role: "user", content: (text || "(see attachments)") + attachNote }];
    setMessages(next);
    setInput("");
    const sentAttachments = attachments;
    setAttachments([]);
    setLoading(true);
    try {
      const r = await ask({ data: { messages: next, attachments: sentAttachments.length ? sentAttachments : undefined, tierContext: buildTierContext() } });
      setMessages([...next, { role: "assistant", content: r.reply }]);
      speak(r.reply);
      // Track dismissed upsell topics: when assistant mentions an upgrade and
      // the user's next message declines, remember the feature keywords so we
      // don't re-suggest the same upgrade in this session.
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: `Sorry — I couldn't reach the assistant. Try again or email ${email}.` },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages, ask, email, speak, attachments, buildTierContext]);

  // Session-level dismissal helper (called when user says "no thanks" etc.).
  // Records the last assistant message topic so the model has it in tierContext.
  useEffect(() => {
    if (messages.length < 2) return;
    const last = messages[messages.length - 1];
    const prev = messages[messages.length - 2];
    if (last.role !== "user" || prev.role !== "assistant") return;
    const declined = /\b(no thanks|not now|maybe later|no thank you|skip|dismiss|not interested)\b/i.test(last.content);
    if (!declined) return;
    const mention = prev.content.match(/\b(Whisper|Host|Atelier|Photo Wall|AI art|seating|gift fund|SMS|thank[- ]?you|branded|converter|project management)\b/i);
    if (!mention) return;
    try {
      const raw = sessionStorage.getItem("kc_concierge_dismissed_upsells");
      const list: string[] = raw ? JSON.parse(raw) : [];
      if (!list.includes(mention[1])) {
        list.push(mention[1]);
        sessionStorage.setItem("kc_concierge_dismissed_upsells", JSON.stringify(list.slice(-20)));
      }
    } catch { /* ignore */ }
  }, [messages]);

  const onPlusClick = useCallback(async () => {
    if (!uploadAllowed) {
      setMessages((m) => [...m, {
        role: "assistant",
        content: "Uploads (photos, screenshots, links) are a Host & Atelier perk — they let me see exactly what you have in mind. Upgrade to Host or Atelier and I'll start accepting attachments on every message.",
      }]);
      return;
    }
    fileRef.current?.click();
  }, [uploadAllowed]);

  const onFileChosen = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setMessages((m) => [...m, { role: "assistant", content: "Please sign in to upload references." }]);
      return;
    }
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files).slice(0, 3)) {
        if (file.size > 10 * 1024 * 1024) {
          setMessages((m) => [...m, { role: "assistant", content: `"${file.name}" is over 10MB — skipped.` }]);
          continue;
        }
        const ext = file.name.split(".").pop() || "bin";
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
        const path = `${userId}/concierge/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
        // Private bucket + short-lived signed URL: support references can contain
        // personal details and must not be fetchable by object path alone.
        const { error } = await supabase.storage.from("atelier-media-private").upload(path, file, {
          contentType: file.type || `application/${ext}`,
          upsert: false,
        });
        if (error) {
          setMessages((m) => [...m, { role: "assistant", content: `Upload failed: ${error.message}` }]);
          continue;
        }
        const signed = await getConciergeAttachmentUrl({ data: { path } });
        if (signed?.url) uploaded.push(signed.url);
      }
      if (uploaded.length) setAttachments((a) => [...a, ...uploaded].slice(0, 6));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, []);

  const toggleMic = useCallback(() => {
    if (voiceLocked) {
      setMessages((m) => [...m, { role: "assistant", content: "Voice chat is a Whisper-tier perk. Upgrade to Whisper (or any plan above Postcard) and I'll start listening and replying out loud. Want me to open the pricing page?" }]);
      return;
    }
    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }
    const r = getRecognition();
    if (!r) {
      setMessages((m) => [...m, { role: "assistant", content: "Voice input isn't supported in this browser. Try Chrome or Safari on desktop." }]);
      return;
    }
    recogRef.current = r;
    r.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) void send(transcript);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [listening, send]);

  useEffect(() => () => { recogRef.current?.abort(); window.speechSynthesis?.cancel(); }, []);

  // Listen for "Ask the Concierge" from the command palette.
  useEffect(() => {
    function onAsk(e: Event) {
      const seed = (e as CustomEvent<{ seed?: string }>).detail?.seed ?? "";
      setOpen(true);
      setShowNudge(false);
      if (seed) {
        setInput("");
        setTimeout(() => { void send(seed); }, 50);
      }
    }
    window.addEventListener("kc:open-concierge", onAsk as EventListener);
    return () => window.removeEventListener("kc:open-concierge", onAsk as EventListener);
  }, [send]);

  if (!open) {
    return (
      <>
      {/* Mobile-only persistent launcher: bottom-left, clear of the bottom tab
          bar (~56px + safe area) and the right-side "+" action dock. */}
      {/* On phones the concierge is opened from the single "+" action dock
          (Chat with support), so no separate floating launcher is rendered. */}
      <div
        ref={dragRef}
        style={dragStyle}
        data-notranslate
        className="z-[80] hidden sm:flex flex-col items-end gap-2 select-none print:hidden"
      >
        {showNudge && (
          <button
            type="button"
            onClick={() => { setShowNudge(false); setOpen(true); }}
            className="max-w-[18rem] rounded-2xl bg-paper px-4 py-3 text-left text-sm shadow-2xl ring-1 ring-ink/10 hover:bg-secondary"
          >
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-velvet">
              <Sparkles className="h-3 w-3" /> AI Concierge
            </div>
            {getContextualNudge()}
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <span
            {...handleProps}
            data-drag-handle
            role="button"
            tabIndex={0}
            aria-label="Move AI concierge"
            title="Drag to move"
            className="grid h-11 w-11 place-items-center rounded-full border border-ink/10 bg-paper/95 text-ink/45 shadow-lg backdrop-blur hover:text-ink active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <button
            type="button"
            onClick={() => { setShowNudge(false); setOpen(true); }}
            aria-label="Open AI concierge"
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-velvet text-white shadow-lg transition hover:scale-105 hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-gold/60"
          >
            <MessageCircle className="h-6 w-6" />
          </button>
        </div>
      </div>
      </>
    );
  }

  return (
    <div
      ref={dragRef}
      style={dragStyle}
      data-notranslate
      className="z-[80] flex h-[34rem] w-[23rem] max-h-[calc(100vh-1rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-3xl bg-paper shadow-2xl ring-1 ring-ink/10 print:hidden"
    >
      <div className="flex items-center justify-between border-b border-ink/5 bg-ink px-4 py-3 text-paper">
        <div className="flex min-w-0 items-center gap-2">
          <span
            {...handleProps}
            data-drag-handle
            role="button"
            tabIndex={0}
            aria-label="Move AI concierge"
            title="Drag to move"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-paper/55 hover:bg-paper/10 hover:text-paper active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-serif text-base">The Kenroe Collective Concierge</div>
            <div className="text-[10px] uppercase tracking-widest text-paper/60">AI · Plans · Voice · Support</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              if (voiceLocked) {
                setMessages((m) => [...m, { role: "assistant", content: "Voice replies are a Whisper-tier perk. Upgrade to Whisper or above and I'll read every answer back to you." }]);
                return;
              }
              setVoiceOn((v) => { if (v) window.speechSynthesis?.cancel(); return !v; });
            }}
            aria-label={voiceLocked ? "Voice replies locked — upgrade to Whisper" : (voiceOn ? "Mute voice replies" : "Enable voice replies")}
            title={voiceLocked ? "Upgrade to Whisper to enable voice" : (voiceOn ? "Mute voice replies" : "Hear replies aloud")}
            className={`grid h-11 w-11 place-items-center rounded-full hover:bg-paper/10 ${voiceLocked ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            {voiceLocked ? <Lock className="h-4 w-4" /> : voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full hover:bg-paper/10">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-8 text-right" : "mr-8"}>
            <div className={`inline-block whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-velvet text-white" : "bg-secondary text-ink"}`}>
              {m.role === "user" ? (
                m.content
              ) : (
                <ConciergeMarkdown text={m.content} />
              )}
            </div>
          </div>
        ))}
        {loading && <div className="mr-8 text-xs text-muted-foreground">Thinking…</div>}
        {listening && <div className="mr-8 text-xs text-velvet">Listening…</div>}
        <div ref={endRef} />
      </div>
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-ink/5 px-3 pt-2">
          {attachments.map((url) => {
            const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test(url);
            return (
              <div key={url} className="relative">
                {isImage ? (
                  <img src={url} alt="ref" className="h-10 w-10 rounded-md object-cover ring-1 ring-ink/10" />
                ) : (
                  <div className="rounded-md bg-secondary px-2 py-1 text-[10px] text-ink/70 ring-1 ring-ink/10">file</div>
                )}
                <button
                  type="button"
                  onClick={() => setAttachments((a) => a.filter((x) => x !== url))}
                  className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs text-paper ring-2 ring-paper"
                  aria-label="Remove attachment"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
      {uploading && <div className="px-4 pt-1 text-[11px] text-muted-foreground">Uploading…</div>}
      <form
        onSubmit={(e) => { e.preventDefault(); void send(); }}
        className="flex items-center gap-2 border-t border-ink/5 p-3"
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => void onFileChosen(e.target.files)}
        />
        <button
          type="button"
          onClick={() => void onPlusClick()}
          aria-label={uploadAllowed ? "Upload photo or document" : "Uploads available on Host or Atelier"}
          title={uploadAllowed ? "Upload a photo, screenshot, or PDF" : "Upload references — available on Host or Atelier"}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 ring-ink/15 transition-colors ${
            uploadAllowed ? "bg-paper text-ink hover:bg-secondary" : "bg-paper text-ink/40 cursor-help"
          }`}
        >
          {uploadAllowed ? <Plus className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={toggleMic}
          aria-label={voiceLocked ? "Voice input locked — upgrade to Whisper" : (listening ? "Stop listening" : "Speak to the concierge")}
          title={voiceLocked ? "Upgrade to Whisper to speak to the Concierge" : (listening ? "Stop" : "Speak")}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 ring-ink/15 transition-colors ${
            voiceLocked
              ? "bg-paper text-ink/40 cursor-not-allowed"
              : listening
                ? "bg-velvet text-white"
                : "bg-paper text-ink hover:bg-secondary"
          }`}
        >
          {voiceLocked ? <Lock className="h-4 w-4" /> : listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>

        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={listening ? "Listening…" : "Ask anything — or tap the mic"}
          className="flex-1 rounded-full border border-ink/15 bg-paper px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-velvet/30"
        />
        <button
          type="submit"
          disabled={loading || (!input.trim() && attachments.length === 0)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-velvet text-white disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      <div className="border-t border-ink/5 bg-paper px-3 py-1.5 text-center text-[10px] text-ink/45">
        Powered by AI · Answers may be imperfect — verify anything important.
      </div>
    </div>
  );
}
