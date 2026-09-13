// Singleton owner check. Avoids each consumer refetching meIsOwner.
import { useEffect, useState } from "react";
import { useAuthReady } from "@/hooks/use-auth-ready";
import { meIsOwner } from "@/lib/pricing.functions";

let cached: { userId: string | null; isOwner: boolean } | null = null;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<(v: boolean) => void>();

async function load(userId: string): Promise<boolean> {
  if (cached && cached.userId === userId) return cached.isOwner;
  if (inflight) return inflight;
  inflight = meIsOwner()
    .then((r) => {
      cached = { userId, isOwner: !!r.isOwner };
      listeners.forEach((l) => l(cached!.isOwner));
      return cached.isOwner;
    })
    .catch(() => {
      cached = { userId, isOwner: false };
      return false;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useIsOwner(): { ready: boolean; isOwner: boolean } {
  const { ready, user } = useAuthReady();
  const [isOwner, setIsOwner] = useState<boolean>(
    cached && cached.userId === (user?.id ?? null) ? cached.isOwner : false,
  );
  const [checked, setChecked] = useState<boolean>(
    !!(cached && cached.userId === (user?.id ?? null)),
  );

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      cached = { userId: null, isOwner: false };
      setIsOwner(false);
      setChecked(true);
      return;
    }
    let alive = true;
    load(user.id).then((v) => {
      if (!alive) return;
      setIsOwner(v);
      setChecked(true);
    });
    const sub = (v: boolean) => alive && setIsOwner(v);
    listeners.add(sub);
    return () => {
      alive = false;
      listeners.delete(sub);
    };
  }, [ready, user?.id]);

  return { ready: ready && checked, isOwner };
}
