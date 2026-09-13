import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useLocation } from "@tanstack/react-router";
import { X, AlertTriangle, MapPin, Calendar, Megaphone } from "lucide-react";
import {
  listActiveAnnouncements,
  dismissAnnouncement,
  listMyDismissals,
  listAdminPreviewAnnouncements,
} from "@/lib/announcements.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatTimestamp } from "@/lib/datetime";
import { captureAppError } from "@/lib/error-capture-client";

type Announcement = {
  id: string;
  type: "venue_change" | "cancellation" | "date_change" | "general";
  title: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
  audience: "all_users" | "event";
  event_id: string | null;
  event_title: string | null;
  sent_at: string | null;
  status?: "draft" | "scheduled" | "sent";
  scheduled_for?: string | null;
  image_url?: string | null;
  _preview?: boolean;
};

const STYLES: Record<Announcement["type"], { bg: string; ring: string; icon: typeof Megaphone; label: string }> = {
  venue_change: { bg: "bg-amber-50", ring: "ring-amber-300/60", icon: MapPin, label: "Venue change" },
  cancellation: { bg: "bg-rose-50", ring: "ring-rose-300/60", icon: AlertTriangle, label: "Cancellation" },
  date_change:  { bg: "bg-sky-50",   ring: "ring-sky-300/60",   icon: Calendar,       label: "Date change" },
  general:      { bg: "bg-card",     ring: "ring-ink/10",       icon: Megaphone,      label: "Update" },
};

const LOCAL_KEY = "kcc.dismissedAnnouncements";

function loadLocalDismissed(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]"); } catch { return []; }
}
function saveLocalDismissed(ids: string[]) {
  if (typeof window !== "undefined") localStorage.setItem(LOCAL_KEY, JSON.stringify(ids));
}

// Which event (if any) the current page is about. Used to ask the server for
// only that event's announcements instead of every recent one.
function eventScopeFromPath(path: string): { eventId?: string; slug?: string } {
  const m = /^\/(events|invite|gift|wall|checkin)\/([^/]+)/.exec(path);
  if (m) return { eventId: decodeURIComponent(m[2]!) };
  const s = /^\/e\/([^/]+)/.exec(path);
  if (s) return { slug: decodeURIComponent(s[1]!) };
  return {};
}

