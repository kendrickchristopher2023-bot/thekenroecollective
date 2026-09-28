import { useEffect, useMemo, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bell, X, MapPin, AlertTriangle, Calendar, Megaphone, UserPlus } from "lucide-react";
import { useAuthReady } from "@/hooks/use-auth-ready";
import {
  dismissProductUpdate,
  listMyProductUpdates,
} from "@/lib/product-updates.functions";
import {
  dismissAnnouncement,
  listMyInboxAnnouncements,
} from "@/lib/announcements.functions";
import {
  dismissHostNotification,
  listHostNotifications,
  markHostNotificationRead,
} from "@/lib/host-notifications.functions";
import { formatStampDate } from "@/lib/datetime";

type InboxItem = {
  key: string;              // unique across sources
  id: string;
  kind: "update" | "announcement" | "host";
  title: string;
  emoji?: string | null;
  icon?: typeof Bell;
  body_html?: string;
  body_text?: string;
  cover_image_url?: string | null;
  cta_label: string | null;
  cta_url: string | null;
  published_at: string | null;
  dismissed: boolean;
  event_title?: string | null;
};

const ANN_ICON: Record<string, typeof Megaphone> = {
  venue_change: MapPin,
  cancellation: AlertTriangle,
  date_change: Calendar,
  general: Megaphone,
};
const ANN_LABEL: Record<string, string> = {
  venue_change: "Venue change",
  cancellation: "Cancellation",
  date_change: "Date change",
  general: "Update",
};

