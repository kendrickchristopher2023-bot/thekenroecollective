import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { KEvent } from "@/lib/events-store";
import { formatEventDate, updateEvent, zonedWallClockToUtc } from "@/lib/events-store";
import { downloadHiResQr } from "@/lib/report-export";
import { exportInviteOnePagerPdf, INVITE_PAGE_SIZES } from "@/lib/invite-pdf-export";
import { sendEventInvites } from "@/lib/events-invites.functions";
import { buildSenderName } from "@/lib/email/sender-name";
import { confirmDialog } from "@/lib/confirm-dialog";
import { getPhotoWallAccess } from "@/lib/branding.functions";
import { GuestAudiencePicker, audienceSummary } from "@/components/guest-audience-picker";
import type { Guest } from "@/lib/events-store";



type Platform = {
  id: string;
  name: string;
  group: "social" | "messaging" | "ai" | "creative" | "calendar" | "other";
  href: (ctx: ShareCtx) => string;
  note?: string;
  /** Platform has no web share intent — copy the invite text to the clipboard before opening it. */
  copyBeforeOpen?: boolean;
};

type ShareCtx = {
  url: string;
  title: string;
  text: string;
  hashtag?: string;
};

function icsContent(event: KEvent) {
  const d = zonedWallClockToUtc(event.date, event.timezone);
  const end = new Date(d.getTime() + 2 * 3600 * 1000);
  const fmt = (x: Date) =>
    x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) =>
    (s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kenroe//Events//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@kenroe`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(d)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(event.title)}`,
    `DESCRIPTION:${esc(event.message || event.description || "")}`,
    `LOCATION:${esc([event.venue, event.address].filter(Boolean).join(", "))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadIcs(event: KEvent) {
  const blob = new Blob([icsContent(event)], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${event.title.replace(/[^a-z0-9]+/gi, "-")}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function googleCalUrl(event: KEvent) {
  const d = zonedWallClockToUtc(event.date, event.timezone);
  const end = new Date(d.getTime() + 2 * 3600 * 1000);
  const fmt = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${fmt(d)}/${fmt(end)}`,
    details: event.message || event.description || "",
    location: [event.venue, event.address].filter(Boolean).join(", "),
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

function outlookCalUrl(event: KEvent) {
  const d = zonedWallClockToUtc(event.date, event.timezone);
  const end = new Date(d.getTime() + 2 * 3600 * 1000);
  const p = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: d.toISOString(),
    enddt: end.toISOString(),
    body: event.message || event.description || "",
    location: [event.venue, event.address].filter(Boolean).join(", "),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p}`;
}

const PLATFORMS: Platform[] = [
  // Social — curated to the platforms hosts actually use to share invites.
  { id: "facebook", name: "Facebook", group: "social",
    href: ({ url, text }) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`,
    note: "Facebook builds the post from your invite link preview" },
  { id: "x", name: "X", group: "social",
    href: ({ url, text }) => `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
  { id: "linkedin", name: "LinkedIn", group: "social",
    href: ({ url }) => `https://www.linkedin.com/feed/?shareActive=true&shareUrl=${encodeURIComponent(url)}`,
    note: "LinkedIn only accepts the link — it builds the preview itself and doesn't allow pre-filled post text" },

  { id: "bluesky", name: "Bluesky", group: "social",
    href: ({ url, text }) => `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${url}`)}` },
  { id: "instagram", name: "Instagram", group: "social",
    href: () => "https://www.instagram.com/",
    copyBeforeOpen: true,
    note: "Instagram has no web share intent — this copies your invite text, then opens Instagram" },
  { id: "snapchat", name: "Snapchat", group: "social",
    href: () => "https://www.snapchat.com/",
    copyBeforeOpen: true,
    note: "Snapchat has no web share intent — this copies your invite text, then opens Snapchat" },


  // Messaging
  { id: "whatsapp", name: "WhatsApp", group: "messaging",
    href: ({ url, text }) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
  { id: "messenger", name: "Messenger", group: "messaging",
    href: ({ url }) => `https://www.facebook.com/dialog/send?link=${encodeURIComponent(url)}&app_id=140586622674265&redirect_uri=${encodeURIComponent(url)}` },
  { id: "telegram", name: "Telegram", group: "messaging",
    href: ({ url, text }) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
  { id: "signal", name: "Signal", group: "messaging",
    href: ({ url, text }) => `https://signal.me/#p/${encodeURIComponent(`${text} ${url}`)}`,
    note: "Opens Signal app if installed" },
  { id: "sms", name: "Text Message", group: "messaging",
    href: ({ url, text }) => `sms:?&body=${encodeURIComponent(`${text} ${url}`)}` },
  { id: "email", name: "Open in mail app", group: "messaging",
    href: ({ url, text, title }) => `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
    note: "For sending branded invitation emails to your guest list, use the “Email invitations” card below." },

  // AI assistants — open chat with prefilled prompt
  { id: "chatgpt", name: "ChatGPT", group: "ai",
    href: ({ text, url }) => `https://chat.openai.com/?q=${encodeURIComponent(`Help me draft a personal invitation for: ${text} ${url}`)}` },
  { id: "claude", name: "Claude", group: "ai",
    href: ({ text, url }) => `https://claude.ai/new?q=${encodeURIComponent(`Help me write a warm invitation message for: ${text} ${url}`)}` },
  { id: "gemini", name: "Gemini", group: "ai",
    href: ({ text, url }) => `https://gemini.google.com/app?q=${encodeURIComponent(`Draft an invitation for: ${text} ${url}`)}` },
  { id: "perplexity", name: "Perplexity", group: "ai",
    href: ({ text, url }) => `https://www.perplexity.ai/?q=${encodeURIComponent(`Suggest creative invitation wording for: ${text} ${url}`)}` },
  { id: "copilot", name: "Copilot", group: "ai",
    href: ({ text, url }) => `https://copilot.microsoft.com/?q=${encodeURIComponent(`Draft an invitation: ${text} ${url}`)}` },
];

const GROUP_LABEL: Record<Platform["group"], string> = {
  social: "Social networks",
  messaging: "Messaging",
  ai: "AI assistants",
  creative: "Creative tools",
  calendar: "Calendar",
  other: "Other",
};

export function ShareHub({ event, hideEmailCard = false }: { event: KEvent; hideEmailCard?: boolean }) {
  const date = formatEventDate(event.date, event.timezone);
  // The share links must never be built from an empty origin. Reading
  // window.location during render leaves the server-rendered href with an empty
  // url= param (which React keeps after hydration), so every share composer
  // opened blank. Resolve the origin in an effect and fall back to the
  // production domain so the link is always complete.
  const [origin, setOrigin] = useState("https://thekenroecollective.com");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);
  const inviteUrl = useMemo(
    () => event.rsvpUrl || `${origin}/invite/${event.id}`,
    [event.rsvpUrl, event.id, origin],
  );

  const text = `${event.title} — ${date.long} at ${date.time}${event.venue ? ` · ${event.venue}` : ""}${event.hashtag ? ` ${event.hashtag.startsWith("#") ? event.hashtag : "#" + event.hashtag}` : ""}`;
  const ctx: ShareCtx = { url: inviteUrl, title: event.title, text, hashtag: event.hashtag };


  const grouped = PLATFORMS.reduce<Record<string, Platform[]>>((acc, p) => {
    (acc[p.group] ||= []).push(p);
    return acc;
  }, {});

  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  const [rsvp, setRsvpInput] = useState(event.rsvpUrl ?? "");
  const [photo, setPhoto] = useState(event.photoAlbumUrl ?? "");
  const [canva, setCanva] = useState(event.canvaUrl ?? "");
  const [seating, setSeating] = useState(event.seating ?? "");
  const [inviteSize, setInviteSize] = useState<string>("letter");
  const [exporting, setExporting] = useState(false);
  const [photoWallAccess, setPhotoWallAccess] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getPhotoWallAccess({ data: { eventId: event.id } })
      .then((r) => { if (!cancelled) setPhotoWallAccess(r.allowed); })
      .catch(() => { if (!cancelled) setPhotoWallAccess(false); });
    return () => { cancelled = true; };
  }, [event.id]);

  const wallUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/wall/${event.id}`;
  }, [event.id]);
  const wallUploadUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/wall/${event.id}/upload`;
  }, [event.id]);

  const saveField = (patch: Partial<KEvent>) => updateEvent(event.id, patch);

  const handleInvitePdf = async () => {
    setExporting(true);
    try {
      await exportInviteOnePagerPdf(event, { sizeId: inviteSize, inviteUrl });
    } finally {
      setExporting(false);
    }
  };


  return (
    <section className="rounded-2xl border border-ink/10 bg-card p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-ink">Share & integrations</h2>
          <p className="text-sm text-muted-foreground">One-click sharing across social, messaging, AI, and calendar tools.</p>
        </div>
      {typeof navigator !== "undefined" && "share" in navigator && (
          <button
            onClick={() => (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({ title: event.title, text, url: inviteUrl }).catch(() => undefined)}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
          >
            Share via device
          </button>
        )}
      </header>

      {/* Email invitations — server-triggered branded email to every guest */}
      {!hideEmailCard && <EmailInvitationsCard event={event} inviteUrl={inviteUrl} />}

      {/* Quick utilities */}
      <div className="mb-6">
        <div className="rounded-xl border border-ink/10 bg-secondary/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Shareable RSVP link</p>
          <div className="mt-2 flex gap-2">
            <input
              value={rsvp}
              onChange={(e) => setRsvpInput(e.target.value)}
              onBlur={() => saveField({ rsvpUrl: rsvp || undefined })}
              placeholder={inviteUrl}
              className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-card px-3 py-2 text-sm"
            />
            <button onClick={() => copy(inviteUrl, "link")} className="rounded-lg border border-ink/15 px-3 py-2 text-sm hover:bg-card">
              {copied === "link" ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Calendar buttons (Google, Apple, Outlook) live in <span className="font-medium">Reach &amp; calendar</span> so they aren't duplicated here.
          </p>
        </div>
      </div>


      {/* Platform grid */}
      <div className="space-y-5">
        {(["social", "messaging", "ai"] as Platform["group"][]).map((g) => (
          <div key={g}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{GROUP_LABEL[g]}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {grouped[g].map((p) => (
                <a
                  key={p.id}
                  href={p.href(ctx)}
                  target="_blank"
                  rel="noreferrer"
                  title={p.note}
                  onClick={(e) => {
                    if (!p.copyBeforeOpen) return;
                    // No web share intent exists for this platform — open it
                    // immediately (so the popup isn't blocked) and copy the
                    // invite text in parallel so it's ready to paste.
                    e.preventDefault();
                    window.open(p.href(ctx), "_blank", "noopener,noreferrer");
                    navigator.clipboard.writeText(text).then(
                      () => toast.success(`Invite text copied — paste it into ${p.name}`),
                      () => toast.error("Couldn't copy invite text"),
                    );
                  }}
                  className="group flex items-center justify-between rounded-lg border border-ink/10 bg-card px-3 py-2 text-sm font-medium text-ink/90 hover:border-ink/40 hover:bg-secondary/40"
                >
                  <span>{p.name}</span>
                  <span className="text-muted-foreground/70 group-hover:text-ink">↗</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Extras */}
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Canva design URL
            {event.canvaUrl && (
              <a href={event.canvaUrl} target="_blank" rel="noreferrer" className="normal-case text-ink/80 underline">
                View ↗
              </a>
            )}
          </span>
          <input
            value={canva}
            onChange={(e) => setCanva(e.target.value)}
            onBlur={() => saveField({ canvaUrl: canva || undefined })}
            placeholder="https://canva.com/design/..."
            className="mt-1 w-full rounded-lg border border-ink/15 bg-card px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">Shown to guests on the invite page as "View invitation design."</span>
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Shared photo album</span>
          <input
            value={photo}
            onChange={(e) => setPhoto(e.target.value)}
            onBlur={() => saveField({ photoAlbumUrl: photo || undefined })}
            placeholder="iCloud / Google Photos link"
            className="mt-1 w-full rounded-lg border border-ink/15 bg-card px-3 py-2 text-sm"
          />
        </label>
        {(event.seatingTables ?? []).length === 0 && (
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Seating notes</span>
            <textarea
              value={seating}
              onChange={(e) => setSeating(e.target.value)}
              onBlur={() => saveField({ seating: seating || undefined })}
              placeholder="Table 1: Smith family..."
              rows={2}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-card px-3 py-2 text-sm"
            />
          </label>
        )}
      </div>

      {/* Mailable invite PDF + QR */}
      <div className="mt-6 grid gap-4 rounded-xl border border-ink/10 bg-secondary/40 p-4 md:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-ink">Mailable invitation PDF</p>
          <p className="mt-1 text-xs text-muted-foreground">
            A clean one-pager with the event details + RSVP QR code — print at home and mail. Printing &amp; postage are on you.
          </p>
          <label className="mt-3 block text-xs">
            <span className="text-muted-foreground">Page size</span>
            <select
              value={inviteSize}
              onChange={(e) => setInviteSize(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-card px-2 py-2 text-sm"
            >
              {INVITE_PAGE_SIZES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}{s.note ? ` — ${s.note}` : ""}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleInvitePdf}
            disabled={exporting}
            className="mt-3 inline-block rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50"
          >
            {exporting ? "Building PDF…" : "Download invitation PDF"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <img
            alt="Event QR code"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(inviteUrl)}`}
            className="h-32 w-32 rounded-lg border border-ink/10 bg-card p-2"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Standalone QR code</p>
            <p className="text-xs text-muted-foreground">
              Print-ready 1200&nbsp;px PNG (~4&nbsp;in @ 300&nbsp;dpi). Drop into your own design.
            </p>
            <button
              type="button"
              onClick={() => downloadHiResQr(inviteUrl, `${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "event"}-qr.png`)}
              className="mt-2 inline-block rounded-lg border border-ink/15 bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              Download QR PNG
            </button>
          </div>
        </div>
      </div>

      {/* Photo Wall live gallery share */}
      {photoWallAccess === true && (
        <div className="mt-6 grid gap-4 rounded-xl border border-ink/10 bg-secondary/40 p-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-ink">Photo Wall live gallery</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Project the slideshow on a TV at your event and share the upload link so guests can add photos from their phones, no account needed.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={wallUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90"
              >
                Open slideshow ↗
              </a>
              <button
                type="button"
                onClick={() => copy(wallUploadUrl, "wall-upload")}
                className="inline-block rounded-lg border border-ink/15 bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
              >
                {copied === "wall-upload" ? "Copied" : "Copy guest upload link"}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {wallUploadUrl && (
              <img
                alt="Photo Wall upload QR code"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(wallUploadUrl)}`}
                className="h-32 w-32 rounded-lg border border-ink/10 bg-card p-2"
              />
            )}
            <p className="text-xs text-muted-foreground">Print this QR on table cards so guests can scan and upload.</p>
          </div>
        </div>
      )}
      {photoWallAccess === false && (
        <div className="mt-6 rounded-xl border border-ink/10 bg-secondary/40 p-4">
          <p className="text-sm font-medium text-ink">Photo Wall live gallery</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Included with the Atelier plan. Upgrade to project a live photo slideshow at your event.
          </p>
          <a href="/pricing?category=events&billing=monthly" className="mt-2 inline-block text-xs font-medium text-ink/80 underline">
            See Atelier →
          </a>
        </div>
      )}

    </section>
  );
}

export function EmailInvitationsCard({ event, inviteUrl: inviteUrlProp }: { event: KEvent; inviteUrl?: string }) {
  const inviteUrl = inviteUrlProp ?? (typeof window !== "undefined" ? `${window.location.origin}/invite/${event.id}` : "");
  const sendInvites = useServerFn(sendEventInvites);
  const [sending, setSending] = useState<null | "new" | "resend">(null);
  const defaultSenderName = buildSenderName({
    hostName: event.hosts?.[0]?.name,
    eventTitle: event.title,
  });
  const [senderName, setSenderName] = useState(event.senderName || "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Guest[]>([]);


  const withEmail = event.guests.filter((g) => !!g.email && g.email.includes("@"));

  const alreadyInvited = withEmail.filter((g) => !!g.invitedAt).length;
  const notYetInvited = withEmail.length - alreadyInvited;

  const send = async (resend: boolean) => {
    const target = resend ? alreadyInvited : notYetInvited;
    if (target === 0) return;

    // A bulk send is unrecoverable once it leaves, so the host always sees the
    // exact count and a sample of who is about to receive it first.
    const recipients = withEmail.filter((g) => (resend ? !!g.invitedAt : !g.invitedAt));
    const sample = recipients.slice(0, 5).map((g) => g.name || g.email).join(", ");
    const ok = await confirmDialog({
      title: resend
        ? `Resend the invitation to ${target} guest${target === 1 ? "" : "s"}?`
        : `Send the invitation to ${target} guest${target === 1 ? "" : "s"}?`,
      body: `${sample}${recipients.length > 5 ? ` and ${recipients.length - 5} more` : ""}. Each guest keeps their own personal link, so any answer they already gave stays attached. Email cannot be recalled once sent.`,
      confirmLabel: resend ? `Resend to ${target}` : `Send to ${target}`,
      tone: "info",
    });
    if (!ok) return;

    setSending(resend ? "resend" : "new");
    const t = toast.loading(
      resend
        ? `Resending to ${alreadyInvited} guest${alreadyInvited === 1 ? "" : "s"}…`
        : `Sending to ${notYetInvited} guest${notYetInvited === 1 ? "" : "s"}…`,
    );
    try {
      const r = await sendInvites({ data: { eventId: event.id, resend } });
      toast.dismiss(t);
      const parts: string[] = [];
      if (r.sent > 0) parts.push(`✅ ${r.sent} sent`);
      if (r.skipped > 0) parts.push(`${r.skipped} skipped`);
      if (r.failed > 0) parts.push(`${r.failed} failed`);
      if (r.sent > 0) {
        toast.success(parts.join(" · "));
        // Mirror server-side invitedAt into local state so UI counts refresh.
        const now = new Date().toISOString();
        const nextGuests = event.guests.map((g) =>
          withEmail.some((w) => w.id === g.id) && (resend || !g.invitedAt)
            ? { ...g, invitedAt: now }
            : g,
        );
        updateEvent(event.id, { guests: nextGuests });
      } else if (r.failed > 0) {
        toast.error(`Couldn't send any invitations (${parts.join(", ") || "no eligible guests"}).`);
      } else {
        toast(parts.join(" · ") || "Nothing to send.");
      }
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err?.message || "Failed to send invitations.");
    } finally {
      setSending(null);
    }
  };

  /**
   * Send or resend to a hand-picked audience (by RSVP answer). Uses the same
   * server function with explicit guest ids, so each guest keeps their own
   * personal link and every send is logged the same way.
   */
  const sendSelected = async () => {
    if (selected.length === 0) return;
    const ok = await confirmDialog({
      title: `Email the invitation to ${selected.length} guest${selected.length === 1 ? "" : "s"}?`,
      body: `${audienceSummary(selected)}. Each guest keeps their own personal link, so any answer they already gave stays attached. Email cannot be recalled once sent.`,
      confirmLabel: `Send to ${selected.length}`,
      tone: "info",
    });
    if (!ok) return;
    setSending("resend");
    const t = toast.loading(`Sending to ${selected.length} guest${selected.length === 1 ? "" : "s"}…`);
    try {
      const r = await sendInvites({
        data: { eventId: event.id, resend: true, guestIds: selected.map((g) => g.id) },
      });
      toast.dismiss(t);
      if (r.sent > 0) {
        toast.success(`✅ ${r.sent} sent${r.skipped ? ` · ${r.skipped} skipped` : ""}${r.failed ? ` · ${r.failed} failed` : ""}`);
        const now = new Date().toISOString();
        const chosen = new Set(selected.map((g) => g.id));
        updateEvent(event.id, {
          guests: event.guests.map((g) => (chosen.has(g.id) ? { ...g, invitedAt: now } : g)),
        });
      } else {
        toast.error("Couldn't send to anyone in that group. Check their email addresses and try again.");
      }
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err?.message || "Failed to send invitations.");
    } finally {
      setSending(null);
    }
  };

  // Email invitations are included on every plan, Postcard included, so there
  // is no free-tier fallback card here any more.


  return (
    <div className="mb-6 rounded-xl border border-[#5c1d1d]/20 bg-gradient-to-br from-[#fff7f4] to-[#fef0ea] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#5c1d1d]">Email invitations</p>
          <h3 className="mt-1 text-base font-semibold text-neutral-900">
            Send the invite straight to your guests' inboxes
          </h3>

          <p className="mt-1 text-xs text-neutral-600">
            Beautifully branded email with your event details and a big RSVP button linking to{" "}
            <span className="break-all text-neutral-800">{inviteUrl}</span>.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
        <span className="rounded-full bg-white px-2 py-1 ring-1 ring-neutral-200">
          {withEmail.length} of {event.guests.length} guests have an email
        </span>
        {alreadyInvited > 0 && (
          <span className="rounded-full bg-white px-2 py-1 ring-1 ring-neutral-200">
            {alreadyInvited} already invited
          </span>
        )}
      </div>

      {/* Sender display name. Guests do not recognise the platform name, so the
          default leads with the host and the occasion. */}
      <div className="mt-3 rounded-lg bg-white/70 p-3 ring-1 ring-neutral-200">
        <label htmlFor="sender-name" className="text-xs font-semibold text-neutral-800">
          Who the email comes from
        </label>
        <input
          id="sender-name"
          type="text"
          value={senderName}
          maxLength={64}
          placeholder={defaultSenderName}
          onChange={(e) => setSenderName(e.target.value)}
          onBlur={() => {
            const next = senderName.trim();
            if (next !== (event.senderName || "")) {
              updateEvent(event.id, { senderName: next || undefined });
            }
          }}
          className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
        />
        <p className="mt-1 text-xs text-neutral-600">
          Guests will see <span className="font-medium text-neutral-800">{senderName.trim() || defaultSenderName}</span> as the
          sender. Leading with your name and the occasion is the difference between opened and deleted.
        </p>
      </div>



      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={sending !== null || notYetInvited === 0}
          onClick={() => send(false)}
          className="rounded-full bg-[#5c1d1d] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#4a1616] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending === "new"
            ? "Sending…"
            : notYetInvited === 0
              ? withEmail.length === 0
                ? "No guests with email yet"
                : "All guests invited"
              : `Send to ${notYetInvited} guest${notYetInvited === 1 ? "" : "s"}`}
        </button>
        {alreadyInvited > 0 && (
          <button
            type="button"
            disabled={sending !== null}
            onClick={() => send(true)}
            className="rounded-full border border-[#5c1d1d]/30 bg-white px-4 py-2 text-sm font-medium text-[#5c1d1d] hover:bg-[#fdf2ee] disabled:opacity-50"
          >
            {sending === "resend" ? "Resending…" : `Resend to ${alreadyInvited}`}
          </button>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="rounded-full border border-[#5c1d1d]/30 bg-white px-4 py-2 text-sm font-medium text-[#5c1d1d] hover:bg-[#fdf2ee]"
        >
          {pickerOpen ? "Hide who gets it" : "Choose who gets it"}
        </button>
      </div>

      {pickerOpen && (
        <div className="mt-3">
          <GuestAudiencePicker
            guests={event.guests}
            channel="email"
            defaultFilter="unanswered"
            onChange={setSelected}
          />
          <button
            type="button"
            disabled={sending !== null || selected.length === 0}
            onClick={() => void sendSelected()}
            className="mt-3 rounded-full bg-[#5c1d1d] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#4a1616] disabled:opacity-50"
          >
            {sending === "resend"
              ? "Sending…"
              : selected.length === 0
                ? "Pick at least one guest"
                : `Email ${selected.length} selected guest${selected.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {withEmail.length < event.guests.length && (
        <p className="mt-2 text-[11px] text-neutral-500">
          {event.guests.length - withEmail.length} guest
          {event.guests.length - withEmail.length === 1 ? "" : "s"} don't have an email on file — add one on the Guests step to include them.
        </p>
      )}
    </div>
  );
}


