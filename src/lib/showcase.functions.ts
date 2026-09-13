/**
 * Public server functions for the showcase invitation.
 *
 * - Where "See a real invitation" should point right now. The showcase when it
 *   exists (healing it if it does not), otherwise the reunion invitation, so a
 *   scanned business card never lands on an empty page.
 * - A counter for opens, plays and sign-up taps on the sample, kept in its own
 *   table so it never mixes with any customer's numbers.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseInput } from "@/lib/user-error";
import { SHOWCASE_EVENT_ID } from "@/lib/showcase";

/** The invitation that stood in for the showcase before it existed. */
export const SHOWCASE_FALLBACK_EVENT_ID = "demo-reunion-200";

export const resolveShowcaseTarget = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ eventId: string; showcase: boolean }> => {
    try {
      const { ensureShowcaseEvent } = await import("@/lib/showcase-seed.server");
      const result = await ensureShowcaseEvent();
      if (result.ok) return { eventId: SHOWCASE_EVENT_ID, showcase: true };
    } catch (err) {
      console.error("[showcase] could not confirm the showcase exists", err);
    }
    return { eventId: SHOWCASE_FALLBACK_EVENT_ID, showcase: false };
  },
);

export const SHOWCASE_INTERACTION_KINDS = [
  "open",
  "play",
  "cta",
  "example_invite",
  "example_host_link",
  "example_host_view",
  "example_create",
] as const;
export type ShowcaseInteractionKind = (typeof SHOWCASE_INTERACTION_KINDS)[number];

/**
 * The signed-in user behind this request, verified with Auth, or null. The
 * example pages are public, so the bearer is optional; when it is present it
 * is checked properly rather than trusted from the client.
 */
async function verifiedUserId(): Promise<string | null> {
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const header = getRequestHeader("authorization") ?? "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export const recordShowcaseInteraction = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    parseInput(
      z.object({ kind: z.enum(SHOWCASE_INTERACTION_KINDS) }),
      input,
      "showcase.functions.ts:recordShowcaseInteraction",
    ),
  )
  .handler(async ({ data }) => {
    // Cheap to abuse, so it is throttled per IP; the count is informational.
    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceIpRateLimit } = await import("@/lib/rate-limit.server");
    try {
      const limited = enforceIpRateLimit(getRequest(), {
        scope: "showcase-interaction",
        max: 30,
        windowMs: 60 * 1000,
      });
      if (limited) return { ok: false };
    } catch {
      // No request context (SSR call): still count it.
    }
    // Identity comes from the verified bearer, never from the caller's input.
    const userId = await verifiedUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("showcase_interactions")
      .insert({ kind: data.kind, user_id: userId });
    return { ok: !error };
  });

/**
 * The read-only host view of the showcase ("See a finished example").
 *
 * Public on purpose: a signed-out visitor and a customer with no events see
 * the same thing. Everything comes from the fictional showcase row, shaped by
 * `shapeExampleHostView` so no contact detail is ever in the payload, plus the
 * public bring sheet and photo wall readers every guest already uses.
 */
export const fetchExampleHostView = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ view: import("@/lib/example-host-view").ExampleHostView | null }> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceIpRateLimit } = await import("@/lib/rate-limit.server");
    try {
      const limited = enforceIpRateLimit(getRequest(), {
        scope: "example-host-view",
        max: 60,
        windowMs: 60 * 1000,
      });
      if (limited) throw new Error("Too many requests. Try again in a minute.");
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Too many")) throw e;
    }

    const { ensureShowcaseEvent } = await import("@/lib/showcase-seed.server");
    try {
      await ensureShowcaseEvent();
    } catch (err) {
      console.error("[showcase] could not confirm the showcase exists", err);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("events")
      .select("data")
      .eq("id", SHOWCASE_EVENT_ID)
      .is("archived_at", null)
      .maybeSingle();
    const event = (row as { data?: unknown } | null)?.data as
      | import("@/lib/events-store").KEvent
      | undefined;
    if (!event) return { view: null };

    const [{ fetchBringSheet }, { listEventPhotos }, { shapeExampleHostView }] = await Promise.all([
      import("@/lib/bring-sheet.functions"),
      import("@/lib/photo-wall.functions"),
      import("@/lib/example-host-view"),
    ]);

    const [bring, photos, wishes, comments] = await Promise.all([
      fetchBringSheet({ data: { eventId: SHOWCASE_EVENT_ID } } as never).catch(() => null),
      listEventPhotos({ data: { eventId: SHOWCASE_EVENT_ID } } as never).catch(() => []),
      supabaseAdmin
        .from("event_well_wishes")
        .select("id", { count: "exact", head: true })
        .eq("event_id", SHOWCASE_EVENT_ID)
        .then((r) => r.count ?? 0),
      supabaseAdmin
        .from("event_comments")
        .select("id", { count: "exact", head: true })
        .eq("event_id", SHOWCASE_EVENT_ID)
        .then((r) => r.count ?? 0),
    ]);

    const view = shapeExampleHostView(event, {
      bring: bring && bring.found ? bring.items : [],
      photos: (photos ?? []) as { id: string; url: string; label?: string | null }[],
      wishes,
      comments,
    });
    return { view };
  },
);
