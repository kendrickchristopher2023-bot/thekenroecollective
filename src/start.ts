import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { serverFnResilience } from "@/lib/serverfn-resilience";

const errorMiddleware = createMiddleware().server(async ({ request, next }) => {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/lovable/")) {
    return next();
  }
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    // Owner-only first-party error log (app_error_logs).
    try {
      const { insertErrorLog } = await import("./lib/error-monitoring.server");
      const err = error instanceof Error ? error : new Error(String(error));
      await insertErrorLog({
        message: err.message,
        errorName: err.name,
        stack: err.stack ?? null,
        route: url.pathname,
        source: "server",
        userAgent: request.headers.get("user-agent"),
        host: request.headers.get("host") ?? url.host,
      });
    } catch {
      /* monitoring must never mask the original failure */
    }
    return new Response(renderErrorPage(), {
      status: 500,

      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, serverFnResilience],
  requestMiddleware: [errorMiddleware],
}));
