// Group eCards — server-only helpers (never imported by client code directly).
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Publishable-key client for the public contribution/reveal paths. All public
 * reads and writes go through security-definer RPCs, so RLS never needs an
 * anon policy on the eCards tables.
 */
export function ecardPublicClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Unguessable share code (~80 bits). */
export function makeEcardSlug(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
