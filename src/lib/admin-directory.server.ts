/**
 * Auth user directory helpers for owner/admin reporting surfaces.
 *
 * The previous code paged `auth.admin.listUsers` five times (1,000 users) and
 * silently dropped everyone after that, and separately called
 * `getUserById` once per row to resolve owner emails. Both are fixed here:
 * the whole directory is paged until a short page is returned, and the result
 * is memoised briefly per worker so a single request never fans out.
 */

export type DirectoryUser = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  confirmed_at: string | null;
  banned_until: string | null;
};

const PER_PAGE = 200;
/** Hard stop so a runaway loop cannot hang a request. 200 pages = 40k users. */
const MAX_PAGES = 200;
const TTL_MS = 30_000;

let cache: { at: number; users: DirectoryUser[]; truncated: boolean } | null = null;

/** Every auth user, paged to completion (not capped at 1,000). */
export async function listAllAuthUsers(
  opts: { force?: boolean } = {},
): Promise<{ users: DirectoryUser[]; truncated: boolean }> {
  if (!opts.force && cache && Date.now() - cache.at < TTL_MS) {
    return { users: cache.users, truncated: cache.truncated };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const users: DirectoryUser[] = [];
  let truncated = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await (supabaseAdmin.auth.admin as never as {
      listUsers: (a: { page: number; perPage: number }) => Promise<{ data: any; error: any }>;
    }).listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(error.message);
    const batch = (data?.users ?? []) as any[];
    for (const u of batch) {
      users.push({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        email_confirmed_at: u.email_confirmed_at ?? null,
        confirmed_at: u.confirmed_at ?? null,
        banned_until: u.banned_until ?? null,
      });
    }
    if (batch.length < PER_PAGE) break;
    if (page === MAX_PAGES) truncated = true;
  }
  cache = { at: Date.now(), users, truncated };
  return { users, truncated };
}

/** id -> email for the whole directory. */
export async function emailById(): Promise<Map<string, string | null>> {
  const { users } = await listAllAuthUsers();
  return new Map(users.map((u) => [u.id, u.email]));
}

/** User ids whose email contains `query` (case-insensitive). */
export async function userIdsByEmailSearch(query: string): Promise<string[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const { users } = await listAllAuthUsers();
  return users.filter((u) => (u.email ?? "").toLowerCase().includes(q)).map((u) => u.id);
}
