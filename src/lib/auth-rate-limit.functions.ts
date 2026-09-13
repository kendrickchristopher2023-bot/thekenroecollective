import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

export const checkAuthAttempt = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) => input)
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return { allowed: true };
    const email = (data.email || "").trim().toLowerCase();
    if (!email) return { allowed: true };
    const hash = createHash("sha256").update(`auth:${email}`).digest("hex");
    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: allowed } = await sb.rpc("check_auth_rate_limit", {
      _key: hash,
      _max: 5,
      _window_minutes: 10,
    });
    return { allowed: allowed !== false };
  });