export function AnnouncementBanner() {
  const fetchActive = useServerFn(listActiveAnnouncements);
  const fetchMine = useServerFn(listMyDismissals);
  const fetchAdminPreview = useServerFn(listAdminPreviewAnnouncements);
  const dismiss = useServerFn(dismissAnnouncement);
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState(false);

  const pathname = useLocation({ select: (l) => l.pathname });

  useEffect(() => {
    let on = true;
    (async () => {
      // This banner mounts on every route, including public pages like
      // "/" and "/sms-terms". An uncaught failure here surfaced as an
      // unhandled rejection ("Failed to fetch" / "Seroval Error (step: 3)")
      // attributed to whatever page the visitor happened to be on, so the
      // fetch is contained and attributed here instead.
      try {
        const scope = eventScopeFromPath(pathname);
        const publicItems = ((await fetchActive({ data: scope })) as Announcement[]) ?? [];
        const { data: session } = await supabase.auth.getSession();
        const isIn = !!session.session;
        let previewItems: Announcement[] = [];
        if (isIn) {
          try {
            const rows = ((await fetchAdminPreview()) as Announcement[]) ?? [];
            previewItems = rows.map((r) => ({ ...r, _preview: true }));
          } catch { /* not admin / ignore */ }
        }
        if (!on) return;
        // Preview first so admins see drafts above published items.
        setItems([...previewItems, ...publicItems]);
        setSignedIn(isIn);
        if (isIn) {
          try {
            const ids = (await fetchMine()) as string[];
            setDismissed(new Set(ids));
          } catch { /* ignore */ }
        } else {
          setDismissed(new Set(loadLocalDismissed()));
        }
      } catch (e) {
        // Announcements are non-essential: the page keeps working without them.
        if (!on) return;
        setDismissed(new Set(loadLocalDismissed()));
        captureAppError(e, { source: "announcement-banner" });
      }
    })();
    return () => { on = false; };
  }, [fetchActive, fetchMine, fetchAdminPreview, pathname]);

  const path = pathname;
  const pathVisible = items.filter((a) => {
    if (dismissed.has(a.id)) return false;
    if (a.audience === "event" && a.event_id) {
      // Event-scoped announcements only appear on pages actually tied to that
      // event — never on home or the events list, where unrelated visitors
      // would otherwise see banners for someone else's event. The server also
      // only returns rows for the event in the current URL; this is defense in
      // depth (and still covers admin drafts, which aren't event-filtered).
      const eid = a.event_id;
      return (
        path.startsWith(`/events/${eid}`) ||
        path.startsWith(`/invite/${eid}`) ||
        path.startsWith(`/gift/${eid}`) ||
        path.startsWith(`/wall/${eid}`) ||
        path.startsWith(`/checkin/${eid}`) ||
        // /e/<slug> resolves to a single event server-side; the id isn't in
        // the URL, so event banners are allowed there.
        path.startsWith("/e/")
      );
    }
    return true;
  });

  // "Latest wins" per (audience, event, type): a newer venue_change for the
  // same event supersedes the older one, while a general or date_change
  // announcement for that same event still shows alongside it.
  const seen = new Set<string>();
  const visible = pathVisible.filter((a) => {
    // Admin drafts/scheduled previews are composer state, not published
    // updates — never dedupe them against each other or against live items.
    if (a._preview) return true;
    const key = `${a.audience}:${a.event_id ?? "all"}:${a.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (visible.length === 0) return null;

  async function onDismiss(a: Announcement) {
    setDismissed((prev) => new Set(prev).add(a.id));
    // Don't persist dismissals for admin preview items — they shouldn't
    // pollute the per-user dismissal table for drafts.
    if (a._preview) return;
    if (signedIn) {
      try { await dismiss({ data: { announcement_id: a.id } }); } catch { /* ignore */ }
    } else {
      saveLocalDismissed([...loadLocalDismissed(), a.id]);
    }
  }

  return (
    <div className="relative z-40 w-full space-y-1 px-2 pt-1.5">
      {visible.map((a) => {
        const s = STYLES[a.type];
        const Icon = s.icon;
        const isPreview = !!a._preview;
        const previewLabel = a.status === "scheduled" && a.scheduled_for
          ? `Scheduled for ${formatTimestamp((a.scheduled_for))} — only admins see this`
          : "Draft — only admins see this";
        return (
          <div
            key={a.id}
            className={`mx-auto flex max-w-5xl items-start gap-2 rounded-xl ${s.bg} px-3 py-2 text-sm shadow-sm backdrop-blur ${
              isPreview ? "border border-dashed border-velvet/50 ring-0 opacity-95" : `ring-1 ${s.ring}`
            }`}
            role="status"
          >
            <Icon className="mt-0 h-3.5 w-3.5 shrink-0 text-ink/70" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink/60">{s.label}</span>
                {a.event_title && (
                  <span className="text-[10px] text-ink/50">· {a.event_title}</span>
                )}
                {isPreview && (
                  <span className="ml-1 rounded-full bg-velvet/10 px-2 py-0.5 text-[10px] font-medium text-velvet">
                    {previewLabel}
                  </span>
                )}
              </div>
              <div className="mt-0 font-medium text-ink">{a.title}</div>
              <p className="mt-0 whitespace-pre-wrap text-[12px] leading-snug text-ink/75">{a.body}</p>
              {a.link_url && (
                <div className="mt-1.5">
                  <a
                    href={a.link_url}
                    target={a.link_url.startsWith("http") ? "_blank" : undefined}
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full bg-velvet px-3.5 py-1 text-[12px] font-medium text-white shadow-sm transition hover:bg-velvet/90 focus:outline-none focus:ring-2 focus:ring-velvet/40"
                  >
                    {a.link_label || "Learn more"}
                  </a>
                </div>
              )}
            </div>

            <button
              onClick={() => onDismiss(a)}
              aria-label="Dismiss"
              className="rounded-md p-1 text-ink/50 hover:bg-black/5 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