export function WhatsNewBell() {
  const fetchUpdates = useServerFn(listMyProductUpdates);
  const fetchAnnouncements = useServerFn(listMyInboxAnnouncements);
  const dismissUpdate = useServerFn(dismissProductUpdate);
  const dismissAnn = useServerFn(dismissAnnouncement);
  const fetchHost = useServerFn(listHostNotifications);
  const markHost = useServerFn(markHostNotificationRead);
  const dropHost = useServerFn(dismissHostNotification);
  const { ready, user } = useAuthReady();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const popRef = useRef<HTMLDivElement | null>(null);
  const fetchUpdatesRef = useRef(fetchUpdates);
  const fetchAnnouncementsRef = useRef(fetchAnnouncements);
  const fetchHostRef = useRef(fetchHost);
  fetchUpdatesRef.current = fetchUpdates;
  fetchAnnouncementsRef.current = fetchAnnouncements;
  fetchHostRef.current = fetchHost;

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    if (!user) {
      setItems([]);
      setOpen(false);
      return () => { alive = false; };
    }
    (async () => {
      try {
        const [updates, anns, hostNotes] = await Promise.all([
          fetchUpdatesRef.current().catch(() => []) as Promise<any[]>,
          fetchAnnouncementsRef.current().catch(() => []) as Promise<any[]>,
          fetchHostRef.current().catch(() => []) as Promise<any[]>,
        ]);
        if (!alive) return;
        const merged: InboxItem[] = [
          ...(updates ?? []).map((u: any) => ({
            key: `update:${u.id}`,
            id: u.id,
            kind: "update" as const,
            title: u.title,
            emoji: u.emoji,
            body_html: u.body_html,
            cover_image_url: u.cover_image_url,
            cta_label: u.cta_label,
            cta_url: u.cta_url,
            published_at: u.published_at,
            dismissed: !!u.dismissed,
          })),
          ...(anns ?? []).map((a: any) => ({
            key: `announcement:${a.id}`,
            id: a.id,
            kind: "announcement" as const,
            title: a.title,
            icon: ANN_ICON[a.type] ?? Megaphone,
            body_text: a.body,
            cover_image_url: a.image_url,
            cta_label: a.link_label,
            cta_url: a.link_url,
            published_at: a.sent_at,
            dismissed: !!a.dismissed,
            event_title: a.event_title,
          })),
          ...(hostNotes ?? []).map((h: any) => ({
            key: `host:${h.id}`,
            id: h.id,
            kind: "host" as const,
            title: h.title,
            icon: UserPlus,
            body_text: h.body ?? "",
            cover_image_url: null,
            cta_label: "Review request",
            cta_url: h.link,
            published_at: h.created_at,
            dismissed: !!h.read,
          })),
        ];
        merged.sort((a, b) => {
          const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
          const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
          return tb - ta;
        });
        setItems(merged);
      } catch { /* ignore */ }
    })();
    return () => {
      alive = false;
    };
  }, [ready, user?.id]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const unread = useMemo(() => items.filter((u) => !u.dismissed), [items]);

  if (!ready || !user) return null;

  const markRead = async (it: InboxItem) => {
    setItems((curr) => curr.map((u) => (u.key === it.key ? { ...u, dismissed: true } : u)));
    try {
      if (it.kind === "update") {
        await dismissUpdate({ data: { id: it.id } });
      } else if (it.kind === "host") {
        await markHost({ data: { id: it.id } });
      } else {
        await dismissAnn({ data: { announcement_id: it.id } });
      }
    } catch { /* ignore */ }
  };

  const removeItem = async (it: InboxItem) => {
    setItems((curr) => curr.filter((u) => u.key !== it.key));
    try {
      if (it.kind === "update") {
        await dismissUpdate({ data: { id: it.id } });
      } else if (it.kind === "host") {
        await dropHost({ data: { id: it.id } });
      } else {
        await dismissAnn({ data: { announcement_id: it.id } });
      }
    } catch { /* ignore */ }
  };


  const markAllRead = async () => {
    for (const u of unread) await markRead(u);
  };

  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-ink/70 hover:bg-secondary"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread.length > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-velvet ring-2 ring-paper"
            aria-label={`${unread.length} unread notifications`}
          />
        )}
      </button>

      {open && (
        <>
        <div className="fixed inset-0 z-40 bg-black/30 sm:hidden" onClick={() => setOpen(false)} />
        <div className="fixed inset-x-2 top-16 z-50 max-h-[80vh] overflow-hidden rounded-2xl bg-paper shadow-xl ring-1 ring-ink/10 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[min(420px,90vw)]">

          <div className="flex items-center justify-between border-b border-ink/5 px-4 py-3">
            <div className="font-serif text-base">Notifications</div>
            {unread.length > 0 && (
              <button type="button" onClick={markAllRead} className="text-[11px] text-velvet hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[70vh] overflow-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                Nothing new right now. Check back soon.
              </div>
            ) : (
              <ul className="divide-y divide-ink/5">
                {items.map((u) => {
                  const Icon = u.icon;
                  return (
                  <li key={u.key} className={`p-4 ${u.dismissed ? "opacity-70" : "bg-velvet/[0.03]"}`}>
                    <div className="flex items-start gap-3">
                      <div className="text-xl leading-none">
                        {Icon ? <Icon className="h-5 w-5 text-ink/70" /> : (u.emoji || "📣")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-serif text-sm">{u.title}</h4>
                          {!u.dismissed && (
                            <span className="rounded-full bg-velvet px-1.5 py-0.5 text-[9px] font-medium text-white">NEW</span>
                          )}
                          {u.kind === "host" && (
                            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-ink/60">
                              Join request
                            </span>
                          )}
                          {u.kind === "announcement" && (
                            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-ink/60">
                              Announcement
                            </span>
                          )}
                        </div>
                        {(u.event_title || u.published_at) && (
                          <div className="text-[10px] text-muted-foreground">
                            {u.event_title ? `${u.event_title} · ` : ""}
                            {u.published_at ? formatStampDate((u.published_at)) : ""}
                          </div>
                        )}
                        {u.cover_image_url && (
                          <img
                            src={u.cover_image_url}
                            alt={u.title ? `${u.title} cover` : "Update cover image"}
                            className="mt-2 max-h-40 w-full rounded-lg object-cover"
                          />
                        )}
                        {u.body_html && (
                          <div
                            className="rte-content prose-sm mt-2 text-xs text-ink/85"
                            dangerouslySetInnerHTML={{ __html: u.body_html }}
                          />
                        )}
                        {u.body_text && (
                          <p className="mt-2 whitespace-pre-wrap text-xs text-ink/85">{u.body_text}</p>
                        )}
                        <div className="mt-3 flex items-center gap-2">
                          {u.cta_url && (
                            u.cta_url.startsWith("/") ? (
                              /* Internal links go through the router so opening a
                                 join request never reloads the app. */
                              <Link
                                to={u.cta_url}
                                onClick={() => {
                                  markRead(u);
                                  setOpen(false);
                                }}
                                className="rounded-full bg-velvet px-3 py-1.5 text-[11px] font-medium text-white hover:bg-velvet/90 focus:outline-none focus:ring-2 focus:ring-velvet/40"
                              >
                                {u.cta_label || "Learn more"}
                              </Link>
                            ) : (
                              <a
                                href={u.cta_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => markRead(u)}
                                className="rounded-full bg-velvet px-3 py-1.5 text-[11px] font-medium text-white hover:bg-velvet/90 focus:outline-none focus:ring-2 focus:ring-velvet/40"
                              >
                                {u.cta_label || "Learn more"}
                              </a>
                            )
                          )}
                          {!u.dismissed && (
                            <button
                              type="button"
                              onClick={() => markRead(u)}
                              className="rounded-full bg-secondary px-3 py-1 text-[11px]"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(u)}

                        className="text-muted-foreground hover:text-ink"
                        title="Dismiss"
                        aria-label="Dismiss"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-ink/5 px-4 py-2.5 text-center">
            <Link to="/whats-new" onClick={() => setOpen(false)} className="text-[11px] font-medium text-velvet hover:underline">
              See all updates →
            </Link>
          </div>
        </div>
        </>
      )}

      <style>{`
        .rte-content p { margin: 0 0 0.4em; }
        .rte-content ul { list-style: disc; padding-left: 1.1rem; margin: 0 0 0.4em; }
        .rte-content ol { list-style: decimal; padding-left: 1.1rem; margin: 0 0 0.4em; }
        .rte-content img { max-width: 100%; border-radius: 10px; margin: 6px 0; }
        .rte-content a { color: #7c2d6b; text-decoration: underline; }
        .rte-content h3 { font-weight: 600; font-size: 0.85rem; margin: 0.3em 0; }
        .rte-content blockquote { border-left: 2px solid rgb(0 0 0 / 0.15); padding-left: 0.5rem; font-style: italic; color: rgb(0 0 0 / 0.7); }
      `}</style>
    </div>
  );
}
