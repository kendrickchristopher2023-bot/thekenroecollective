// Owner access guard — role check + mandatory MFA for owner/super_admin.
//
// Christopher's rule: owner and super_admin accounts MUST have TOTP MFA
// enrolled AND must have completed the second-factor challenge in the current
// session (aal2) before any owner-gated server function acts for them. Regular
// `user` / `admin`-only accounts are untouched — no added friction there.
//
// This is enforced server-side against the request's own bearer token
// (`public.current_auth_aal()` reads `request.jwt.claims`), so a direct API
// call cannot bypass it by skipping the client-side gate.

export const MFA_ENROLL_REQUIRED = "MFA_ENROLL_REQUIRED";
export const MFA_CHALLENGE_REQUIRED = "MFA_CHALLENGE_REQUIRED";

type Sb = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export async function hasOwnerRole(supabase: Sb, userId: string): Promise<boolean> {
  const [owner, superAdmin] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "owner" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
  ]);
  return owner.data === true || superAdmin.data === true;
}

/** Throws unless the caller is owner/super_admin AND is at aal2 with a verified factor. */
export async function assertOwnerAccess(supabase: Sb, userId: string): Promise<void> {
  if (!(await hasOwnerRole(supabase, userId))) throw new Error("Forbidden");
  await assertOwnerMfaSatisfied(supabase, userId);
}

/** MFA half of the guard, for callers that already verified the role. */
export async function assertOwnerMfaSatisfied(supabase: Sb, userId: string): Promise<void> {
  const { data: enrolled } = await supabase.rpc("has_verified_mfa", { _user_id: userId });
  if (enrolled !== true) {
    throw new Error(
      `${MFA_ENROLL_REQUIRED}: Two-factor authentication is required for owner accounts. Enroll an authenticator app to continue.`,
    );
  }
  const { data: aal } = await supabase.rpc("current_auth_aal");
  if (aal !== "aal2") {
    throw new Error(
      `${MFA_CHALLENGE_REQUIRED}: Verify your authenticator code to continue in the owner console.`,
    );
  }
}

/** Non-throwing status, for the client gate to decide what to render. */
export async function ownerMfaStatus(
  supabase: Sb,
  userId: string,
): Promise<{ isOwner: boolean; enrolled: boolean; aal: string; satisfied: boolean }> {
  const isOwner = await hasOwnerRole(supabase, userId);
  if (!isOwner) return { isOwner: false, enrolled: false, aal: "aal1", satisfied: false };
  const [{ data: enrolled }, { data: aal }] = await Promise.all([
    supabase.rpc("has_verified_mfa", { _user_id: userId }),
    supabase.rpc("current_auth_aal"),
  ]);
  const level = typeof aal === "string" ? aal : "aal1";
  return {
    isOwner: true,
    enrolled: enrolled === true,
    aal: level,
    satisfied: enrolled === true && level === "aal2",
  };
}
