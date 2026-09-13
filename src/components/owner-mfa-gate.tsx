import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getOwnerMfaStatus, type OwnerMfaStatus } from "@/lib/owner-mfa.functions";
import { SiteNav } from "@/components/site-nav";
import { toast } from "sonner";

/**
 * Hard gate for owner-only surfaces. Owner and super_admin accounts must have a
 * verified authenticator app AND must have passed the challenge in this session
 * (aal2). Until then this renders the enrollment / verification flow instead of
 * the owner console — not a dismissible banner. Server functions enforce the
 * same rule independently, so this is UX, not the security boundary.
 */
export function OwnerMfaGate({ children }: { children: React.ReactNode }) {
  const fetchStatus = useServerFn(getOwnerMfaStatus);
  const [status, setStatus] = useState<OwnerMfaStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchStatus());
    } catch {
      setStatus({ isOwner: false, enrolled: false, aal: "aal1", satisfied: false });
    }
  }, [fetchStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (status === null) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="p-12 text-center text-sm text-muted-foreground">Checking security…</div>
      </div>
    );
  }

  if (!status.isOwner || status.satisfied) return <>{children}</>;

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <div className="mx-auto max-w-md px-6 py-14">
        {status.enrolled ? (
          <ChallengeForm onDone={refresh} />
        ) : (
          <EnrollForm onDone={refresh} />
        )}
      </div>
    </div>
  );
}

function Shell({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-ink/10">
      <h1 className="font-serif text-2xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{blurb}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}

function CodeInput({
  code,
  setCode,
  onSubmit,
  busy,
  label,
}: {
  code: string;
  setCode: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-3"
    >
      <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        6-digit code
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          className="mt-1 w-full rounded-xl bg-secondary px-3 py-2 text-base tracking-[0.4em] ring-1 ring-ink/10"
        />
      </label>
      <button
        type="submit"
        disabled={busy || code.length !== 6}
        className="w-full rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Verifying…" : label}
      </button>
    </form>
  );
}

function EnrollForm({ onDone }: { onDone: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Clear out any half-finished (unverified) factor so enrollment can retry.
      const { data: list } = await supabase.auth.mfa.listFactors();
      const stale = (list?.all ?? []).filter((f) => f.status !== "verified");
      for (const f of stale) await supabase.auth.mfa.unenroll({ factorId: f.id });

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Owner console ${new Date().toISOString()}`,
      });
      if (!alive) return;
      if (error || !data) {
        toast.error(error?.message ?? "Could not start two-factor setup");
        return;
      }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function verify() {
    if (!factorId) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Two-factor authentication enabled.");
    setCode("");
    onDone();
  }

  return (
    <Shell
      title="Two-factor required"
      blurb="Owner accounts must use an authenticator app. Scan this code with Google Authenticator, 1Password, or Authy, then enter the 6-digit code to finish."
    >
      {qr ? (
        <div className="flex flex-col items-center gap-3">
          <img src={qr} alt="Two-factor authentication setup QR code" className="h-44 w-44" />
          {secret && (
            <p className="break-all text-center text-[11px] text-muted-foreground">
              Can't scan? Enter this key manually: <span className="font-mono">{secret}</span>
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Preparing your setup code…</p>
      )}
      <CodeInput code={code} setCode={setCode} onSubmit={verify} busy={busy} label="Enable two-factor" />
    </Shell>
  );
}

function ChallengeForm({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    const { data: list } = await supabase.auth.mfa.listFactors();
    const factor = (list?.totp ?? [])[0];
    if (!factor) {
      setBusy(false);
      toast.error("No authenticator found for this account.");
      onDone();
      return;
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCode("");
    onDone();
  }

  return (
    <Shell
      title="Verify it's you"
      blurb="Enter the current code from your authenticator app to unlock the owner console for this session."
    >
      <CodeInput code={code} setCode={setCode} onSubmit={verify} busy={busy} label="Verify code" />
    </Shell>
  );
}
