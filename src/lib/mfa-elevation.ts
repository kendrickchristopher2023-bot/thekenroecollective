import { supabase } from "@/integrations/supabase/client";

/**
 * Helpers for elevating an AAL1 session to AAL2 before a sensitive account
 * change (password or email). Supabase refuses updateUser({ password }) with
 * "AAL2 session is required..." when the account has a verified MFA factor
 * and the current session is only AAL1 (for example a password-recovery link).
 *
 * These helpers never disable or bypass MFA. They only prompt for the code.
 */

/** True when the account has a verified factor but the session is still AAL1. */
export async function needsMfaElevation(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.currentLevel === "aal1" && data.nextLevel === "aal2";
}

/** The user's first verified TOTP factor id, or null when there is none. */
export async function getVerifiedTotpFactorId(): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return null;
  const totp = (data.totp ?? []).find((f) => f.status === "verified") ?? (data.all ?? []).find(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  return totp?.id ?? null;
}

/**
 * Challenge + verify a 6-digit TOTP code. On success the session is upgraded
 * to AAL2 and sensitive updates are allowed.
 */
export async function elevateWithTotp(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) {
    return { ok: false, error: "Enter the 6 digit code from your authenticator app." };
  }
  const factorId = await getVerifiedTotpFactorId();
  if (!factorId) {
    return { ok: false, error: "We could not find an authenticator app on this account." };
  }
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError || !challenge) {
    return { ok: false, error: challengeError?.message ?? "Could not start verification. Please try again." };
  }
  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: clean,
  });
  if (verifyError) {
    return {
      ok: false,
      error: "That code was not accepted. Codes change every 30 seconds, so please enter the current one.",
    };
  }
  return { ok: true };
}
