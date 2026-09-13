// Consistent formatting for "who owns this row" across admin tables —
// previously each screen picked its own fallback order and truncation
// length (some showed a full untruncated user id, others 8 or 10 chars).
export function formatOwnerId(userId: string | null | undefined, fallback = "—"): string {
  return userId ? `${userId.slice(0, 8)}…` : fallback;
}

export function formatOwnerLabel(
  displayName: string | null | undefined,
  email: string | null | undefined,
  userId: string | null | undefined,
  fallback = "—",
): string {
  return displayName || email || formatOwnerId(userId, fallback);
}
