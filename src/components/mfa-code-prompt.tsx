import { useState } from "react";

/**
 * Accessible 6-digit authenticator code step, used before password or email
 * changes when the account has MFA enabled and the session is still AAL1.
 */
export function MfaCodePrompt({
  onVerify,
  busy,
  error,
  title = "Two factor verification",
  description = "Enter the 6-digit code from your authenticator app to continue.",
  submitLabel = "Verify code",
}: {
  onVerify: (code: string) => void | Promise<void>;
  busy?: boolean;
  error?: string | null;
  title?: string;
  description?: string;
  submitLabel?: string;
}) {
  const [code, setCode] = useState("");

  return (
    <div className="rounded-2xl border border-ink/15 bg-secondary/40 p-4">
      <h2 className="font-serif text-lg">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <label className="mt-4 block text-sm font-medium">
        <span className="sr-only">6-digit authenticator code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && code.length === 6 && !busy) {
              e.preventDefault();
              void onVerify(code);
            }
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          aria-label="6-digit authenticator code"
          aria-invalid={Boolean(error)}
          placeholder="000000"
          className="w-full rounded-xl border border-ink/20 bg-paper px-4 py-3 text-center text-2xl tracking-[0.4em] tabular-nums"
        />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void onVerify(code)}
        disabled={busy || code.length !== 6}
        className="mt-3 w-full rounded-full bg-velvet py-3 text-base font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Verifying…" : submitLabel}
      </button>
    </div>
  );
}
