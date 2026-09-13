// Owner reporting: leave our own sample accounts (demo host, showcase system
// account) out of a query WITHOUT dropping rows that have no account at all.
//
// A plain `not in (...)` fails for NULL columns (NULL is never "not in" a
// list), which silently removed anonymous error logs and referrer-less
// discount codes. The filter below is "is null, or not in the list".

/** PostgREST `or=` expression, or null when there is nothing to exclude. */
export function excludeAccountsFilter(column: string, ids: readonly string[]): string | null {
  const clean = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!clean.length) return null;
  return `${column}.is.null,${column}.not.in.(${clean.join(",")})`;
}

/** Apply the exclusion to a PostgREST query builder. */
export function withoutAccounts<Q extends { or: (filters: string) => Q }>(
  q: Q,
  column: string,
  ids: readonly string[],
): Q {
  const filter = excludeAccountsFilter(column, ids);
  return filter ? q.or(filter) : q;
}

/**
 * The same rule for rows already in memory: keep a row whose account is
 * missing, drop one that belongs to an excluded account.
 */
export function keepsRow(accountId: string | null | undefined, ids: readonly string[]): boolean {
  if (accountId === null || accountId === undefined || accountId === "") return true;
  return !ids.includes(accountId);
}
