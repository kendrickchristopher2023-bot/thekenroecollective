/**
 * Per-person calendar file for a schedule, looked up by the long token or the
 * short code. The file only holds the schedule itself, never anyone's name,
 * phone or email. Removed people get 404.
 */
export async function schedulePersonIcs(by: { token: string } | { code: string }): Promise<Response> {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const q = supabaseAdmin.from("schedule_people" as any).select("schedule_id, removed_at");
        const { data: person } = await ("token" in by ? q.eq("rsvp_token", by.token) : q.eq("short_code", by.code)).maybeSingle();
        if (!person || (person as any).removed_at) return new Response("Not found", { status: 404 });
        const sid = (person as any).schedule_id as string;
        const [{ data: s }, { data: ex }] = await Promise.all([
          supabaseAdmin.from("schedules" as any).select("*").eq("id", sid).maybeSingle(),
          supabaseAdmin.from("schedule_exceptions" as any).select("*").eq("schedule_id", sid),
        ]);
        if (!s) return new Response("Not found", { status: 404 });
        const [{ buildScheduleIcs }, { scheduleJoinLines }] = await Promise.all([import("@/lib/schedule-rrule"), import("@/lib/schedule-messages")]);
        const sc = s as any;
        const joinLines = scheduleJoinLines(sc);
        const description = String(sc.description || "").split("\n").filter((line) => !joinLines.some((detail) => detail.toLocaleLowerCase() === line.trim().toLocaleLowerCase())).join("\n");
        const details = [description, ...joinLines]
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
}
