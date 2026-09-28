import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listSmsOptOuts } from "@/lib/sms.functions";
import { supabase } from "@/integrations/supabase/client";

export function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/**
 * Loads the set of digit-only phone numbers that have opted out of SMS.
 * The server function requires an authenticated session, so signed-out
 * visitors skip the call entirely instead of throwing "Unauthorized".
 */
export function useSmsOptOutSet(): Set<string> {
  const list = useServerFn(listSmsOptOuts);
  const [set, setSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive || !data.session) return;
      try {
        const r = await list();
        if (alive) setSet(new Set(r.phones));
      } catch {
        /* opt-out list is advisory; ignore failures */
      }
    })();
    return () => {
      alive = false;
    };
  }, [list]);
  return set;
}

