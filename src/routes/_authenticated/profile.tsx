import { toUserMessage } from "@/lib/user-error";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { useSubscription } from "@/hooks/use-subscription";
import { getPublicTiers, type PricingTier } from "@/lib/pricing.functions";
import {
  changeSubscriptionPlan,
  cancelSubscriptionAtPeriodEnd,
  resumeSubscription,
  createPortalSession,
  updateMyNotificationPrefs,
  updateMyProfile,
  getMyProfile,
} from "@/lib/payments.functions";
import { confirmDialog, promptDialog } from "@/lib/confirm-dialog";
import { ReferralsSection } from "@/components/referrals-section";
import {
  exportMyData,
  requestAccountDeletion,
  cancelAccountDeletion,
  getDeletionStatus,
} from "@/lib/account.functions";
import { toast } from "sonner";
import { MediaPickerButton } from "@/components/media-picker-button";
import { needsMfaElevation, elevateWithTotp } from "@/lib/mfa-elevation";
import { MfaCodePrompt } from "@/components/mfa-code-prompt";
import { formatStampDate, formatTimestamp } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/profile")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" && ["account", "billing", "notifications", "security"].includes(search.tab)
      ? (search.tab as Tab)
      : undefined,
  }),

  head: () => ({ meta: [{ title: "My profile — The Kenroe Collective" }] }),
  component: ProfilePage,
});

type Tab = "account" | "billing" | "notifications" | "security";

// Map tier → ordered list of price lookup_keys to show as upgrade/downgrade options
const TIER_PRICES: { tier: "host" | "atelier"; monthly: string; yearly: string; name: string }[] = [
  { tier: "host", monthly: "host_monthly", yearly: "host_yearly", name: "Host" },
  { tier: "atelier", monthly: "atelier_monthly", yearly: "atelier_yearly", name: "Atelier" },
];

