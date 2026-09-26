import { createFileRoute } from "@tanstack/react-router";
import { SHORT_CODE_RE } from "@/lib/schedule-links";

/** Short calendar link used in texts: /cal/<code>. Rate limited per IP so codes cannot be walked. */
export const Route = createFileRoute("/cal/$code")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { enforceIpRateLimit } = await import("@/lib/rate-limit.server");
        const limited = enforceIpRateLimit(request, { scope: "schedule-short-cal", max: 20, windowMs: 60_000 });
        if (limited) return limited;
        const code = String(params.code || "");
        if (!SHORT_CODE_RE.test(code)) return new Response("Not found", { status: 404 });
        const { schedulePersonIcs } = await import("@/lib/schedule-ics.server");
        return schedulePersonIcs({ code });
      },
    },
  },
});
