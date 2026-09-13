import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  listAdminNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AdminNotificationItem,
} from "@/lib/notifications.functions";
import {
  listHostNotifications,
  markHostNotificationRead,
} from "@/lib/host-notifications.functions";
import { formatTimestamp } from "@/lib/datetime";

export function AdminNotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotificationItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Owners and admins also host their own events, so their bell carries both
  // the admin feed and their host-side join requests.
  const load = () => {
    Promise.all([
      listAdminNotifications().catch(() => [] as AdminNotificationItem[]),
      listHostNotifications().catch(() => [] as any[]),
    ])
      .then(([admin, host]) => {
        const merged: AdminNotificationItem[] = [
          ...admin,
          ...host.map((h: any) => ({
            id: `host:${h.id}`,
            kind: h.kind,
            title: h.title,
            body: h.body,
            link: h.link,
            created_at: h.created_at,
            read: !!h.read,
          })),
        ];
        merged.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        setItems(merged);
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const unread = items.filter((i) => !i.read).length;

  const handleItemClick = async (id: string) => {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, read: true } : i)));
    try {
      if (id.startsWith("host:")) {
        await markHostNotificationRead({ data: { id: id.slice(5) } });
        return;
      }
      await markNotificationRead({ data: { id } });
    } catch {
      // ignore
    }
  };

  const handleMarkAll = async () => {
    const hostIds = items.filter((i) => !i.read && i.id.startsWith("host:")).map((i) => i.id);
    setItems((cur) => cur.map((i) => ({ ...i, read: true })));
    try {
      for (const id of hostIds) {
        await markHostNotificationRead({ data: { id: id.slice(5) } }).catch(() => {});
      }
      await markAllNotificationsRead();
    } catch {
      // ignore
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-full text-ink/70 hover:bg-secondary hover:text-ink"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-velvet ring-2 ring-paper"
            aria-label={`${unread} unread notifications`}
          />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 sm:hidden" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-2 top-16 z-50 max-h-[80vh] overflow-hidden rounded-2xl bg-paper shadow-xl ring-1 ring-ink/10 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">

          <div className="flex items-center justify-between border-b border-ink/5 px-4 py-3">
            <div className="text-sm font-semibold text-ink">Notifications</div>
            {unread > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-[11px] font-medium text-velvet hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                You're all caught up.
              </p>
            ) : (
              items.map((n) => {
                const body = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium text-ink line-clamp-2 min-w-0 break-anywhere">{n.title}</div>
                      {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-velvet" />}
                    </div>
                    {n.body && (
                      <div className="mt-1 text-xs text-muted-foreground line-clamp-2 break-anywhere">{n.body}</div>
                    )}

                    <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {formatTimestamp((n.created_at))}
                    </div>
                  </>
                );
                const className = `block w-full border-b border-ink/5 px-4 py-3 text-left transition hover:bg-secondary/50 ${
                  n.read ? "opacity-70" : ""
                }`;
                return n.link ? (
                  <Link
                    key={n.id}
                    to={n.link}
                    onClick={() => {
                      handleItemClick(n.id);
                      setOpen(false);
                    }}
                    className={className}
                  >
                    {body}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    onClick={() => handleItemClick(n.id)}
                    className={className}
                  >
                    {body}
                  </button>
                );
              })
            )}
          </div>
        </div>
        </>
      )}

    </div>
  );
}
