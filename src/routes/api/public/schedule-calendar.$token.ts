import { createFileRoute } from "@tanstack/react-router";

/** Long calendar link. Links already sent keep working forever. */
export const Route = createFileRoute("/api/public/schedule-calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token || "");
        if (!/^[a-f0-9]{48}$/.test(token)) return new Response("Not found", { status: 404 });
        const { schedulePersonIcs } = await import("@/lib/schedule-ics.server");
        return schedulePersonIcs({ token });
      },
    },
  },
});
