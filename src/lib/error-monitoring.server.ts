// Server-only insert path for the first-party error log. Uses the publishable
// key client (RLS allows anon INSERT, nobody but owners can read back).
import { createClient } from "@supabase/supabase-js";

import { classifyLogEnvironment } from "@/lib/log-environment";

type ErrorLogInput = {
  message: string;
  errorName?: string | null;
  stack?: string | null;
  route?: string | null;
  source?: string | null;
  userAgent?: string | null;
  release?: string | null;
  /** Hostname that served the page. Preview and local hosts are not recorded. */
  host?: string | null;
};

/** Stable grouping key: name + normalized message + first stack frame. */
export function fingerprintError(input: {
  errorName?: string | null;
  message: string;
  stack?: string | null;
}): string {
  const normalizedMessage = input.message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\d{3,}/g, "<n>")
    .slice(0, 200);
  const frame = (input.stack ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("at ") || l.includes("@"))
    ?.replace(/:\d+:\d+/g, "")
    .slice(0, 160);
  const basis = `${input.errorName ?? "Error"}|${normalizedMessage}|${frame ?? ""}`;
  // Small deterministic hash (djb2) — readable and stable across runtimes.
  let h = 5381;
  for (let i = 0; i < basis.length; i += 1) h = ((h << 5) + h + basis.charCodeAt(i)) | 0;
  return `e_${(h >>> 0).toString(36)}`;
}

export async function insertErrorLog(input: ErrorLogInput): Promise<void> {
  // The same noise rules the browser applies, so a report arriving through the
  // server path cannot slip unactionable browser chatter into the log.
  const { isIgnorable } = await import("@/lib/error-capture-client");
  if (isIgnorable(input.message ?? "")) return;
  // The live log is for the live site only. A report from the development
  // preview is dropped, so the log stops describing my own environment.
  if (input.host !== undefined && classifyLogEnvironment(input.host) !== "production") return;
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (i: any, init: any) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(i, { ...init, headers: h });
      },
    },
  });

  const message = (input.message || "Unknown error").slice(0, 2000);
  const errorName = (input.errorName || "Error").slice(0, 200);
  const stack = input.stack ? input.stack.slice(0, 8000) : null;

  await supabase.from("app_error_logs").insert({
    fingerprint: fingerprintError({ errorName, message, stack }),
    error_name: errorName,
    message,
    stack,
    route: input.route ? input.route.slice(0, 500) : null,
    source: (input.source || "client").slice(0, 60),
    environment: process.env["NODE_ENV"] === "production" ? "production" : "development",
    release: input.release ? input.release.slice(0, 120) : null,
    user_agent: input.userAgent ? input.userAgent.slice(0, 500) : null,
  } as any);
}
