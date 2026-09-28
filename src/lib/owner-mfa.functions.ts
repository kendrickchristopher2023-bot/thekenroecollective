import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OwnerMfaStatus = {
  isOwner: boolean;
  enrolled: boolean;
  aal: string;
  satisfied: boolean;
};

/**
 * Owner/super_admin MFA status for the current session. Used by the client gate
 * to decide between "enroll now", "verify your code", and "you're in".
 * Enforcement itself lives in assertOwnerAccess on every owner-gated function.
 */
export const getOwnerMfaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OwnerMfaStatus> => {
    const { ownerMfaStatus } = await import("@/lib/owner-guard.server");
    return ownerMfaStatus(context.supabase as never, context.userId);
  });