function ProfilePage() {
  const { tab: tabParam } = Route.useSearch();
  const tab: Tab = tabParam ?? "account";
  const navigate = useNavigate();


  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="border-b border-ink/5 py-10">
        <div className="mx-auto max-w-4xl lg:max-w-6xl px-6">
          <p className="text-[10px] uppercase tracking-widest text-velvet">Profile</p>
          <h1 className="mt-2 font-serif text-4xl">My account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage your details, subscription, and notification preferences.
          </p>
          <div className="mt-6 inline-flex flex-wrap rounded-full bg-secondary p-1">
            {(["account", "billing", "notifications", "security"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => navigate({ to: "/profile", search: { tab: t }, replace: true })}
                className={`rounded-full px-4 py-1.5 text-xs font-medium capitalize transition ${
                  tab === t ? "bg-paper text-ink shadow-sm" : "text-muted-foreground hover:text-ink"
                }`}
              >
                {t === "billing" ? "Plan & billing" : t}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="py-10">
        <div className="mx-auto max-w-4xl lg:max-w-6xl px-6">
          {tab === "account" && <AccountTab />}
          {tab === "billing" && <BillingTab />}
          {tab === "notifications" && <NotificationsTab />}
          {tab === "security" && <SecurityTab />}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

function AccountTab() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  // Track whether the avatar URL actually renders. Reset on every URL change so a
  // previously failed image can never leave the circle permanently blank.
  const [avatarLoad, setAvatarLoad] = useState<"idle" | "ok" | "error">("idle");
  useEffect(() => { setAvatarLoad("idle"); }, [avatarUrl]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMfaRequired, setPwMfaRequired] = useState(false);
  const [pwMfaError, setPwMfaError] = useState<string | null>(null);
  const [pwMfaBusy, setPwMfaBusy] = useState(false);

  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    getMyProfile().then((p) => {
      setEmail(p.email);
      setDisplayName(p.display_name ?? "");
      setAvatarUrl(p.avatar_url ?? "");
      setLoading(false);
    });
    supabase.auth.getUser().then(({ data }) => {
      setEmailVerified(Boolean(data.user?.email_confirmed_at));
    });
  }, []);

  async function resendVerification() {
    if (!email) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    setResending(false);
    setMsg(error ? error.message : `Verification email sent to ${email}.`);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await updateMyProfile({
      data: { display_name: displayName.trim(), avatar_url: avatarUrl.trim() },
    });
    setSaving(false);
    setMsg("error" in res ? (res.error ?? "Error") : "Saved");
  }

  async function savePassword() {
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setPwMsg(error.message ?? "Error");
      toast.error(error.message ?? "Could not update password");
      return false;
    }
    setPwMsg("Password updated, use it next time you sign in.");
    setPw("");
    toast.success("Password updated", {
      description: "Use your new password next time you sign in.",
    });
    return true;
  }

  async function changePassword() {
    setPwMsg(null);
    if (pw.length < 8) {
      setPwMsg("Password must be at least 8 characters");
      toast.error("Password must be at least 8 characters");
      return;
    }
    setPwSaving(true);
    try {
      // MFA accounts need an AAL2 session before Supabase allows a password change.
      if (await needsMfaElevation()) {
        setPwMfaRequired(true);
        setPwMfaError(null);
        setPwMsg("Enter your authenticator code to finish changing your password.");
        return;
      }
      await savePassword();
    } finally {
      setPwSaving(false);
    }
  }

  async function verifyPasswordMfa(code: string) {
    setPwMfaBusy(true);
    setPwMfaError(null);
    try {
      const res = await elevateWithTotp(code);
      if (!res.ok) {
        setPwMfaError(res.error);
        return;
      }
      const ok = await savePassword();
      if (ok) {
        setPwMfaRequired(false);
        setPwMsg("Password updated, use it next time you sign in.");
      }
    } finally {
      setPwMfaBusy(false);
    }
  }



  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <ReferralsSection />

      <div className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">
        <h2 className="font-serif text-xl">Profile details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-[120px_1fr] sm:items-start">
          <div className="relative size-24 overflow-hidden rounded-full bg-secondary ring-1 ring-ink/10">
            {avatarUrl && avatarLoad !== "error" ? (
              <img
                key={avatarUrl}
                src={avatarUrl}
                alt={displayName ? `${displayName} avatar` : "Your avatar"}
                className="size-full object-cover"
                onLoad={() => setAvatarLoad("ok")}
                onError={() => setAvatarLoad("error")}
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center text-2xl text-muted-foreground">
                <span>{(displayName || email || "?")[0]?.toUpperCase()}</span>
                {avatarLoad === "error" && (
                  <span className="px-1 text-center text-[9px] leading-tight text-amber-900">Couldn’t load image</span>
                )}
              </div>
            )}
          </div>
          <div className="space-y-4">
            <label className="block text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-2">
                Display name
                {displayName.trim().length >= 2 && (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">✓</span>
                )}
              </span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How guests will see you"
                className="mt-1.5 w-full rounded-lg bg-paper px-4 py-3 text-base ring-1 ring-ink/10 focus:ring-2 focus:ring-velvet focus:outline-none"
              />
            </label>
            <div className="block text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-2">
                Avatar
                {avatarUrl && !/^https?:\/\//i.test(avatarUrl) && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">⚠ Needs http(s)://</span>
                )}
                {/^https?:\/\/\S+/i.test(avatarUrl) && avatarLoad === "ok" && (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">✓ Image loads</span>
                )}
                {/^https?:\/\/\S+/i.test(avatarUrl) && avatarLoad === "idle" && (
                  <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Checking image…</span>
                )}
                {/^https?:\/\/\S+/i.test(avatarUrl) && avatarLoad === "error" && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">⚠ Image didn’t load — check the link</span>
                )}
              </span>
              <div
                className="mt-1.5 rounded-lg border border-dashed border-ink/15 bg-paper p-3 transition hover:border-velvet/40"
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={async (e) => {
                  e.preventDefault();
                  const f = e.dataTransfer?.files?.[0];
                  if (!f || !f.type.startsWith("image/")) return;
                  try {
                    const { uploadAndRecord } = await import("@/lib/media-uploads.functions");
                    const buf = await f.arrayBuffer();
                    const bytes = new Uint8Array(buf);
                    let bin = "";
                    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
                    const res: any = await uploadAndRecord({ data: { filename: f.name, contentType: f.type, base64: btoa(bin), source: "other", originalFilename: f.name } } as any);
                    setAvatarUrl(res.url);
                    toast.success("Avatar uploaded.");
                  } catch (err: any) { toast.error(err?.message ?? "Upload failed"); }
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <MediaPickerButton
                    source="other"
                    label="Upload or choose"
                    onPick={(url) => setAvatarUrl(url)}
                  />
                  <span className="text-[11px] text-muted-foreground">or drag an image here, or paste a link below.</span>
                </div>
                <input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://…"
                  inputMode="url"
                  className="mt-2 w-full rounded-lg bg-secondary/40 px-4 py-3 text-base ring-1 ring-ink/10 focus:ring-2 focus:ring-velvet focus:outline-none"
                />
              </div>
            </div>
            <label className="block text-xs font-medium text-muted-foreground">
              Email
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <input
                  value={email ?? ""}
                  disabled
                  className="w-full min-w-0 flex-1 break-anywhere rounded-lg bg-secondary/50 px-4 py-3 text-base text-muted-foreground ring-1 ring-ink/10"
                />
                {emailVerified === true ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-200">
                    ✓ Verified
                  </span>
                ) : emailVerified === false ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200">
                    Pending
                  </span>
                ) : null}
              </div>
              {emailVerified === false && (
                <button
                  type="button"
                  onClick={resendVerification}
                  disabled={resending}
                  className="mt-2 min-h-11 text-sm font-medium text-velvet hover:underline disabled:opacity-50"
                >
                  {resending ? "Sending…" : "Resend verification email"}
                </button>
              )}
            </label>
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="min-h-11 rounded-full bg-velvet px-5 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">
        <h2 className="font-serif text-xl">Change password</h2>
        <p className="mt-1 text-xs text-muted-foreground">At least 8 characters. Use a mix you can remember.</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <input
              type="password"
              value={pw}
              onChange={(e) => { setPw(e.target.value); if (pwMsg) setPwMsg(null); }}
              placeholder="New password (min 8 chars)"
              className="w-full rounded-lg bg-paper px-4 py-3 text-base ring-1 ring-ink/10 focus:ring-2 focus:ring-velvet focus:outline-none"
            />
            {pw.length > 0 && pw.length < 8 && (
              <p className="mt-1 text-xs text-amber-700">⚠ {8 - pw.length} more character{8 - pw.length === 1 ? "" : "s"} needed</p>
            )}
            {pw.length >= 8 && (
              <p className="mt-1 text-xs text-emerald-700">✓ Looks good</p>
            )}
          </div>
          <button
            onClick={changePassword}
            disabled={pwSaving}
            className="min-h-11 rounded-full bg-secondary px-5 py-3 text-sm font-medium hover:bg-secondary/70 disabled:opacity-50"
          >
            {pwSaving ? "Updating…" : "Update password"}
          </button>
        </div>
        {pwMsg && (
          <p className={`mt-2 text-sm ${pwMsg.startsWith("Password updated") ? "text-emerald-700" : "text-destructive"}`}>
            {pwMsg.startsWith("Password updated") ? "✓ " : "⚠ "}{pwMsg}
          </p>
        )}
        {pwMfaRequired && (
          <div className="mt-4">
            <MfaCodePrompt
              onVerify={verifyPasswordMfa}
              busy={pwMfaBusy}
              error={pwMfaError}
              description="Your account uses two factor authentication. Enter the 6-digit code from your authenticator app to confirm this change."
              submitLabel="Verify and save password"
            />
          </div>
        )}



      </div>


      <div className="rounded-2xl bg-card p-6 ring-1 ring-rose-200">
        <h2 className="font-serif text-xl text-rose-700">Sign out</h2>
        <p className="mt-1 text-xs text-muted-foreground">End your session on this device.</p>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            void router.navigate({ to: "/", replace: true });
          }}
          className="mt-3 rounded-full bg-rose-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
        >
          Sign out
        </button>
      </div>

      <DataPrivacyCard />
    </div>
  );
}

