import { timingSafeEqual } from "crypto";

let _cachedSecret: string | null = null;

/**
 * Fetch the cron shared secret from Supabase Vault via a security-definer RPC.
 * Cached per-worker instance. Returns null if unavailable.
 */
export async function getCronSharedSecret(): Promise<string | null> {
  if (_cachedSecret) return _cachedSecret;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("get_cron_shared_secret" as never);
    if (error || !data || typeof data !== "string") return null;
    _cachedSecret = data;
    return _cachedSecret;
  } catch {
    return null;
  }
}

/**
 * Verify the `x-cron-secret` header against the vault-managed shared secret
 * using a constant-time comparison. Used by /api/public/hooks/* endpoints
 * so anyone with the publishable anon key cannot invoke maintenance jobs.
 */
export async function verifyCronSecret(request: Request): Promise<boolean> {
  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!provided) return false;
  const expected = await getCronSharedSecret();
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
