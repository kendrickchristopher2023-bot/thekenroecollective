import { toUserMessage } from "@/lib/user-error";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveAuthRedirect, hasAuthRedirectParams } from "@/lib/auth-redirect";
import { needsMfaElevation, elevateWithTotp } from "@/lib/mfa-elevation";
import { MfaCodePrompt } from "@/components/mfa-code-prompt";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — The Kenroe Collective" },
      { name: "description", content: "Set a new password for your The Kenroe Collective account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  // MFA accounts arrive from the recovery link at AAL1. Supabase then refuses
  // the password update, so we ask for the authenticator code first.
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);


  useEffect(() => {
    let active = true;
    // One shared helper handles every link shape: PKCE `?code=`, legacy
    // `#access_token=` hash, and `?token_hash=` verification links.
    (async () => {
      const res = await resolveAuthRedirect();
      if (!active) return;
      if (res.session) {
        setRecoveryReady(true);
        setLinkError(null);
      } else if (res.error) {
        setLinkError(res.error);
      } else if (!hasAuthRedirectParams()) {
        setLinkError(null);
      }
      setChecking(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        setRecoveryReady(true);
        setLinkError(null);
        setChecking(false);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Once the recovery session exists, find out whether this account has a
  // verified MFA factor. If so we must reach AAL2 before updating the password.
  useEffect(() => {
    if (!recoveryReady) return;
    let active = true;
    void needsMfaElevation().then((needed) => {
      if (active) setMfaRequired(needed);
    });
    return () => {
      active = false;
    };
  }, [recoveryReady]);

  async function applyNewPassword() {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    toast.success("Password updated", {
      description: "You're signed in, taking you to your events.",
    });
    setPassword("");
    setConfirm("");
    navigate({ to: "/events" });
  }

  async function onVerifyCode(code: string) {
    setMfaBusy(true);
    setMfaError(null);
    try {
      const res = await elevateWithTotp(code);
      if (!res.ok) {
        setMfaError(res.error);
        return;
      }
      setMfaRequired(false);
      await applyNewPassword();
    } catch (err) {
      setMfaError(toUserMessage(err, "Could not update password"));
    } finally {
      setMfaBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    // Re-check right before the write: the factor list can load late.
    if (mfaRequired || (await needsMfaElevation())) {
      setMfaRequired(true);
      setMfaError(null);
      toast.info("Enter your authenticator code to finish the reset.");
      return;
    }
    setLoading(true);
    try {
      await applyNewPassword();
    } catch (err) {
      toast.error(toUserMessage(err, "Could not update password"));
    } finally {
      setLoading(false);
    }
  }



  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-serif text-3xl">Set a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {recoveryReady
            ? "Choose a new password for your account."
            : checking
              ? "Verifying your reset link…"
              : "Open the reset link from your email to continue. If you just clicked it, give us a moment…"}
        </p>
        {linkError && !recoveryReady && (
          <p className="mt-3 text-sm text-destructive">
            ⚠ {linkError} Reset links expire and can only be used once, so request a fresh one from the sign-in page.
          </p>
        )}

        {mfaRequired && recoveryReady && (
          <div className="mt-6">
            <MfaCodePrompt
              onVerify={onVerifyCode}
              busy={mfaBusy}
              error={mfaError}
              description="This account uses two factor authentication. Enter the 6-digit code from your authenticator app, then we will save your new password."
              submitLabel="Verify and save password"
            />
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-3">

          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (min 8 characters)"
            className="w-full rounded-xl border border-ink/15 bg-paper px-4 py-2.5 text-sm"
            disabled={!recoveryReady}
          />
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className="w-full rounded-xl border border-ink/15 bg-paper px-4 py-2.5 text-sm"
            disabled={!recoveryReady}
          />
          <button
            disabled={loading || !recoveryReady}
            className="w-full rounded-full bg-velvet py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link to="/auth" search={{ redirect: undefined }} className="hover:underline">← Back to sign in</Link>
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
