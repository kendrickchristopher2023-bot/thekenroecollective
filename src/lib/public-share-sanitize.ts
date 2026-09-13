/**
 * Public share-link payload sanitizer.
 *
 * `get_shared_design` and `get_shared_ai_package` are anon-executable and
 * returned the WHOLE row to whoever held the link, including the owner's
 * `user_id`, the internal `event_id` / `project_id` and the `share_token`
 * itself. None of that is needed to view a shared design or package, and the
 * owner's account id should never travel on a forwardable URL.
 *
 * The database functions were narrowed too; this is the second layer, so a
 * future RPC change cannot quietly re-widen the browser payload.
 */

/** Never leaves the server on a share link. */
export const SHARE_PRIVATE_FIELDS = [
  "user_id",
  "share_token",
  "event_id",
  "project_id",
  "environment",
  "stripe_subscription_id",
  "stripe_session_id",
] as const;

export function sanitizePublicShareRow<T>(row: T): T {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const key of SHARE_PRIVATE_FIELDS) delete out[key];
  return out as T;
}
