type DbClient = any;

export async function accountAddonAccess(
  supabase: DbClient,
  userId: string,
  kind: "guest_import" | "thank_you_cards" | "converter",
): Promise<boolean> {
  const [{ data: owner }, { data: profile }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "owner" }),
    supabase
      .from("profiles")
      .select("guest_import_enabled,thank_you_cards_enabled,converter_enabled")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  if (owner === true) return true;
  const { resolveUserTier } = await import("@/lib/tier-guards.server");
  const { tier } = await resolveUserTier(supabase, userId);
  if (tier === "atelier") return true;
  if (kind === "guest_import") return profile?.guest_import_enabled === true;
  if (kind === "thank_you_cards") return profile?.thank_you_cards_enabled === true;
  return profile?.converter_enabled === true;
}

export async function eventOwnerId(supabase: DbClient, eventId: string): Promise<string | null> {
  const { data } = await supabase.from("events").select("user_id").eq("id", eventId).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

export async function eventAddonAccess(
  supabase: DbClient,
  eventId: string,
  kind: "guest_import" | "thank_you_cards",
): Promise<boolean> {
  const ownerId = await eventOwnerId(supabase, eventId);
  return ownerId ? accountAddonAccess(supabase, ownerId, kind) : false;
}