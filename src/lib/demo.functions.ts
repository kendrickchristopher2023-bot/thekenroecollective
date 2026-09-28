import { createServerFn } from "@tanstack/react-start";

/**
 * Demo-only sign-in. Signs the caller into the shared demo host account so a
 * prospect can browse a fully populated app without creating an account.
 *
 * Guards:
 *  - Only responds on a `demo.` host (assertNotDemo's inverse).
 *  - Rate-limited per IP.
 *  - Requires DEMO_ACCOUNT_PASSWORD to be configured server-side; the password
 *    itself is never returned, only the resulting session tokens.
 *  - The demo account is a plain user (never owner/admin), so RLS keeps it
 *    scoped to its own seeded rows.
 */
export const demoSignIn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{
    accessToken?: string;
    refreshToken?: string;
    error?: string;
  }> => {
    const { isDemoRequest, logDemoGuard } = await import("@/lib/demo-mode.server");
    if (!(await isDemoRequest())) return { error: "Not a demo host" };

    // Rate-limited per IP: the demo account is shared, so sign-ins are cheap
    // to abuse. 6 per 10 minutes is plenty for a real prospect.
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const { enforceIpRateLimit } = await import("@/lib/rate-limit.server");
      const limited = enforceIpRateLimit(getRequest(), { scope: "demo-sign-in", max: 6, windowMs: 10 * 60 * 1000 });
      if (limited) {
        await logDemoGuard("sign_in", { limited: true });
        return { error: "Too many demo sign-ins from this connection. Try again in a few minutes." };
      }
    } catch {
      /* no request context */
    }

    const password = process.env["DEMO_ACCOUNT_PASSWORD"];
    if (!password) return { error: "Demo account is not configured" };

    const { DEMO_ACCOUNT_EMAIL } = await import("@/lib/demo-mode");
    const { ensureDemoAccount } = await import("@/lib/demo-seed.server");
    await ensureDemoAccount(password);

    const url = process.env["SUPABASE_URL"];
    const anon = process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !anon) return { error: "Backend is not configured" };

    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email: DEMO_ACCOUNT_EMAIL,
      password,
    });
    if (error || !data.session) return { error: error?.message ?? "Sign-in failed" };
    await logDemoGuard("sign_in", {});
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  },
);
