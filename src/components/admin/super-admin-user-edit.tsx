import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  changeUserEmailAsSuperAdmin,
  confirmUserEmailAsSuperAdmin,
  resendInviteAsSuperAdmin,
  sendPasswordResetAsSuperAdmin,
  updateUserProfileAsSuperAdmin,
} from "@/lib/super-admin.functions";

type EditTarget = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  confirmed: boolean;
};

/** Super-admin-only inline editor for a user's name, email and account emails. */
export function SuperAdminUserEdit({
  user,
  onDone,
  onClose,
}: {
  user: EditTarget;
  onDone: () => void;
  onClose: () => void;
}) {
  const saveProfileFn = useServerFn(updateUserProfileAsSuperAdmin);
  const changeEmailFn = useServerFn(changeUserEmailAsSuperAdmin);
  const resetFn = useServerFn(sendPasswordResetAsSuperAdmin);
  const resendFn = useServerFn(resendInviteAsSuperAdmin);
  const confirmFn = useServerFn(confirmUserEmailAsSuperAdmin);

  const [name, setName] = useState(user.display_name ?? "");
  const [newEmail, setNewEmail] = useState(user.email ?? "");
  const [mode, setMode] = useState<"confirm" | "immediate">("confirm");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : undefined;
  const emailChanged =
    newEmail.trim().toLowerCase() !== (user.email ?? "").toLowerCase() && !!newEmail.trim();
  const typedMatches =
    !!user.email && typed.trim().toLowerCase() === user.email.toLowerCase();

  const run = async (fn: () => Promise<any>, close = false) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res && "error" in res) toast.error(res.error);
      else {
        toast.success(res?.message || "Done");
        onDone();
        if (close) onClose();
      }
    } catch (e: any) {
      toast.error(e?.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-xl bg-secondary/40 p-3 text-left ring-1 ring-ink/10">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium">Edit account</p>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="Close edit panel"
          className="rounded-full px-1.5 text-[11px] text-muted-foreground hover:bg-ink/5 disabled:opacity-40"
        >
          ✕
        </button>
      </div>

      <label className="mt-2 block text-[11px] text-muted-foreground">
        Display name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border border-ink/15 bg-paper px-2 py-1 text-xs text-foreground"
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        disabled={busy || name.trim() === (user.display_name ?? "").trim()}
        onClick={() => run(() => saveProfileFn({ data: { userId: user.user_id, displayName: name } }))}
        className="mt-1 w-full rounded-full bg-velvet px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-40"
      >
        Save name
      </button>

      <label className="mt-3 block text-[11px] text-muted-foreground">
        Email address
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="mt-1 w-full rounded border border-ink/15 bg-paper px-2 py-1 text-xs text-foreground"
          autoComplete="off"
        />
      </label>
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as "confirm" | "immediate")}
        aria-label="Email change mode"
        className="mt-1 w-full rounded border border-ink/15 bg-paper px-2 py-1 text-[11px]"
      >
        <option value="confirm">Send confirmation email (safest)</option>
        <option value="immediate">Change immediately (mark confirmed)</option>
      </select>
      {mode === "immediate" && (
        <label className="mt-1 block text-[11px] text-muted-foreground">
          Type <span className="font-mono">{user.email}</span> to confirm
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1 w-full rounded border border-ink/15 bg-paper px-2 py-1 text-xs text-foreground"
            autoComplete="off"
          />
        </label>
      )}
      <button
        type="button"
        disabled={busy || !emailChanged || (mode === "immediate" && !typedMatches)}
        onClick={() =>
          run(() =>
            changeEmailFn({
              data: {
                userId: user.user_id,
                newEmail: newEmail.trim(),
                mode,
                confirmEmail: typed,
                redirectTo: origin,
              },
            }),
          )
        }
        className="mt-1 w-full rounded-full bg-velvet px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-40"
      >
        {busy ? "Working…" : "Change email"}
      </button>

      <div className="mt-3 grid gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => resetFn({ data: { userId: user.user_id, redirectTo: origin } }))}
          className="rounded-full border border-ink/15 px-3 py-1.5 text-[11px] disabled:opacity-40"
        >
          Send password reset
        </button>
        {!user.confirmed && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() => resendFn({ data: { userId: user.user_id, redirectTo: origin } }))
              }
              className="rounded-full border border-ink/15 px-3 py-1.5 text-[11px] disabled:opacity-40"
            >
              Resend invitation
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => confirmFn({ data: { userId: user.user_id } }))}
              className="rounded-full border border-ink/15 px-3 py-1.5 text-[11px] disabled:opacity-40"
            >
              Confirm email manually
            </button>
          </>
        )}
      </div>
    </div>
  );
}
