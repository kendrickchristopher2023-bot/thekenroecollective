import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Public: returns whether the The Kenroe Collective watermark should be shown for a given event.
 * Hidden if (a) the owner is on a paid non-trial Whisper/Host/Atelier subscription, OR
 * (b) the event has the branding_removal add-on purchased.
 */
export const getEventBrandingState = createServerFn({ method: "GET" })
  .inputValidator((input) => parseInput(z.object({ eventId: z.string().min(1) }), input, "branding.functions.ts:20"))
  .handler(async ({ data }): Promise<{ watermark: boolean }> => {
    const sb = publicClient();
    // Anon has no read access to event_addons or subscriptions (by design —
    // they hold billing data), so this used to fail with "permission denied"
    // and silently fall back to "watermark on" for paying customers. The
    // SECURITY DEFINER RPC answers the yes/no question without exposing rows.
    const { data: row, error } = await sb.rpc("get_event_public_entitlements", { _event_id: data.eventId });
    if (error) throw new Error(error.message);
    const ent = (row ?? {}) as { watermark?: boolean };
    return { watermark: ent.watermark !== false };
  });

/**
 * Public: watermark state for a shared AI package (no per-event addon — owner tier only).
 */
export const getPackageBrandingState = createServerFn({ method: "GET" })
  .inputValidator((input) => parseInput(z.object({ token: z.string().min(1) }), input, "branding.functions.ts:37"))
  .handler(async ({ data }): Promise<{ watermark: boolean }> => {
    const sb = publicClient();
    const { data: row, error } = await sb.rpc("get_package_public_entitlements", { _token: data.token });
    if (error) throw new Error(error.message);
    const ent = (row ?? {}) as { watermark?: boolean };
    return { watermark: ent.watermark !== false };
  });

/**
 * Public: returns whether the Photo Wall (live gallery) is unlocked for this event —
 * either via the owner's Host/Atelier subscription or the event_photo_wall add-on.
 */
export const getPhotoWallAccess = createServerFn({ method: "GET" })
  .inputValidator((input) => parseInput(z.object({ eventId: z.string().min(1) }), input, "branding.functions.ts:51"))
  .handler(async ({ data }): Promise<{ allowed: boolean }> => {
    const sb = publicClient();
    const { data: row, error } = await sb.rpc("get_event_public_entitlements", { _event_id: data.eventId });
    if (error) throw new Error(error.message);
    const ent = (row ?? {}) as { photoWall?: boolean };
    return { allowed: ent.photoWall === true };
  });

