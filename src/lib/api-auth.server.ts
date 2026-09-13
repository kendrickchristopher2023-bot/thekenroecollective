/**
 * Bearer-token auth for raw server routes under src/routes/api/**.
 *
 * `createServerFn` gets this for free via `requireSupabaseAuth`, but file
 * routes handle raw HTTP and need to verify the Supabase access token
 * themselves. Used to keep billed third-party proxies (Google Places) from
 * being callable by anonymous traffic.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface BearerUser {
  userId: string;
}

/** Verify the request's `Authorization: Bearer <supabase access token>`.
 *  Returns the user id, or null when missing/invalid. */
export async function verifyBearerUser(request: Request): Promise<BearerUser | null> {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;

  try {
    const sb = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await sb.auth.getClaims(token);
    const sub = data?.claims?.sub;
    if (error || !sub) return null;
    return { userId: String(sub) };
  } catch {
    return null;
  }
}

/** Convenience: 401 JSON Response when unauthenticated, else null. */
export async function requireBearerUser(
  request: Request,
): Promise<{ user: BearerUser; response: null } | { user: null; response: Response }> {
  const user = await verifyBearerUser(request);
  if (user) return { user, response: null };
  return {
    user: null,
    response: Response.json(
      { error: "Sign in to search vendors.", code: "unauthenticated" },
      { status: 401 },
    ),
  };
}
