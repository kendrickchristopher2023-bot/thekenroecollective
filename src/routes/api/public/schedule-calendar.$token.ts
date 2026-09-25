import { createFileRoute } from "@tanstack/react-router";

/**
 * Per-person calendar file for a schedule. The token is the person's private
 * 48-character reminder token; the file only holds the schedule itself, never
 * anyone's name, phone or email.
 */
export const Route = createFileRoute("/api/public/schedule-calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token || "");
        if (!/^[a-f0-9]{48}$/.test(token)) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: person } = await supabaseAdmin
          .from("schedule_people" as any)
          .select("schedule_id, removed_at")
          .eq("rsvp_token", token)
          .maybeSingle();
        if (!person || (person as any).removed_at) return new Response("Not found", { status: 404 });
        const sid = (person as any).schedule_id as string;
        const [{ data: s }, { data: ex }] = await Promise.all([
          supabaseAdmin.from("schedules" as any).select("*").eq("id", sid).maybeSingle(),
          supabaseAdmin.from("schedule_exceptions" as any).select("*").eq("schedule_id", sid),
        ]);
        if (!s) return new Response("Not found", { status: 404 });
        const { buildScheduleIcs } = await import("@/lib/schedule-rrule");
        const sc = s as any;
        const details = [sc.description, sc.join_url ? `Join: ${sc.join_url}` : "", sc.dial_in ? `Dial in: ${sc.dial_in}${sc.dial_pin ? ` PIN ${sc.dial_pin}` : ""}` : ""]
          .filter(Boolean)
          .join("\n");
        const ics = buildScheduleIcs({
          uid: `schedule-${sid}@thekenroecollective.com`,
          title: sc.title,
          description: details || null,
          location: sc.location,
          url: sc.join_url,
          schedule: sc,
          exceptions: (ex ?? []) as any,
        });
        const name = String(sc.title).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "schedule";
        return new Response(ics, {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `inline; filename="${name}.ics"`,
            "Cache-Control": "private, max-age=300",
          },
        });
      },
    },
  },
});