type ExportFormat = "json" | "csv" | "pdf";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows: any[]): string {
  if (!rows.length) return "(no rows)\n";
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r ?? {}))));
  const head = cols.map(csvEscape).join(",");
  const body = rows.map((r) => cols.map((c) => csvEscape(r?.[c])).join(",")).join("\n");
  return `${head}\n${body}\n`;
}

function buildCsv(data: any): string {
  const sections: Array<[string, any[]]> = [
    ["profile", data.profile ? [data.profile] : []],
    ["events", data.events ?? []],
    ["referrals", data.referrals ?? []],
    ["subscriptions", data.subscriptions ?? []],
    ["support_tickets", data.support_tickets ?? []],
  ];
  const header = `# Kenroe data export\n# Generated: ${data.generated_at}\n# User: ${data.user?.email ?? data.user?.id}\n\n`;
  return header + sections.map(([name, rows]) => `## ${name}\n${rowsToCsv(rows)}`).join("\n");
}

async function buildPdf(data: any): Promise<Blob> {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as any).default ?? autoTableMod;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setFontSize(16);
  doc.text("Kenroe data export", 40, 50);
  doc.setFontSize(10);
  doc.text(`Generated: ${data.generated_at}`, 40, 68);
  doc.text(`User: ${data.user?.email ?? data.user?.id ?? ""}`, 40, 82);

  let y = 110;
  const addTable = (title: string, rows: any[]) => {
    doc.setFontSize(13);
    doc.text(title, 40, y);
    y += 8;
    if (!rows.length) {
      autoTable(doc, { startY: y, head: [["(no rows)"]], body: [], styles: { fontSize: 9 } });
    } else {
      const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r ?? {}))));
      const body = rows.map((r) =>
        cols.map((c) => {
          const v = r?.[c];
          if (v === null || v === undefined) return "";
          return typeof v === "object" ? JSON.stringify(v) : String(v);
        }),
      );
      autoTable(doc, { startY: y, head: [cols], body, styles: { fontSize: 8, cellWidth: "wrap" }, headStyles: { fillColor: [124, 45, 107] } });
    }
    y = (doc as any).lastAutoTable.finalY + 24;
    if (y > 720) {
      doc.addPage();
      y = 60;
    }
  };

  addTable("Profile", data.profile ? [data.profile] : []);
  addTable("Events", data.events ?? []);
  addTable("Referrals", data.referrals ?? []);
  addTable("Subscriptions", data.subscriptions ?? []);
  addTable("Support tickets", data.support_tickets ?? []);

  return doc.output("blob");
}

