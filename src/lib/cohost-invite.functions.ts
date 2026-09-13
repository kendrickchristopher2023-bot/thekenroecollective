// Public (pre-sign-in) lookup for a collaborator invitation.
//
// Someone who has NO account yet must be able to see who the invite was sent to
// so we can drop them into signup with that email locked. The invite token IS
// the capability; the security-definer RPC returns only the invited address,
// event title, role and whether the link is still valid.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export interface CohostInvitePreview {
  found: boolean;
  eventId?: string;
  eventTitle?: string;
  invitedEmail?: string;
  role?: "cohost" | "viewer";
  status?: "invited" | "active" | "revoked";
  expired?: boolean;
}

export const lookupCohostInvite = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => parseInput(z.object({ token: z.string().min(8).max(200) }), i, "cohost-invite.functions.ts:23"))
  .handler(async ({ data }): Promise<CohostInvitePreview> => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const supabasePublic = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: row, error } = await (supabasePublic as any).rpc("get_event_member_invite", {
      _token: data.token,
    });
    if (error || !row || row.found !== true) return { found: false };
    return {
      found: true,
      eventId: String(row.event_id),
      eventTitle: String(row.event_title ?? "an event"),
      invitedEmail: String(row.invited_email ?? ""),
      role: row.role === "viewer" ? "viewer" : "cohost",
      status: row.status,
      expired: !!row.expired,
    };
  });
