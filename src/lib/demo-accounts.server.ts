/**
 * Demo and showcase account identities, plus scoping for owner/admin reporting.
 *
 * Production and the demo environment share one database, so the demo host's
 * seeded events/guests/contacts would otherwise be counted in the production
 * owner console. This resolves the demo host account id (and the showcase's
 * locked system account) and expresses the correct scope for the current
 * request:
 *
 *   - production request -> exclude the demo accounts' rows
 *   - demo request       -> show only the demo account's rows
 *
 * Nothing here deletes or hides real customer data, and no account is removed.
 */
import { DEMO_ACCOUNT_EMAIL } from "@/lib/demo-mode";
import { isDemoRequest, SHOWCASE_SYSTEM_EMAIL } from "@/lib/demo-mode.server";

/** Known id of the seeded demo host; falls back to a lookup if it ever changes. */
const KNOWN_DEMO_USER_ID = "7d036969-831d-4dd8-a219-1c493d7aacb4";

let cachedDemoUserId: string | null | undefined;
let cachedShowcaseUserId: string | null | undefined;

async function findUserIdByEmail(email: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: list, error } = await (supabaseAdmin.auth.admin as any).listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(error.message ?? "listUsers failed");
  const match = (list?.users ?? []).find(
    (u: { id: string; email?: string | null }) => (u.email ?? "").toLowerCase() === email,
  );
  return match?.id ?? null;
}


/** Resolve the demo host user id (memoised for the worker's lifetime). */
export async function getDemoUserId(): Promise<string | null> {
  if (cachedDemoUserId !== undefined) return cachedDemoUserId;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.auth.admin.getUserById(KNOWN_DEMO_USER_ID);
    if (data?.user?.email?.toLowerCase() === DEMO_ACCOUNT_EMAIL) {
      cachedDemoUserId = KNOWN_DEMO_USER_ID;
      return cachedDemoUserId;
    }
    // Id drifted (e.g. demo account recreated) — look it up by email.
    cachedDemoUserId = await findUserIdByEmail(DEMO_ACCOUNT_EMAIL);
  } catch {
    cachedDemoUserId = KNOWN_DEMO_USER_ID;
  }
  return cachedDemoUserId ?? null;
}

/** Resolve the showcase system account id, if it has been created. Never creates it. */
export async function getShowcaseUserId(): Promise<string | null> {
  if (cachedShowcaseUserId !== undefined) return cachedShowcaseUserId;
  try {
    cachedShowcaseUserId = await findUserIdByEmail(SHOWCASE_SYSTEM_EMAIL);
  } catch {
    // Lookup failed (not "absent"), so do not remember the miss for the
    // worker's lifetime: the next call retries.
    return null;
  }
  return cachedShowcaseUserId ?? null;
}


/**
 * The showcase's own account. Nobody can sign into it: it is created without a
 * password, banned for a hundred years (which also refuses magic links and
 * OAuth), and demoSignIn never hands it out. It exists so the sample
 * invitation has an owner that no demo visitor is.
 */
export async function ensureShowcaseAccount(): Promise<string | null> {
  const existing = await getShowcaseUserId();
  if (existing) return existing;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.auth.admin as any).createUser({
    email: SHOWCASE_SYSTEM_EMAIL,
    email_confirm: true,
    ban_duration: "876000h",
    user_metadata: { display_name: "Amara & Elias (sample)", is_demo: true },
    app_metadata: { system_account: "showcase" },
  });
  if (error || !data?.user) {
    // A parallel worker may have created it; look again before giving up.
    cachedShowcaseUserId = undefined;
    return getShowcaseUserId();
  }
  // Top tier so every feature the sample shows off renders for guests.
  await supabaseAdmin.from("profiles").update({ tier: "atelier" }).eq("id", data.user.id);
  cachedShowcaseUserId = data.user.id as string;
  return cachedShowcaseUserId;
}

/** Every account whose rows are demo data: the demo host and the showcase system account. */
export async function getDemoUserIds(): Promise<string[]> {
  const [demo, showcase] = await Promise.all([getDemoUserId(), getShowcaseUserId()]);
  return [demo, showcase].filter((v): v is string => !!v);
}

export type DemoScope = {
  /** True when the current request is served from the demo environment. */
  isDemo: boolean;
  /** Demo host account id, when resolvable. */
  demoUserId: string | null;
  /** Owner id to omit from results (production only). */
  excludeUserId: string | null;
  /** Every owner id to omit from results (production only): demo host + showcase account. */
  excludeUserIds: string[];
  /** Owner id to restrict results to (demo only). */
  onlyUserId: string | null;
};

/** Scope for the current request. */
export async function getDemoScope(): Promise<DemoScope> {
  const [isDemo, demoUserId, showcaseUserId] = await Promise.all([
    isDemoRequest(),
    getDemoUserId(),
    getShowcaseUserId(),
  ]);
  const all = [demoUserId, showcaseUserId].filter((v): v is string => !!v);
  return {
    isDemo,
    demoUserId,
    excludeUserId: isDemo ? null : demoUserId,
    excludeUserIds: isDemo ? [] : all,
    onlyUserId: isDemo ? demoUserId : null,
  };
}