function DataPrivacyCard() {
  const [busy, setBusy] = useState<null | "export-json" | "export-csv" | "export-pdf" | "delete" | "cancel">(null);
  const [deletionAt, setDeletionAt] = useState<string | null>(null);

  useEffect(() => {
    getDeletionStatus().then((r) => setDeletionAt(r.requested_at)).catch(() => {});
  }, []);

  async function onExport(format: ExportFormat) {
    setBusy(`export-${format}` as const);
    try {
      const data = await exportMyData();
      const stamp = new Date().toISOString().slice(0, 10);
      const base = `kenroe-data-export-${stamp}`;
      if (format === "json") {
        downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${base}.json`);
      } else if (format === "csv") {
        downloadBlob(new Blob([buildCsv(data)], { type: "text/csv;charset=utf-8" }), `${base}.csv`);
      } else {
        downloadBlob(await buildPdf(data), `${base}.pdf`);
      }
      toast.success("Your data export has been downloaded.");
    } catch (e) {
      toast.error(toUserMessage(e, "Export failed."));
    } finally {
      setBusy(null);
    }
  }


  async function onRequestDelete() {
    const ok = await confirmDialog({
      title:
        "Request account deletion? Your account will be scheduled for permanent deletion in 30 days. You can cancel any time during that window by signing back in.",
    });
    if (!ok) return;
    setBusy("delete");
    const res = await requestAccountDeletion();
    setBusy(null);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      setDeletionAt(res.requested_at);
      toast.success("Deletion scheduled. You have 30 days to cancel.");
    }
  }

  async function onCancelDelete() {
    setBusy("cancel");
    const res = await cancelAccountDeletion();
    setBusy(null);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      setDeletionAt(null);
      toast.success("Deletion canceled. Your account is safe.");
    }
  }

  const scheduledDelete = deletionAt
    ? new Date(new Date(deletionAt).getTime() + 30 * 24 * 60 * 60 * 1000)
    : null;

  return (
    <div className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">
      <h2 className="font-serif text-xl">Your data</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Download a copy of everything we store about you, or schedule your account for permanent deletion.
      </p>

      <div className="mt-4 space-y-3">
        <div className="flex flex-col justify-between gap-3 rounded-xl bg-secondary/40 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <p className="text-sm font-medium">Export your data</p>
            <p className="text-xs text-muted-foreground">
              JSON, CSV, or PDF with your profile, events, RSVPs, referrals, subscriptions, and support tickets.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["json", "csv", "pdf"] as const).map((fmt) => {
              const key = `export-${fmt}` as const;
              const isBusy = busy === key;
              return (
                <button
                  key={fmt}
                  onClick={() => onExport(fmt)}
                  disabled={!!busy}
                  className="min-h-11 rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isBusy ? "Preparing…" : fmt.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>


        {deletionAt ? (
          <div className="flex flex-col justify-between gap-3 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-900">
                Deletion scheduled for {formatStampDate(scheduledDelete)}
              </p>
              <p className="text-xs text-amber-800">
                Requested {formatTimestamp((deletionAt))}. Cancel any time before then.
              </p>
            </div>
            <button
              onClick={onCancelDelete}
              disabled={busy === "cancel"}
              className="min-h-11 rounded-full bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {busy === "cancel" ? "Canceling…" : "Keep my account"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col justify-between gap-3 rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <p className="text-sm font-medium text-rose-900">Delete my account</p>
              <p className="text-xs text-rose-800">
                Permanently removes your profile, events, guests, referrals, and support history after a 30-day grace period.
              </p>
            </div>
            <button
              onClick={onRequestDelete}
              disabled={busy === "delete"}
              className="min-h-11 rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {busy === "delete" ? "Scheduling…" : "Request deletion"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BillingTab() {
  const router = useRouter();
  const { loading, subscription, isActive, isGranted } = useSubscription();
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    getPublicTiers().then(setTiers).catch(() => {});
  }, []);

  let env: "sandbox" | "live" | null = null;
  try { env = getStripeEnvironment(); } catch { env = null; }

  async function switchPlan(newPriceId: string) {
    if (!env) return;
    setBusy(newPriceId);
    setMsg(null);
    if (!subscription) {
      // No active sub: send through checkout for the new plan
      void router.navigate({ to: "/checkout", search: { price: newPriceId } as any });
      return;
    }
    const res = await changeSubscriptionPlan({ data: { newPriceId, environment: env } });
    setBusy(null);
    setMsg("error" in res ? (res.error ?? "Error") : `Switched to ${newPriceId}. Charges prorated.`);
  }

  async function cancel() {
    if (!env || !subscription) return;
    if (!(await confirmDialog({ title: "Cancel at end of current billing period? You'll keep access until then." }))) return;
    setBusy("cancel");
    const res = await cancelSubscriptionAtPeriodEnd({ data: { environment: env } });
    setBusy(null);
    if ("error" in res) {
      setMsg(res.error ?? "Error");
    } else {
      setMsg("Cancellation scheduled.");
    }
  }

  async function resume() {
    if (!env) return;
    setBusy("resume");
    const res = await resumeSubscription({ data: { environment: env } });
    setBusy(null);
    setMsg("error" in res ? (res.error ?? "Error") : "Subscription resumed.");
  }

  async function openPortal() {
    if (!env) return;
    setBusy("portal");
    const res = await createPortalSession({ data: { environment: env, returnUrl: window.location.href } });
    setBusy(null);
    if ("error" in res) setMsg(res.error);
    else window.open(res.url, "_blank");
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const currentPriceId = subscription?.price_id ?? null;
  const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
  const isAtelierTrial = currentPriceId === "atelier_trial_30d";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-blush/40 p-4 text-sm">
        <div>
          <div className="font-medium text-ink">New: usage meters &amp; plan comparison</div>
          <div className="text-xs text-muted-foreground">See what you're using and compare every plan side-by-side.</div>
        </div>
        <Link
          to="/settings/billing"
          className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-90"
        >
          Open Billing &amp; plan
        </Link>
      </div>
      <div className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-velvet">Current plan</p>
            <h2 className="mt-1 font-serif text-2xl">
              {isAtelierTrial ? "Atelier trial" : currentPriceId ? currentPriceId.replace(/_/g, " ") : "Postcard (Free)"}
            </h2>
            {subscription && (
              <p className="mt-1 text-xs text-muted-foreground">
                Status: {subscription.status}
                {isAtelierTrial && periodEnd && (
                  <> · Trial ends <strong>{formatStampDate(periodEnd)}</strong> · 20-guest cap</>
                )}
                {!isAtelierTrial && subscription.cancel_at_period_end && periodEnd && (
                  <> · Access ends <strong>{formatStampDate(periodEnd)}</strong></>
                )}
                {!isAtelierTrial && !subscription.cancel_at_period_end && periodEnd && (
                  <> · Renews <strong>{formatStampDate(periodEnd)}</strong></>
                )}
              </p>
            )}
            {!isActive && !subscription && (
              <p className="mt-1 text-xs text-muted-foreground">No active subscription.</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {subscription && !isAtelierTrial && !isGranted && (
              <button
                onClick={openPortal}
                disabled={busy === "portal"}
                className="rounded-full bg-secondary px-4 py-1.5 text-xs font-medium hover:bg-secondary/70"
              >
                {busy === "portal" ? "Opening…" : "Manage payment & invoices"}
              </button>
            )}
            {isGranted && (
              <p className="max-w-xs text-xs text-muted-foreground">
                Granted plan, nothing to pay and no billing to manage.
              </p>
            )}
            {isAtelierTrial ? null : subscription?.cancel_at_period_end ? (
              <button
                onClick={resume}
                disabled={busy === "resume"}
                className="rounded-full bg-velvet px-4 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                {busy === "resume" ? "…" : "Resume subscription"}
              </button>
            ) : subscription ? (
              <button
                onClick={cancel}
                disabled={busy === "cancel"}
                className="rounded-full bg-rose-50 px-4 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
              >
                {busy === "cancel" ? "…" : "Cancel subscription"}
              </button>
            ) : null}
          </div>
        </div>
        {msg && <p className="mt-3 rounded-lg bg-secondary/50 px-3 py-2 text-xs">{msg}</p>}
      </div>

      <div>
        <h3 className="mb-3 font-serif text-xl">Available plans</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {tiers.map((t) => {
            // Map pricing_tiers.id → Stripe price lookup_keys. The legacy id
            // "free" is actually Whisper ($5); "postcard" is the true free tier.
            const priceKeys: Record<string, { monthly: string; yearly: string } | null> = {
              postcard: null,
              free: { monthly: "whisper_monthly", yearly: "whisper_yearly" },
              whisper: { monthly: "whisper_monthly", yearly: "whisper_yearly" },
              host: { monthly: "host_monthly", yearly: "host_yearly" },
              atelier: { monthly: "atelier_monthly", yearly: "atelier_yearly" },
            };
            const keys = priceKeys[t.id] ?? null;
            const monthlyKey = keys?.monthly ?? null;
            const yearlyKey = keys?.yearly ?? null;
            const isFreeTier = t.id === "postcard" || Number(t.price_monthly) === 0;
            const isCurrent = keys
              ? currentPriceId === monthlyKey || currentPriceId === yearlyKey
              : isFreeTier && !subscription;
            return (
              <div
                key={t.id}
                className={`rounded-2xl bg-card p-5 ring-1 ${isCurrent ? "ring-velvet" : "ring-ink/5"}`}
              >
                <div className="flex items-baseline justify-between">
                  <h4 className="font-serif text-lg">{t.name}</h4>
                  <span className="text-sm">
                    {isFreeTier ? "Free" : `$${t.price_monthly}/mo`}
                  </span>
                </div>
                <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{t.blurb}</p>
                <ul className="mt-3 space-y-1">
                  {t.features.slice(0, 4).map((f, i) => (
                    <li key={i} className="text-[11px] text-ink/80">✓ {f}</li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-col gap-2">
                  {isCurrent ? (
                    <span className="rounded-full bg-velvet/10 px-3 py-1.5 text-center text-[11px] font-medium text-velvet">
                      Current plan
                    </span>
                  ) : monthlyKey && yearlyKey ? (
                    <>
                      <button
                        onClick={() => switchPlan(monthlyKey)}
                        disabled={!env || busy === monthlyKey}
                        className="rounded-full bg-velvet px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {busy === monthlyKey ? "…" : `Switch to ${t.name} monthly`}
                      </button>
                      <button
                        onClick={() => switchPlan(yearlyKey)}
                        disabled={!env || busy === yearlyKey}
                        className="rounded-full bg-secondary px-3 py-1.5 text-[11px] font-medium hover:bg-secondary/70"
                      >
                        {busy === yearlyKey ? "…" : `${t.name} yearly`}
                      </button>
                    </>
                  ) : (
                    <Link to="/pricing" className="rounded-full bg-secondary px-3 py-1.5 text-center text-[11px] font-medium hover:bg-secondary/70">
                      See pricing
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Plan changes are prorated immediately — you'll be charged or credited the difference.
        </p>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState({
    product_updates: true,
    event_reminders: true,
    rfq_bids: true,
    marketing: false,
    // Join-request alerts default ON: a missed request leaves a real person
    // waiting, so hosts opt out rather than having to discover a switch.
    join_requests_email: true,
    join_requests_inapp: true,
    join_requests_sms: false,
  });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    getMyProfile().then((p) => {
      setPrefs((cur) => ({ ...cur, ...(p.notification_prefs as typeof cur) }));
      setLoading(false);
    });
  }, []);

  async function update(key: keyof typeof prefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    const res = await updateMyNotificationPrefs({ data: next });
    setMsg("error" in res ? (res.error ?? "Error") : "Saved");
    setTimeout(() => setMsg(null), 1500);
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const JOIN_ROWS: { key: keyof typeof prefs; label: string; desc: string }[] = [
    {
      key: "join_requests_email",
      label: "Email me",
      desc: "When a guest asks to be added to a guest list you manage, plus a reminder if it sits unanswered for two days.",
    },
    {
      key: "join_requests_inapp",
      label: "Show in my notifications bell",
      desc: "Join requests appear in the bell in the header alongside your other updates.",
    },
    {
      key: "join_requests_sms",
      label: "Text me",
      desc: "Optional. Needs Host or above, or the SMS add-on, and a mobile number saved with texts turned on.",
    },
  ];

  const ROWS: { key: keyof typeof prefs; label: string; desc: string }[] = [
    { key: "product_updates", label: "Product updates", desc: "New features, improvements, and What's New posts." },
    { key: "event_reminders", label: "Event reminders", desc: "Reminders for upcoming events you host or RSVP to." },
    { key: "rfq_bids", label: "Vendor bids", desc: "When a vendor responds to one of your RFQs." },
    { key: "marketing", label: "Tips & marketing", desc: "Occasional tips, inspiration, and promotional offers." },
  ];

  return (
    <div className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">
      <h2 className="font-serif text-xl">Email notifications</h2>
      <div className="mt-4 divide-y divide-ink/5">
        {ROWS.map((r) => (
          <label key={r.key} className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium">{r.label}</p>
              <p className="text-xs text-muted-foreground">{r.desc}</p>
            </div>
            <input
              type="checkbox"
              checked={prefs[r.key]}
              onChange={(e) => update(r.key, e.target.checked)}
              className="mt-1 size-5"
            />
          </label>
        ))}
      </div>
      {msg && <p className="mt-3 text-xs text-muted-foreground">{msg}</p>}

      <h2 className="mt-8 font-serif text-xl">Join requests</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Guests who can&apos;t find their name on a shared invite can ask to be added. You and your
        co-hosts are told right away.
      </p>
      <div className="mt-3 divide-y divide-ink/5">
        {JOIN_ROWS.map((r) => (
          <label key={r.key} className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium">{r.label}</p>
              <p className="text-xs text-muted-foreground">{r.desc}</p>
            </div>
            <input
              type="checkbox"
              checked={prefs[r.key]}
              onChange={(e) => update(r.key, e.target.checked)}
              className="mt-1 size-5"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function SecurityTab() {
  return <DevicesCard />;
}

function DevicesCard() {
  const [devices, setDevices] = useState<Array<{
    id: string; device_hash: string; user_agent: string | null; label: string | null;
    first_seen_at: string; last_seen_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { listMyDevices } = await import("@/lib/security.functions");
      const r = await listMyDevices();
      setDevices(r.devices as any);
      setErr(null);
    } catch (e) {
      setErr(toUserMessage(e, "Failed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function revoke(id: string) {
    if (!(await confirmDialog({ title: "Forget this device?", body: "You'll get a new-device email the next time you sign in from it." }))) return;
    const { revokeMyDevice } = await import("@/lib/security.functions");
    await revokeMyDevice({ data: { id } });
    toast.success("Device forgotten");
    void load();
  }

  async function rename(id: string, current: string | null) {
    const name = await promptDialog({ title: "Device name", defaultValue: current ?? "", confirmLabel: "Save" });
    if (name === null) return;
    const { updateMyDeviceLabel } = await import("@/lib/security.functions");
    await updateMyDeviceLabel({ data: { id, label: name } });
    toast.success("Renamed");
    void load();
  }

  return (
    <div className="rounded-3xl bg-card p-6 ring-1 ring-ink/5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl">Devices & sessions</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Devices you've signed in from. We email you when a new one shows up. Forgetting a device won't sign it out — it will re-alert you next time.
          </p>
        </div>
        <button
          onClick={async () => {
            if (!(await confirmDialog({
              title: "Sign out all other sessions?",
              body: "You'll stay signed in here. All your other devices will be signed out.",
            }))) return;
            try {
              const { signOutOtherSessions } = await import("@/lib/security.functions");
              await signOutOtherSessions();
              toast.success("Other sessions signed out");
            } catch (e) {
              toast.error(toUserMessage(e, "Failed"));
            }
          }}
          className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-ink/10"
        >
          Sign out other sessions
        </button>
      </div>
      {loading ? (
        <p className="mt-6 text-xs text-muted-foreground">Loading…</p>
      ) : err ? (
        <p className="mt-6 text-xs text-red-500">{err}</p>
      ) : devices.length === 0 ? (
        <p className="mt-6 text-xs text-muted-foreground">No devices on record yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-ink/5">
          {devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {d.label || summarizeUA(d.user_agent)}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Last seen {formatTimestamp((d.last_seen_at))} · First seen {formatStampDate((d.first_seen_at))}
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <button onClick={() => rename(d.id, d.label)} className="text-velvet hover:underline">Rename</button>
                <button onClick={() => revoke(d.id)} className="text-red-500 hover:underline">Forget</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function summarizeUA(ua: string | null): string {
  if (!ua) return "Unknown device";
  const s = ua.toLowerCase();
  const os = s.includes("iphone") ? "iPhone"
    : s.includes("ipad") ? "iPad"
    : s.includes("android") ? "Android"
    : s.includes("mac os") || s.includes("macintosh") ? "Mac"
    : s.includes("windows") ? "Windows"
    : s.includes("linux") ? "Linux"
    : "Device";
  const browser = s.includes("edg/") ? "Edge"
    : s.includes("chrome/") ? "Chrome"
    : s.includes("firefox/") ? "Firefox"
    : s.includes("safari/") ? "Safari"
    : "Browser";
  return `${os} · ${browser}`;
}
