// Project ↔ Event integration server functions.
//
// Enforces that the signed-in user has the paid integration entitlement
// (Atelier / Studio bundle, or owner/admin) AND can edit the target project
// AND that the project is actually linked to the given event — before
// importing event timeline blocks into project tasks.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
// Public shape returned for a project's linked event. Deliberately minimal:
// board members only need a label, so guest lists, RSVPs and notes never
// leave the server through this path.
export interface LinkedEventLabel {
  id: string;
  title: string;
  date?: string;
  timezone?: string;
}

export function toLinkedEventLabel(ev: { id: string; data: unknown }): LinkedEventLabel {
  const d = (ev.data ?? {}) as Record<string, unknown>;
  return {
    id: ev.id,
    title: typeof d.title === "string" && d.title.trim() ? d.title : "Linked event",
    date: typeof d.date === "string" ? d.date : undefined,
    timezone: typeof d.timezone === "string" ? d.timezone : undefined,
  };
}

const TimelineBlock = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(300),
  time: z.string().max(20).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  owner: z.string().max(200).optional().nullable(),
  vendor: z.string().max(200).optional().nullable(),
});

const ImportInput = z.object({
  projectId: z.string().uuid(),
  eventId: z.string().min(1).max(120),
  eventDate: z.string().max(64).optional().nullable(),
  blocks: z.array(TimelineBlock).min(1).max(200),
});

export const canLinkProjectsToEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ canLink: boolean }> => {
    const { data } = await context.supabase.rpc("pm_can_link_events", {
      _user_id: context.userId,
    });
    return { canLink: data === true };
  });

export const importTimelineToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(ImportInput, d, "pm-events.functions.ts:38"))
  .handler(
    async ({ data, context }): Promise<{ ok: true; imported: number } | { error: string }> => {
      // 1) Paid integration access
      const { data: canLink } = await context.supabase.rpc("pm_can_link_events", {
        _user_id: context.userId,
      });
      if (canLink !== true) {
        return { error: "Linking projects to events requires the Atelier plan or the Studio bundle." };
      }

      // 2) Edit permission on the project
      const { data: canEdit } = await context.supabase.rpc("pm_can_edit_project", {
        _project_id: data.projectId,
        _user_id: context.userId,
      });
      if (canEdit !== true) return { error: "You don't have edit access to this project." };

      // 3) Project must actually be linked to the event
      const { data: isLinked } = await context.supabase.rpc("pm_project_is_linked_to_event", {
        _project_id: data.projectId,
        _event_id: data.eventId,
      });
      if (isLinked !== true) {
        return { error: "This project isn't linked to that event." };
      }

      // 4) Dedupe against previously imported blocks (we tag notes with
      //    [event-timeline:<blockId>] when importing).
      const { data: existing } = await context.supabase
        .from("pm_tasks")
        .select("notes")
        .eq("project_id", data.projectId);
      const importedKeys = new Set<string>();
      for (const t of (existing ?? []) as Array<{ notes: string | null }>) {
        const m = (t.notes ?? "").match(/event-timeline:([^\s\]]+)/);
        if (m) importedKeys.add(m[1]);
      }
      const pending = data.blocks.filter((b) => !importedKeys.has(b.id));
      if (pending.length === 0) return { ok: true, imported: 0 };

      // 5) Find the largest existing "todo" position to append after.
      const { data: positions } = await context.supabase
        .from("pm_tasks")
        .select("position")
        .eq("project_id", data.projectId)
        .eq("status", "todo")
        .order("position", { ascending: false })
        .limit(1);
      let nextPos = ((positions ?? [])[0] as { position?: number } | undefined)?.position ?? 0;

      const base = data.eventDate ? new Date(data.eventDate) : null;
      const rows = pending.map((block) => {
        nextPos += 1;
        let due_date: string | null = null;
        if (base && block.time) {
          const [hh, mm] = block.time.split(":").map((x) => parseInt(x, 10));
          if (!Number.isNaN(hh)) {
            const d = new Date(base);
            d.setHours(hh, Number.isNaN(mm) ? 0 : mm, 0, 0);
            due_date = d.toISOString().slice(0, 10);
          }
        }
        const owner = block.owner || block.vendor || null;
        return {
          project_id: data.projectId,
          title: `${block.time ?? ""} ${block.title}`.trim(),
          description: owner ? `Owner: ${owner}` : null,
          notes: `${block.notes ?? ""}\n\n[event-timeline:${block.id}]`.trim(),
          due_date,
          color: "#8B5CF6",
          status: "todo" as const,
          position: nextPos,
          created_by: context.userId,
        };
      });

      const { error } = await context.supabase.from("pm_tasks").insert(rows);
      if (error) return { error: error.message };
      return { ok: true, imported: rows.length };
    },
  );

export const getProjectLinkedEvent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<LinkedEventLabel | null> => {
    // Members and owners of a project can see the title of the event it is
    // linked to, even when they don't own that event themselves. The client
    // supplies only the project id; the linked event is read server-side, so
    // a caller can never ask about an arbitrary event.
    const { data: canView } = await context.supabase.rpc("pm_is_project_member", {
      _project_id: data.projectId,
      _user_id: context.userId,
    });
    if (!canView) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: proj } = await supabaseAdmin
      .from("pm_projects")
      .select("event_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj?.event_id) return null;

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id, data")
      .eq("id", proj.event_id)
      .maybeSingle();
    if (!ev) return null;

    return toLinkedEventLabel(ev);
  });
