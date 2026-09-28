// Server-only helper for notifications functions.
// Lives in its own module so the tss-serverfn-split transform can resolve it
// from each handler chunk (sibling helpers in *.functions.ts files become
// undefined after splitting).
export async function ensureAdminOrOwner(supabase: any, userId: string): Promise<boolean> {
  const [{ data: isAdmin }, { data: isOwner }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "owner" }),
  ]);
  return Boolean(isAdmin || isOwner);
}
