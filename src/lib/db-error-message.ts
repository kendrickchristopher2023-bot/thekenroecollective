/**
 * Turns raw Postgres / PostgREST errors into plain language for customers.
 *
 * Customers must never see strings like "permission denied for table vendors"
 * or "new row violates row-level security policy for table ...": they expose
 * internal schema names and read as broken software. The real error is logged
 * server-side so we keep the diagnostic value.
 */
export function friendlyDbError(
  error: unknown,
  context = "saving your request",
): string {
  const raw =
    typeof error === "string"
      ? error
      : ((error as { message?: string } | null)?.message ?? "");
  const code = (error as { code?: string } | null)?.code ?? "";
  // eslint-disable-next-line no-console
  console.error(`[db] ${context} failed:`, code, raw);

  const text = raw.toLowerCase();

  if (text.includes("permission denied") || text.includes("row-level security") || code === "42501") {
    return "We couldn't complete that because of a permissions problem on our side. Nothing was lost, please try again in a moment or contact us and we'll sort it out.";
  }
  if (code === "23505" || text.includes("duplicate key") || text.includes("already exists")) {
    return "That already exists, so nothing new was created.";
  }
  if (code === "23503" || text.includes("violates foreign key")) {
    return "Something this depends on is missing. Please refresh the page and try again.";
  }
  if (text.includes("violates check constraint") || code === "23514") {
    return "Some of the details entered aren't valid. Please review the form and try again.";
  }
  if (text.includes("timeout") || text.includes("fetch failed") || text.includes("network")) {
    return "The connection dropped before we could finish. Please try again.";
  }
  return "Something went wrong on our side and your request wasn't saved. Please try again, or contact us if it keeps happening.";
}
