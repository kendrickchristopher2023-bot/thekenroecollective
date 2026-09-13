import { useEffect, useMemo, useState } from "react";
import { fetchGuestNoteCounts, type GuestNoteCounts } from "@/lib/guest-notes.functions";

const EMPTY: GuestNoteCounts = { unreadComments: 0, comments: 0, wishes: 0 };

/**
 * Guest note counts (unread invitation comments + well wishes) for a set of
 * events. Read-only badge data, so a quiet failure just means no badge.
 */
export function useGuestNoteCounts(eventIds: string[]): Record<string, GuestNoteCounts> {
  const key = useMemo(() => [...new Set(eventIds.filter(Boolean))].sort().join(","), [eventIds]);
  const [counts, setCounts] = useState<Record<string, GuestNoteCounts>>({});

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setCounts({});
      return;
    }
    let cancelled = false;
    fetchGuestNoteCounts({ data: { eventIds: ids } })
      .then((res) => {
        if (!cancelled) setCounts(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  return counts;
}

export function useGuestNoteCount(eventId: string): GuestNoteCounts {
  const ids = useMemo(() => (eventId ? [eventId] : []), [eventId]);
  const counts = useGuestNoteCounts(ids);
  return counts[eventId] ?? EMPTY;
}
