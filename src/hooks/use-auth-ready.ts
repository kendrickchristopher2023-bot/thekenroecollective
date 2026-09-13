import { useEffect, useSyncExternalStore } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthSnapshot = {
  ready: boolean;
  session: Session | null;
  user: User | null;
};

const EMPTY: AuthSnapshot = { ready: false, session: null, user: null };

let snapshot: AuthSnapshot = EMPTY;
let started = false;
const listeners = new Set<() => void>();

function publish(next: AuthSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function startAuthListener() {
  if (started || typeof window === "undefined") return;
  started = true;

  supabase.auth
    .getSession()
    .then(({ data }) => {
      const session = data.session ?? null;
      publish({ ready: true, session, user: session?.user ?? null });
    })
    .catch(() => publish({ ready: true, session: null, user: null }));

  supabase.auth.onAuthStateChange((event, session) => {
    // Only react to identity transitions. TOKEN_REFRESHED / INITIAL_SESSION
    // fire frequently (tab focus, hourly refresh) and would otherwise cause
    // every consumer to re-render and refetch — making forms flicker.
    if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
    const nextUser = session?.user ?? null;
    if (snapshot.ready && snapshot.user?.id === nextUser?.id) return;
    publish({ ready: true, session, user: nextUser });
  });
}

function subscribe(listener: () => void) {
  startAuthListener();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuthReady(): AuthSnapshot {
  useEffect(() => {
    startAuthListener();
  }, []);

  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}