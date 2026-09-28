import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  rememberEventSnapshot,
  refreshEventsFromCloud,
  type KEvent,
} from "@/lib/events-store";

/**
 * Subscribe to live updates for a single event row. Any change made by the
 * host, a co-host, or an admin is pushed to every viewer within ~1s — no
 * page reload, no manual refetch.
 *
 * - UPDATE: merges the fresh `data` payload into the local events store
 *   (so `useEvent(id)` re-renders) and calls `onChange` with the new event.
 * - DELETE: calls `onChange(null)` so guest pages can show a "cancelled"
 *   state instead of a 404 flash.
 */
export function useEventRealtime(
  eventId: string | undefined,
  onChange?: (event: KEvent | null) => void,
) {
  useEffect(() => {
    if (!eventId) return;
    const channel = supabase
      .channel(`event:${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `id=eq.${eventId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            onChange?.(null);
            return;
          }
          const row = (payload.new ?? {}) as { data?: unknown; archived_at?: string | null };
          if (row.archived_at) {
            onChange?.(null);
            return;
          }
          const next = row.data as KEvent | undefined;
          if (!next) return;
          rememberEventSnapshot(next);
          onChange?.(next);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, onChange]);
}

/**
 * Subscribe to live updates for the signed-in user's events list. On any
 * INSERT/UPDATE/DELETE the events store re-hydrates from the cloud so the
 * list reflects the change immediately.
 *
 * RLS already restricts which rows the user can see, so we get only the
 * events that belong to (or are shared with) the current user.
 */
export function useMyEventsRealtime() {
  useEffect(() => {
    let cancelled = false;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (cancelled || !uid) return;
      channelRef = supabase
        .channel(`events:user:${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "events", filter: `user_id=eq.${uid}` },
          () => {
            refreshEventsFromCloud();
          },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channelRef) supabase.removeChannel(channelRef);
    };
  }, []);
}
