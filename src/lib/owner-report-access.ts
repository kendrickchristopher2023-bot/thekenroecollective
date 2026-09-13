// Owner Report access allowlist.
//
// The Owner Report exposes revenue and customer-level analytics, so it is
// restricted to a fixed set of verified account emails. Having an owner,
// admin or super_admin role is NOT enough. Access requires:
//   (email is in OWNER_REPORT_ALLOWLIST) AND (2FA satisfied, aal2)
//
// This is the single place to edit the list.

export const OWNER_REPORT_ALLOWLIST = [
  "chris@thekenroecollective.com",
  "kendrickchristopher@hotmail.com",
  "kendrickchristopher@icloud.com",
  "adrian@thekenroecollective.com",
  "adrianmonroe@comcast.net",
] as const;

export const OWNER_REPORT_DENIED =
  "OWNER_REPORT_FORBIDDEN: This report is limited to specific owner accounts.";

export function isOwnerReportEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (OWNER_REPORT_ALLOWLIST as readonly string[]).includes(normalized);
}

type AuthLike = {
  auth: {
    getUser: () => Promise<{ data: { user: { email?: string | null; email_confirmed_at?: string | null } | null }; error: unknown }>;
  };
};

/**
 * Server-side check of the authenticated user's verified email against the
 * allowlist. Reads the user from the request's own bearer token, so a client
 * cannot spoof it.
 */
export async function isAllowlistedOwnerReportUser(supabase: AuthLike): Promise<boolean> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return false;
  const user = data.user;
  if (!user.email_confirmed_at) return false;
  return isOwnerReportEmail(user.email);
}

/** Throws unless the caller's verified email is on the allowlist. */
export async function assertOwnerReportAllowlist(supabase: AuthLike): Promise<void> {
  if (!(await isAllowlistedOwnerReportUser(supabase))) {
    throw new Error(OWNER_REPORT_DENIED);
  }
}
