import { toUserMessage } from "@/lib/user-error";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import {
  deleteTier,
  getAllTiersAdmin,
  meIsOwner,
  upsertTier,
} from "@/lib/pricing.functions";
import { deleteDiscount, listDiscounts, upsertDiscount } from "@/lib/discounts.functions";
import { getRevenueDashboard } from "@/lib/owner-revenue.functions";
import { getSiteSettings, updateSiteSettings } from "@/lib/site-settings.functions";
import { getCardLink, updateCardLink } from "@/lib/card-link.functions";
import {
  createBusinessCard,
  deleteBusinessCard,
  listAllBusinessCards,
  updateBusinessCard,
} from "@/lib/business-card.functions";
import {
  getRefundCopy,
  listRefundCopyHistory,
  updateRefundCopy,
  type RefundCopy,
} from "@/lib/refund-copy.functions";
import {
  cardDisplayName,
  missingCardFields,
  signatureHtml,
  signatureText,
  type BusinessCard,
} from "@/lib/business-card";
import { getStudioPublic, setStudioPublic } from "@/lib/music-studio.functions";
import { listTickets, updateTicket } from "@/lib/support.functions";
import {
  cancelSubscriptionAsOwner,
  createManualSubscription,
  listAllSubscriptions,
  type OwnerSubscriptionRow,
} from "@/lib/owner-subscriptions.functions";
import {
  listVendorsForReview,
  setVendorReviewStatus,
  setAdReviewStatus,
  deleteVendorAsOwner,
} from "@/lib/vendors-admin.functions";
import { RecentUpdatesReport } from "@/components/admin/recent-updates-report";
import { OwnerProductUpdatesPanel } from "@/components/admin/owner-product-updates-panel";
import { ErrorMonitoringPanel, MetricTile } from "@/components/admin/error-monitoring-panel";
import { OwnerUsersPanel } from "@/components/admin/owner-users-panel";
import { BackupsPanel } from "@/components/admin/backups-panel";
import { SoundStudioPanel } from "@/components/admin/sound-studio-panel";
import { InviteHealthPanel } from "@/components/admin/invite-health-panel";

import { MessagingReportPanel } from "@/components/admin/messaging-report-panel";
import { OwnerReportPanel } from "@/components/admin/owner-report-panel";
import { OwnerAssistantPanel } from "@/components/admin/owner-assistant-panel";
import { PaymentReconciliationPanel } from "@/components/admin/payment-reconciliation-panel";
import { GuestNeedsPanel } from "@/components/admin/guest-needs-panel";

import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm-dialog";
import { formatOwnerId } from "@/lib/format-owner";
import { OwnerMfaGate } from "@/components/owner-mfa-gate";
import { isDemoRuntime, enterDemo, exitDemo } from "@/lib/demo-mode";
import { formatStampDate, formatTimestamp } from "@/lib/datetime";

const TABS = [
  { id: "revenue", label: "Revenue" },
  { id: "report", label: "Owner Report" },
  { id: "assistant", label: "Owner assistant" },
  { id: "approvals", label: "Vendor approvals" },
  { id: "announcements", label: "Announcements" },
  { id: "reports", label: "Reports" },
  { id: "reconciliation", label: "Payment reconciliation" },
  { id: "guestneeds", label: "Dietary & accessibility" },
  { id: "tiers", label: "Pricing tiers" },
  { id: "discounts", label: "Discounts" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "users", label: "Users" },
  { id: "support", label: "Support inbox" },
  { id: "settings", label: "Site settings" },
  { id: "messaging", label: "Messaging log" },
  { id: "errors", label: "Error monitoring" },
  { id: "invitehealth", label: "Invitation health" },
  { id: "backups", label: "Backups" },
  { id: "music", label: "Sound Studio" },
  { id: "brand", label: "Brand kit" },

] as const;


type TabId = typeof TABS[number]["id"];

export const Route = createFileRoute("/_authenticated/owner")({
  validateSearch: (search: Record<string, unknown>) => {
    const tab = typeof search.tab === "string" && TABS.some((t) => t.id === search.tab)
      ? (search.tab as TabId)
      : undefined;
    return { tab };
  },

  head: () => ({ meta: [{ title: "Owner — The Kenroe Collective" }] }),
  component: () => (
    <OwnerMfaGate>
      <OwnerPage />
    </OwnerMfaGate>
  ),
});

function OwnerPage() {
  const { tab: tabParam } = Route.useSearch();
  const tab: TabId = tabParam ?? "revenue";
  const navigate = useNavigate();

  const checkOwner = useServerFn(meIsOwner);
  // Always gated on the real server check — a sessionStorage-cached flag
  // here would be trivially settable from devtools and would render the
  // owner console's structure before access is actually verified.
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  useEffect(() => {
    checkOwner()
      .then((r) => setIsOwner(r.isOwner))
      .catch(() => setIsOwner(false));
  }, []);

  if (isOwner === null) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <h1 className="font-serif text-3xl">Owner access only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This area is reserved for site owners. Admins manage day-to-day operations, but pricing,
            tiers, and discount codes belong to the owner of this product.
          </p>
          <p className="mt-6 text-xs">
            <Link to="/admin" className="text-muted-foreground hover:underline">Back to admin</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-4xl">
              Owner console
              <span className="ml-3 align-middle rounded-full bg-velvet/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-velvet">Owner</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Product-level controls — pricing, tiers, and discount codes. Not visible to admins.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link to="/owner-analytics" className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white">
              Analytics →
            </Link>
            <Link to="/owner-events" className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white">
              All events →
            </Link>
            <Link to="/owner-projects" className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white">
              All projects →
            </Link>
            <Link
              to="/reports"
              search={{ event: undefined, open: undefined }}
              className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white"
            >
              Reports hub →
            </Link>
            <Link to="/admin" className="rounded-full bg-secondary px-4 py-2 text-xs font-medium">
              Admin dashboard →
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 rounded-full bg-secondary p-1 ring-1 ring-ink/10 w-fit">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => navigate({ to: "/owner", search: { tab: t.id }, replace: true })}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                tab === t.id ? "bg-paper text-ink shadow-sm" : "text-muted-foreground hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "revenue" && <RevenueDashboard />}
        {tab === "report" && <OwnerReportPanel />}
        {tab === "assistant" && <OwnerAssistantPanel />}
        {tab === "approvals" && <VendorApprovalsPanel />}
        {tab === "announcements" && <OwnerProductUpdatesPanel />}
        {tab === "reports" && <RecentUpdatesReport limit={5} />}
        {tab === "reconciliation" && <PaymentReconciliationPanel />}
        {tab === "guestneeds" && <GuestNeedsPanel />}

        {tab === "tiers" && <TiersPanel />}
        {tab === "discounts" && <DiscountsPanel />}
        {tab === "subscriptions" && <SubscriptionsPanel />}
        {tab === "users" && <OwnerUsersPanel />}
        {tab === "support" && <TicketsPanel />}
        {tab === "settings" && <SettingsPanel />}
        {tab === "messaging" && <MessagingReportPanel />}
        {tab === "errors" && <ErrorMonitoringPanel />}
        {tab === "invitehealth" && <InviteHealthPanel />}
        {tab === "backups" && <BackupsPanel />}
        {tab === "music" && <SoundStudioPanel />}
        {tab === "brand" && <BrandKitPanel />}


      </div>
      <SiteFooter />
    </div>
  );
}

/**
 * The logo pack is limited to Chris's and Adrian's accounts (the Owner Report
 * allowlist, without the 2FA step), so this tab is a signpost, not the files.
 * The Brand page itself checks the allowlist on the server before it loads.
 */
function BrandKitPanel() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <h2 className="font-serif text-xl text-foreground">Brand kit</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Every version of the logo, the printable scan codes for the business cards, and the
        printing rules. Limited to Chris and Adrian's accounts. Download links on that page are
        short-lived, so reload it if a link has gone stale.
      </p>
      <Link
        to="/brand"
        className="mt-5 inline-flex items-center rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white"
      >
        Open the Brand kit →
      </Link>
    </div>
  );
}

type Ticket = {
  id: string;
  contact_email: string;
  contact_name: string | null;
  subject: string;
  message: string;
  ai_draft: string | null;
  final_reply: string | null;
  status: string;
  created_at: string;
};

function TicketsPanel() {
  const fetchAll = useServerFn(listTickets);
  const update = useServerFn(updateTicket);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = () => fetchAll().then((r) => setTickets(r as Ticket[]));
  useEffect(() => { load(); }, []);

  return (
    <section>
      <h2 className="font-serif text-2xl">Support inbox</h2>
      <p className="mt-1 text-xs text-muted-foreground">Tickets arrive here from the Contact form and support widget. AI drafts a reply you can edit before sending.</p>
      <div className="mt-4 space-y-3">
        {tickets.map((t) => {
          const draft = drafts[t.id] ?? t.final_reply ?? t.ai_draft ?? "";
          return (
            <details key={t.id} className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
              <summary className="cursor-pointer text-sm">
                <span className="font-medium">{t.subject}</span>
                <span className="ml-2 text-xs text-muted-foreground">{t.contact_name || t.contact_email} · {formatTimestamp((t.created_at))} · {t.status}</span>
              </summary>
              <div className="mt-3 space-y-3 text-sm">
                <div className="rounded-xl bg-secondary/40 p-3 whitespace-pre-wrap">{t.message}</div>
                <div className="text-xs font-medium text-velvet">AI-drafted reply (edit before sending):</div>
                <textarea
                  value={draft}
                  onChange={(e) => setDrafts({ ...drafts, [t.id]: e.target.value })}
                  rows={6}
                  className="w-full rounded-xl border border-ink/15 p-3 text-sm"
                />
                <div className="flex gap-2">
                  <a
                    href={`mailto:${t.contact_email}?subject=${encodeURIComponent("Re: " + t.subject)}&body=${encodeURIComponent(draft)}`}
                    onClick={async () => { await update({ data: { id: t.id, final_reply: draft, status: "answered" } }); load(); }}
                    className="rounded-full bg-velvet px-4 py-1.5 text-xs font-medium text-white"
                  >
                    Open in email
                  </a>
                  <button
                    onClick={async () => { await update({ data: { id: t.id, final_reply: draft } }); toast.success("Saved"); load(); }}
                    className="rounded-full bg-secondary px-4 py-1.5 text-xs"
                  >
                    Save draft
                  </button>
                  <button
                    onClick={async () => { await update({ data: { id: t.id, status: "closed" } }); load(); }}
                    className="rounded-full bg-secondary px-4 py-1.5 text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
            </details>
          );
        })}
        {tickets.length === 0 && (
          <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-ink/5">
            <div className="text-2xl">📭</div>
            <p className="mt-2 text-sm font-medium">Inbox zero</p>
            <p className="mt-1 text-xs text-muted-foreground">New tickets from /contact will land here.</p>
          </div>
        )}
      </div>
    </section>
  );
}

type Tier = {
  id: string;
  name: string;
  blurb: string;
  price_monthly: number;
  features: string[] | unknown;
  popular: boolean;
  sort_order: number;
  active: boolean;
};

function TiersPanel() {
  const fetchTiers = useServerFn(getAllTiersAdmin);
  const save = useServerFn(upsertTier);
  const del = useServerFn(deleteTier);
  const [tiers, setTiers] = useState<Tier[]>([]);

  const load = () => fetchTiers().then((r) => setTiers(r as Tier[]));
  useEffect(() => { load(); }, []);

  function updateField(i: number, patch: Partial<Tier>) {
    setTiers((arr) => arr.map((t, j) => (i === j ? { ...t, ...patch } : t)));
  }

  async function saveRow(t: Tier, i: number) {
    if (!t.id.trim()) {
      toast.error("Tier needs an id.");
      return;
    }
    if (tiers.some((other, j) => j !== i && other.id === t.id)) {
      toast.error(`Another tier already uses id "${t.id}".`);
      return;
    }
    if (!t.name.trim()) {
      toast.error("Tier needs a name.");
      return;
    }
    if (!Number.isFinite(Number(t.price_monthly)) || Number(t.price_monthly) < 0) {
      toast.error("Price must be zero or more.");
      return;
    }
    if (!Number.isFinite(Number(t.sort_order))) {
      toast.error("Order must be a number.");
      return;
    }
    try {
      await save({
        data: {
          id: t.id,
          name: t.name,
          blurb: t.blurb,
          price_monthly: Number(t.price_monthly),
          features: Array.isArray(t.features) ? (t.features as string[]) : [],
          popular: !!t.popular,
          sort_order: Number(t.sort_order),
          active: !!t.active,
        },
      });
      toast.success(`${t.name} saved`);
    } catch (e) {
      toast.error(toUserMessage(e, "Save failed"));
    }
  }

  function addNew() {
    setTiers((arr) => [
      ...arr,
      { id: "new-" + Date.now(), name: "New tier", blurb: "", price_monthly: 0, features: [], popular: false, sort_order: arr.length + 1, active: true },
    ]);
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl">Pricing tiers</h2>
        <button onClick={addNew} className="rounded-full bg-velvet/10 px-3 py-1.5 text-xs font-medium text-velvet">+ Add tier</button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {tiers.map((t, i) => (
          <div key={t.id + i} className="rounded-2xl bg-card p-4 ring-1 ring-ink/5 space-y-2">
            <input value={t.id} onChange={(e) => updateField(i, { id: e.target.value })} className="w-full rounded border border-ink/10 px-2 py-1 text-xs font-mono" />
            <input value={t.name} onChange={(e) => updateField(i, { name: e.target.value })} className="w-full rounded border border-ink/10 px-2 py-1 text-sm font-medium" />
            <textarea value={t.blurb} onChange={(e) => updateField(i, { blurb: e.target.value })} className="w-full rounded border border-ink/10 px-2 py-1 text-xs" rows={2} />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">$</span>
              <input type="number" value={t.price_monthly} onChange={(e) => updateField(i, { price_monthly: Number(e.target.value) })} className="w-24 rounded border border-ink/10 px-2 py-1 text-sm" />
              <span className="text-xs text-muted-foreground">/mo</span>
            </div>
            <textarea
              value={(Array.isArray(t.features) ? (t.features as string[]) : []).join("\n")}
              onChange={(e) => updateField(i, { features: e.target.value.split("\n").filter(Boolean) })}
              className="w-full rounded border border-ink/10 px-2 py-1 text-xs"
              rows={6}
              placeholder="One feature per line"
            />
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1"><input type="checkbox" checked={t.popular} onChange={(e) => updateField(i, { popular: e.target.checked })} /> Popular</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={t.active} onChange={(e) => updateField(i, { active: e.target.checked })} /> Active</label>
              <label className="flex items-center gap-1">Order <input type="number" value={t.sort_order} onChange={(e) => updateField(i, { sort_order: Number(e.target.value) })} className="w-12 rounded border border-ink/10 px-1" /></label>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => saveRow(t, i)} className="flex-1 rounded-full bg-velvet py-1.5 text-xs font-medium text-white">Save</button>
              <button onClick={async () => { if (!(await confirmDialog({ title: "Delete?" }))) return; if (!t.id.startsWith("new-")) await del({ data: { id: t.id } }); load(); }} className="rounded-full bg-secondary px-3 py-1.5 text-xs">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

type Discount = {
  id?: string;
  code: string;
  percent_off: number | null;
  amount_off: number | null;
  tier_id: string | null;
  expires_at: string | null;
  max_uses: number | null;
  used_count?: number;
  active: boolean;
};

function DiscountsPanel() {
  const fetchAll = useServerFn(listDiscounts);
  const save = useServerFn(upsertDiscount);
  const del = useServerFn(deleteDiscount);
  const [codes, setCodes] = useState<Discount[]>([]);
  const [draft, setDraft] = useState<Discount>({ code: "", percent_off: 10, amount_off: null, tier_id: null, expires_at: null, max_uses: null, active: true });

  const load = () => fetchAll().then((r) => setCodes(r as Discount[]));
  useEffect(() => { load(); }, []);

  async function create() {
    const code = draft.code.trim().toUpperCase();
    if (!code) {
      toast.error("Enter a code.");
      return;
    }
    if (codes.some((c) => c.id !== draft.id && c.code.toUpperCase() === code)) {
      toast.error(`Code "${code}" already exists.`);
      return;
    }
    if (!draft.percent_off && !draft.amount_off) {
      toast.error("Set a percent-off or dollar-off amount.");
      return;
    }
    try {
      await save({ data: { ...draft, code } });
      toast.success("Code saved");
      setDraft({ code: "", percent_off: 10, amount_off: null, tier_id: null, expires_at: null, max_uses: null, active: true });
      load();
    } catch (e) {
      toast.error(toUserMessage(e, "Failed"));
    }
  }

  // ---- Performance stats (Item 3) ----
  const stats = (() => {
    const active = codes.filter((c) => c.active).length;
    const redemptions = codes.reduce((sum, c) => sum + (c.used_count ?? 0), 0);
    const avgPercent =
      codes.filter((c) => c.percent_off).reduce((s, c) => s + (c.percent_off ?? 0), 0) /
      Math.max(1, codes.filter((c) => c.percent_off).length);
    const top = [...codes].sort((a, b) => (b.used_count ?? 0) - (a.used_count ?? 0))[0];
    const expiringSoon = codes.filter(
      (c) => c.active && c.expires_at && new Date(c.expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000,
    ).length;
    return { active, total: codes.length, redemptions, avgPercent, top, expiringSoon };
  })();

  return (
    <section>
      <h2 className="font-serif text-2xl">Discount codes</h2>

      {/* Performance strip */}
      {codes.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Active codes</div>
            <div className="mt-1 font-serif text-2xl">{stats.active}<span className="text-sm text-muted-foreground">/{stats.total}</span></div>
          </div>
          <div className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Total redemptions</div>
            <div className="mt-1 font-serif text-2xl">{stats.redemptions}</div>
          </div>
          <div className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Avg discount</div>
            <div className="mt-1 font-serif text-2xl">{isFinite(stats.avgPercent) ? `${Math.round(stats.avgPercent)}%` : "—"}</div>
          </div>
          <div className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Top code</div>
            <div className="mt-1 font-serif text-lg truncate" title={stats.top?.code ?? ""}>
              {stats.top && (stats.top.used_count ?? 0) > 0 ? (
                <>
                  <span className="font-mono">{stats.top.code}</span>
                  <span className="ml-2 text-sm text-muted-foreground">{stats.top.used_count}</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">No redemptions yet</span>
              )}
            </div>
          </div>
        </div>
      )}

      {stats.expiringSoon > 0 && (
        <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-500/20">
          {stats.expiringSoon} code{stats.expiringSoon === 1 ? "" : "s"} expiring in the next 7 days.
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-card p-4 ring-1 ring-ink/5">
        <div className="grid gap-2 sm:grid-cols-6 text-xs">
          <input placeholder="CODE" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className="rounded border border-ink/10 px-2 py-1.5 font-mono" />
          <input type="number" min={0} max={100} placeholder="% off" value={draft.percent_off ?? ""} onChange={(e) => setDraft({ ...draft, percent_off: e.target.value ? Math.max(0, Math.min(100, Number(e.target.value))) : null })} className="rounded border border-ink/10 px-2 py-1.5" />
          <input type="number" min={0} placeholder="$ off" value={draft.amount_off ?? ""} onChange={(e) => setDraft({ ...draft, amount_off: e.target.value ? Math.max(0, Number(e.target.value)) : null })} className="rounded border border-ink/10 px-2 py-1.5" />
          <select value={draft.tier_id ?? ""} onChange={(e) => setDraft({ ...draft, tier_id: e.target.value || null })} className="rounded border border-ink/10 px-2 py-1.5">
            <option value="">All plans</option>
            <option value="free">Whisper</option>
            <option value="host">Host</option>
            <option value="atelier">Atelier</option>
          </select>
          <input type="number" min={1} placeholder="Max uses" value={draft.max_uses ?? ""} onChange={(e) => setDraft({ ...draft, max_uses: e.target.value ? Math.max(1, Number(e.target.value)) : null })} className="rounded border border-ink/10 px-2 py-1.5" />
          <button onClick={create} disabled={!draft.code.trim()} className="rounded-full bg-velvet text-white py-1.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed">Add code</button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {codes.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-xl bg-card p-3 text-sm ring-1 ring-ink/5">
            <div>
              <span className="font-mono font-semibold">{c.code}</span>
              <span className="ml-3 text-xs text-muted-foreground">
                {c.percent_off ? `${c.percent_off}% off` : c.amount_off ? `$${c.amount_off} off` : "—"}
                {c.tier_id ? ` · ${c.tier_id}` : ""}
                {c.max_uses ? ` · ${c.used_count}/${c.max_uses}` : ""}
                {!c.active && " · inactive"}
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={async () => { await save({ data: { ...c, active: !c.active } }); load(); }} className="rounded-full bg-secondary px-3 py-1 text-xs">{c.active ? "Disable" : "Enable"}</button>
              <button onClick={async () => { if (!(await confirmDialog({ title: "Delete code?" }))) return; await del({ data: { id: c.id! } }); load(); }} className="rounded-full bg-secondary px-3 py-1 text-xs">Delete</button>
            </div>
          </div>
        ))}
        {codes.length === 0 && <p className="text-xs text-muted-foreground">No discount codes yet.</p>}
      </div>
    </section>
  );
}

type RevenueData = Awaited<ReturnType<typeof getRevenueDashboard>>;

function RevenueDashboard() {
  const fetchRevenue = useServerFn(getRevenueDashboard);
  const [data, setData] = useState<RevenueData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchRevenue()
      .then((r) => setData(r as RevenueData))
      .catch((e) => setErr(toUserMessage(e, "Failed to load")));
  }, []);

  if (err) {
    return (
      <section className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-200">
        Could not load revenue dashboard: {err}
      </section>
    );
  }
  if (!data) {
    return <section className="rounded-2xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-ink/5">Loading revenue…</section>;
  }

  const cards: { label: string; value: string; hint?: string; tone: string }[] = [
    {
      label: "Active subscribers",
      value: String(data.subscriptions.active),
      hint: `${data.subscriptions.total} total over time`,
      tone: "violet",
    },
    {
      label: "Verified vendors",
      value: String(data.vendors.byStatus["verified"] || 0),
      hint: `${data.vendors.total} total profiles`,
      tone: "emerald",
    },
    {
      label: "Open RFQs",
      value: String((data.rfqs.byStatus["open"] || 0) + (data.rfqs.byStatus["quoted"] || 0)),
      hint: `${data.rfqs.total} all-time`,
      tone: "sky",
    },
    {
      label: "Active ad placements",
      value: String(data.ads.active),
      hint: `${data.ads.clicks} clicks / ${data.ads.impressions} views`,
      tone: "amber",
    },
    {
      label: "Avg vendor rating",
      value: data.reviews.total ? data.reviews.averageRating.toFixed(2) : "—",
      hint: `${data.reviews.total} reviews`,
      tone: "rose",
    },
  ];

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-2xl">Revenue &amp; marketplace</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Live production data
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <MetricTile key={c.label} label={c.label} value={c.value} hint={c.hint} tone={c.tone} />
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <BreakdownCard title="Subscribers by tier" rows={data.subscriptions.byTier} />
        <BreakdownCard title="Vendors by status" rows={data.vendors.byStatus} />
        <BreakdownCard title="RFQs by status" rows={data.rfqs.byStatus} />
      </div>
    </section>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: Record<string, number> }) {
  const entries = Object.entries(rows);
  const max = Math.max(1, ...entries.map(([, v]) => Number(v) || 0));
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-2 space-y-2 text-sm">
        {entries.length === 0 && <div className="text-xs text-muted-foreground">No data yet</div>}
        {entries.map(([k, v]) => (
          <div key={k}>
            <div className="flex items-center justify-between">
              <span className="capitalize">{k.replace(/_/g, " ")}</span>
              <span className="font-mono text-xs">{v}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-gradient-to-r from-velvet to-sky-500"
                style={{ width: `${Math.round(((Number(v) || 0) / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}



function SettingsPanel() {
  const fetchSettings = useServerFn(getSiteSettings);
  const save = useServerFn(updateSiteSettings);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchSettings().then((r) => setEmail(r.contact_email)); }, []);

  async function onSave() {
    setSaving(true);
    try {
      await save({ data: { contact_email: email.trim() } });
      toast.success("Contact email updated");
    } catch (e) {
      toast.error(toUserMessage(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h2 className="font-serif text-2xl">Site settings</h2>
      <div className="mt-4 rounded-2xl bg-card p-4 ring-1 ring-ink/5">
        <label className="block text-xs font-medium text-muted-foreground">Contact email (shown on Terms, Privacy, support widget)</label>
        <div className="mt-2 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="support@thekenroecollective.com"
            className="flex-1 rounded border border-ink/10 px-3 py-2 text-sm"
          />
          <button onClick={onSave} disabled={saving || !email.trim()} className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <BusinessCardLinkCard />
      <DigitalCardsCard />
      <SoundStudioLaunchCard />
      <RefundWordingCard />
      <EnvironmentsCard />
    </section>
  );
}

/**
 * The money wording customers read before paying for a composed piece. One
 * source: the pay screen, the refund policy page and the tick box all read it.
 * Each save files the outgoing version away with a date.
 */
function RefundWordingCard() {
  const read = useServerFn(getRefundCopy);
  const write = useServerFn(updateRefundCopy);
  const history = useServerFn(listRefundCopyHistory);
  const [headline, setHeadline] = useState("");
  const [pointsText, setPointsText] = useState("");
  const [footnote, setFootnote] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [past, setPast] = useState<{ id: string; changedAt: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const fill = (c: { headline: string; points: string[]; footnote: string; updatedAt: string | null }) => {
    setHeadline(c.headline);
    setPointsText(c.points.join("\n\n"));
    setFootnote(c.footnote);
    setUpdatedAt(c.updatedAt);
  };

  useEffect(() => {
    read().then((c: RefundCopy) => fill(c)).catch(() => {});
    history().then((rows: { id: string; changedAt: string }[]) => setPast(rows)).catch(() => {});
  }, []);

  async function onSave() {
    const points = pointsText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (!headline.trim() || points.length === 0) {
      toast.error("A headline and at least one point are needed");
      return;
    }
    setBusy(true);
    try {
      const saved = (await write({
        data: { headline: headline.trim(), points, footnote: footnote.trim() },
      })) as { headline: string; points: string[]; footnote: string; updatedAt: string | null };
      fill(saved);
      const rows = await history();
      setPast(rows as never);
      toast.success("Refund wording updated everywhere");
    } catch (e) {
      toast.error(toUserMessage(e, "Failed to save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl bg-card p-4 ring-1 ring-ink/5">
      <h3 className="font-serif text-lg">Refund wording for composed pieces</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Shown on the pay screen with a tick box, and on the refund policy page. Leave a blank line
        between points. {updatedAt ? `Last changed ${new Date(updatedAt).toLocaleString()}.` : ""}
      </p>
      <label className="mt-3 block text-xs font-medium text-muted-foreground">Headline</label>
      <input
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        className="mt-1 w-full rounded border border-ink/10 px-3 py-2 text-sm"
      />
      <label className="mt-3 block text-xs font-medium text-muted-foreground">Points</label>
      <textarea
        value={pointsText}
        onChange={(e) => setPointsText(e.target.value)}
        rows={12}
        className="mt-1 w-full rounded border border-ink/10 px-3 py-2 text-sm"
      />
      <label className="mt-3 block text-xs font-medium text-muted-foreground">Footnote</label>
      <input
        value={footnote}
        onChange={(e) => setFootnote(e.target.value)}
        className="mt-1 w-full rounded border border-ink/10 px-3 py-2 text-sm"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={busy}
          className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save wording"}
        </button>
        {past.length ? (
          <span className="text-xs text-muted-foreground">
            {past.length} earlier version{past.length === 1 ? "" : "s"} kept, most recent
            {" "}{new Date(past[0]!.changedAt).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No earlier versions yet</span>
        )}
      </div>
    </div>
  );
}


/** The printed business card QR points at /card. This decides where /card goes. */
function BusinessCardLinkCard() {
  const read = useServerFn(getCardLink);
  const write = useServerFn(updateCardLink);
  const [destination, setDestination] = useState("");
  const [stats, setStats] = useState<{
    totalScans: number;
    scansLast30Days: number;
    totalSaves: number;
    savesLast30Days: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    read()
      .then((r) => {
        setDestination(r.destination);
        setStats({
          totalScans: r.totalScans,
          scansLast30Days: r.scansLast30Days,
          totalSaves: r.totalSaves,
          savesLast30Days: r.savesLast30Days,
        });
      })
      .catch(() => setStats(null));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSave() {
    setBusy(true);
    try {
      await write({ data: { destination: destination.trim() } });
      toast.success("Business card link updated");
      await load();
    } catch (e) {
      toast.error(toUserMessage(e, "Could not save the card link"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl bg-card p-4 ring-1 ring-ink/5">
      <h3 className="font-serif text-lg">Business card QR code</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        The printed code always opens thekenroecollective.com/card. Change where that goes here, any time, without
        reprinting a single card.
      </p>
      <label className="mt-3 block text-xs font-medium text-muted-foreground">Where the card opens</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="/card/christopher"
          className="flex-1 rounded border border-ink/10 px-3 py-2 text-sm"
        />
        <button
          onClick={onSave}
          disabled={busy || !destination.trim()}
          className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        A page on your own site, such as /card/christopher or /gatherings. Tracking is added automatically after the
        scan, so the printed code stays simple.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-ink/[0.03] p-3 text-sm">
          {stats ? (
            <>
              <span className="font-medium">{stats.totalScans}</span> scans in total,{" "}
              <span className="font-medium">{stats.scansLast30Days}</span> in the last 30 days.
            </>
          ) : (
            <span className="text-muted-foreground">Scan counts are not available right now.</span>
          )}
        </div>
        <div className="rounded-xl bg-ink/[0.03] p-3 text-sm">
          {stats ? (
            <>
              <span className="font-medium">{stats.totalSaves}</span> saved your contact details,{" "}
              <span className="font-medium">{stats.savesLast30Days}</span> in the last 30 days.
            </>
          ) : (
            <span className="text-muted-foreground">Save counts are not available right now.</span>
          )}
        </div>
      </div>
      <a href="/brand#card" className="mt-3 inline-block text-xs underline underline-offset-4">
        Download the QR code and printing rules
      </a>
    </div>
  );
}

/**
 * The digital cards. One record per person feeds the page, the saved contact
 * file, the email signature, the downloadable picture and the scan code, so a
 * changed number changes all five at once.
 *
 * Cards start blank and switched off. Nothing invented is ever put on a card:
 * each person types their own details, then switches the card on.
 */
function DigitalCardsCard() {
  const read = useServerFn(listAllBusinessCards);
  const write = useServerFn(updateBusinessCard);
  const create = useServerFn(createBusinessCard);
  const remove = useServerFn(deleteBusinessCard);
  const [cards, setCards] = useState<BusinessCard[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newSlug, setNewSlug] = useState("");
  /**
   * What is typed but not yet saved. The "ready to go live" test reads these
   * too, so the switch unlocks the moment the third detail is typed rather
   * than only after the box is left, which is what made a finished card look
   * finished while it was still hidden.
   */
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  /** Which card just saved into a complete but still hidden state. */
  const [nudge, setNudge] = useState<string | null>(null);

  const load = () => read().then(setCards).catch(() => setCards(null));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The card as it looks on screen right now: saved values plus anything typed. */
  const merged = (card: BusinessCard): BusinessCard =>
    ({ ...card, ...(drafts[card.slug] ?? {}) }) as BusinessCard;

  async function save(slug: string, patch: Record<string, unknown>, message = "Card updated") {
    setBusy(slug);
    try {
      await write({ data: { slug, ...patch } as never });
      toast.success(message);
      const fresh = await read().catch(() => null);
      if (fresh) {
        setCards(fresh);
        const saved = fresh.find((c) => c.slug === slug);
        // A card with every required detail in place, still hidden, is the exact
        // trap: it looks done and nobody can see it. Ask, right there.
        setNudge(saved && !saved.published && missingCardFields(saved).length === 0 ? slug : null);
      }
    } catch (e) {
      toast.error(toUserMessage(e, "Could not save the card"));
    } finally {
      setBusy(null);
    }
  }



  async function addCard() {
    const slug = newSlug.trim().toLowerCase();
    if (!slug) return;
    setBusy("new");
    try {
      await create({ data: { slug } });
      setNewSlug("");
      toast.success("Card created. Fill in the details, then switch it on.");
      await load();
    } catch (e) {
      toast.error(toUserMessage(e, "Could not create the card"));
    } finally {
      setBusy(null);
    }
  }

  async function removeCard(card: BusinessCard) {
    if (
      !window.confirm(
        `Retire the card at /card/${card.slug}? The details are wiped and the card is switched off, but the address stays reserved, because printed scan codes may still be in the wild and must never reach a different person.`,
      )
    )
      return;
    setBusy(card.slug);
    try {
      await remove({ data: { slug: card.slug } });
      toast.success("Card retired. The address stays reserved.");
      await load();
    } catch (e) {
      toast.error(toUserMessage(e, "Could not delete the card"));
    } finally {
      setBusy(null);
    }
  }

  async function copySignature(card: BusinessCard) {
    const html = signatureHtml(card, "https://thekenroecollective.com/brand/kenroe-logo-horizontal-2400px-transparent.png");
    const text = signatureText(card);
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      toast.success("Signature copied, paste it into your email settings");
    } catch {
      toast.error("Could not copy. Select the text below instead.");
    }
  }

  /**
   * Saves on leaving the box, so a long typing session is never interrupted,
   * while every keystroke updates the on screen copy so the "ready" test and
   * the switch keep up with what has been typed.
   */
  const field = (card: BusinessCard, key: keyof BusinessCard, label: string, placeholder: string) => {
    const saved = ((card[key] as string | null) ?? "") as string;
    const typed = drafts[card.slug]?.[key as string];
    return (
      <label className="block text-[11px] text-muted-foreground">
        {label}
        <input
          value={typed ?? saved}
          onChange={(e) =>
            setDrafts((d) => ({ ...d, [card.slug]: { ...(d[card.slug] ?? {}), [key as string]: e.target.value } }))
          }
          onBlur={(e) => {
            const next = e.target.value;
            if (next !== saved) void save(card.slug, { [key]: next });
          }}
          placeholder={placeholder}
          className="mt-1 w-full rounded border border-ink/10 px-2 py-1.5 text-sm"
        />
      </label>
    );
  };


  return (
    <div className="mt-4 rounded-2xl bg-card p-4 ring-1 ring-ink/5">
      <h3 className="font-serif text-lg">Digital business cards</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Kept in one place, so changing a detail here changes the card page, the saved contact file, the email signature,
        the downloadable picture and the scan code together. A card stays hidden until you switch it on.
      </p>
      {cards === null ? (
        <p className="mt-3 text-sm text-muted-foreground">Card details are not available right now.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {cards.map((card) => {
            const live = merged(card);
            const missing = missingCardFields(live);

            return (
              <li key={card.slug} className="rounded-xl bg-ink/[0.03] p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{cardDisplayName(card)}</span>
                  <span className="flex items-center gap-2 text-xs">
                    <span
                      className={
                        card.published
                          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-900"
                          : "rounded-full bg-ink/10 px-2 py-0.5 text-[11px] text-muted-foreground"
                      }
                    >
                      {card.published ? "Live" : "Hidden"}
                    </span>
                    <a href={`/card/${card.slug}`} className="underline underline-offset-4">
                      /card/{card.slug}
                    </a>
                  </span>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {field(card, "full_name", "Full name", "Christopher Kendrick")}
                  {field(card, "role", "Role or title", "Founder")}
                  {field(card, "organisation", "Organisation", "The Kenroe Collective")}
                  {field(card, "email", "Email address", "concierge@thekenroecollective.com")}
                  {field(card, "phone", "Phone number", "+19802360667")}
                  {field(card, "website", "Website", "https://thekenroecollective.com")}
                  {field(card, "photo_url", "Photo address", "https://…/photo.jpg")}
                  {field(card, "tagline", "One line under the name", "Gatherings, done properly")}
                </div>

                <label className="mt-2 flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={card.show_phone_on_page}
                    disabled={busy === card.slug}
                    onChange={(e) => save(card.slug, { show_phone_on_page: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span>
                    Show the phone number on the page as text.
                    <span className="block text-[11px] text-muted-foreground">
                      Left off, the number still travels inside the saved contact file, so anyone who taps Save to
                      contacts gets it, while a machine reading the page finds nothing to collect and sell on.
                    </span>
                  </span>
                </label>

                <label className="mt-2 flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={card.published}
                    disabled={busy === card.slug || (!card.published && missing.length > 0)}
                    onChange={(e) => {
                      const next = e.target.checked;
                      if (!next && card.published) {
                        const ok = window.confirm(
                          "Hide this card? Anyone holding a printed scan code will be sent to the homepage until it is switched back on.",
                        );
                        if (!ok) return;
                      }
                      void save(card.slug, { published: next }, next ? "Card is live" : "Card is hidden again");
                    }}
                    className="mt-0.5"
                  />
                  <span>
                    Show this card to anyone with the link.
                    {missing.length > 0 ? (
                      <span className="block text-[11px] text-amber-700">
                        Add {missing.join(", ").toLowerCase()} to switch this on.
                      </span>
                    ) : card.published ? null : (
                      <span className="block text-[11px] text-muted-foreground">
                        Ready to go live. Nobody can see this card until you tick the box.
                      </span>
                    )}
                  </span>
                </label>

                {nudge === card.slug && !card.published && missing.length === 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                    <span>This card is filled in but nobody can see it yet. Switch it on?</span>
                    <button
                      onClick={() => void save(card.slug, { published: true }, "Card is live")}
                      disabled={busy === card.slug}
                      className="rounded-full bg-velvet px-3 py-1 text-[11px] font-medium text-white disabled:opacity-40"
                    >
                      Switch it on
                    </button>
                    <button
                      onClick={() => setNudge(null)}
                      className="rounded-full border border-amber-300 px-3 py-1 text-[11px]"
                    >
                      Keep it hidden
                    </button>
                  </div>
                ) : null}


                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => copySignature(card)}
                    className="rounded-full border border-ink/10 px-3 py-1.5 text-xs"
                  >
                    Copy email signature
                  </button>
                  <a
                    href={`/api/public/vcard/${card.slug}`}
                    className="rounded-full border border-ink/10 px-3 py-1.5 text-xs"
                  >
                    Download the contact file
                  </a>
                  <a
                    href={`/api/public/card-qr/${card.slug}?format=png&size=small`}
                    className="rounded-full border border-ink/10 px-3 py-1.5 text-xs"
                  >
                    Scan code, small
                  </a>
                  <a
                    href={`/api/public/card-qr/${card.slug}`}
                    className="rounded-full border border-ink/10 px-3 py-1.5 text-xs"
                  >
                    Scan code, print quality
                  </a>
                  <button
                    onClick={() => removeCard(card)}
                    disabled={busy === card.slug}
                    className="rounded-full border border-red-200 px-3 py-1.5 text-xs text-red-700 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 border-t border-ink/5 pt-3">
        <label className="block text-[11px] text-muted-foreground">Add a card for someone else</label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder="jo-smith"
            className="flex-1 rounded border border-ink/10 px-3 py-2 text-sm"
          />
          <button
            onClick={addCard}
            disabled={busy === "new" || !newSlug.trim()}
            className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
          >
            {busy === "new" ? "Creating…" : "Create card"}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Their page will be at /card/ plus what you type. Lower case letters, numbers and dashes.
        </p>
      </div>
    </div>
  );
}




/** Open or close Kenroe Sound Studio to paying customers. */
function SoundStudioLaunchCard() {
  const read = useServerFn(getStudioPublic);
  const write = useServerFn(setStudioPublic);
  const [open, setOpen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    read()
      .then((r) => setOpen(r.open))
      .catch(() => setOpen(null));
  }, [read]);

  async function toggle() {
    if (open === null) return;
    setBusy(true);
    try {
      const res = await write({ data: { open: !open } });
      setOpen(res.open);
      toast.success(res.open ? "Sound Studio is open to customers" : "Sound Studio is back to coming soon");
    } catch (e) {
      toast.error(toUserMessage(e, "Failed to save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl bg-card p-4 ring-1 ring-ink/5">
      <p className="text-sm font-medium">Kenroe Sound Studio</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {open === null
          ? "Checking..."
          : open
            ? "Open to customers. Auditions are free and finished pieces are paid for by length."
            : "Coming soon. Only owners can compose, unlimited and free."}
      </p>
      <button
        onClick={toggle}
        disabled={busy || open === null}
        className="mt-3 rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
      >
        {open ? "Switch back to coming soon" : "Open the studio to customers"}
      </button>
    </div>
  );
}

/**
 * Demo vs live switcher. The demo is the same app in demo mode (sandbox Stripe,
 * inert SMS, nightly reset), switched on per browser by a cookie. The
 * demo.* subdomain is redirected to the primary domain by hosting before the
 * request reaches the app, so the cookie (not the hostname) is what counts.
 */
function EnvironmentsCard() {
  const [demo, setDemo] = useState(false);
  useEffect(() => { setDemo(isDemoRuntime()); }, []);

  const bookmark =
    typeof window === "undefined" ? "/?demo=1" : `${window.location.origin}/?demo=1`;

  return (
    <div className="mt-4 rounded-2xl bg-card p-4 ring-1 ring-ink/5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Environment</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
            demo ? "bg-amber-400 text-amber-950" : "bg-emerald-600 text-white"
          }`}
        >
          {demo ? "Demo" : "Live"}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        This browser is currently in the {demo ? "demo sandbox" : "live production"} environment.
        Demo mode uses sample data, test-mode payments, and sends no real messages.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => enterDemo()}
          disabled={demo}
          className="rounded-full bg-amber-500 px-4 py-2 text-xs font-medium text-amber-950 disabled:opacity-40"
        >
          Enter demo
        </button>
        <button
          onClick={() => exitDemo()}
          disabled={!demo}
          className="rounded-full bg-secondary px-4 py-2 text-xs font-medium disabled:opacity-40"
        >
          Exit demo
        </button>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Bookmark for demos: <code className="rounded bg-secondary px-1 py-0.5">{bookmark}</code>
      </p>
    </div>
  );
}

function SubscriptionsPanel() {
  const fetchAll = useServerFn(listAllSubscriptions);
  const cancelFn = useServerFn(cancelSubscriptionAsOwner);
  const [rows, setRows] = useState<OwnerSubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = () => {
    setLoading(true);
    fetchAll()
      .then((r) => setRows(r as OwnerSubscriptionRow[]))
      .catch((e) => toast.error(e?.message || "Failed to load subscriptions"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const onCancel = async (row: OwnerSubscriptionRow, mode: "immediate" | "period_end") => {
    const label = mode === "immediate" ? "Cancel immediately?" : "Cancel at period end?";
    const who = row.email || row.display_name || row.user_id;
    if (!(await confirmDialog({ title: `${label}\n\nCustomer: ${who}\nPlan: ${row.price_id}\nEnv: ${row.environment}\n\nThis cannot be undone.` }))) return;
    setBusy(row.id);
    try {
      const res = await cancelFn({ data: { subscriptionId: row.id, mode } });
      if ("error" in res) {
        toast.error(res.error);
      } else {
        toast.success(mode === "immediate" ? "Subscription canceled" : "Will cancel at period end");
        load();
      }
    } finally {
      setBusy(null);
    }
  };

  const visible = rows.filter((r) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      r.email?.toLowerCase().includes(q) ||
      r.display_name?.toLowerCase().includes(q) ||
      r.price_id?.toLowerCase().includes(q) ||
      r.status?.toLowerCase().includes(q) ||
      r.stripe_subscription_id?.toLowerCase().includes(q)
    );
  });

  return (
    <section>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-serif text-2xl">Subscriptions</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Cancel a customer's subscription immediately or at the end of their billing period. Changes sync with Stripe and update the local record.
          </p>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by email, plan, status…"
          className="rounded-full border border-ink/15 bg-paper px-4 py-2 text-xs w-72"
        />
      </div>

      <ManualSubscriptionForm onCreated={load} />



      <div className="mt-4 overflow-hidden rounded-2xl bg-card ring-1 ring-ink/5">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Customer</th>
              <th className="px-4 py-2 text-left">Plan</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Env</th>
              <th className="px-4 py-2 text-left">Renews / Ends</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">No subscriptions found.</td></tr>
            )}
            {visible.map((r) => {
              const active = r.status === "active" || r.status === "trialing" || r.status === "past_due";
              const canceledAtEnd = !!r.cancel_at_period_end && active;
              return (
                <tr key={r.id} className="border-t border-ink/5">
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium">{r.display_name || r.email || "(unknown)"}</div>
                    <div className="text-xs text-muted-foreground">{r.email || r.user_id}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="text-xs font-mono">{r.price_id}</div>
                    <div className="text-[10px] text-muted-foreground">{r.stripe_subscription_id}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                      r.status === "active" || r.status === "trialing"
                        ? "bg-emerald-100 text-emerald-800"
                        : r.status === "past_due"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-secondary text-muted-foreground"
                    }`}>{r.status}</span>
                    {canceledAtEnd && (
                      <div className="mt-1 text-[10px] text-amber-700">cancels at period end</div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-xs">{r.environment}</td>
                  <td className="px-4 py-3 align-top text-xs">
                    {r.current_period_end ? formatStampDate((r.current_period_end)) : "—"}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    {active ? (
                      <div className="inline-flex gap-2">
                        {!canceledAtEnd && (
                          <button
                            disabled={busy === r.id}
                            onClick={() => onCancel(r, "period_end")}
                            className="rounded-full bg-secondary px-3 py-1 text-[11px] disabled:opacity-40"
                          >
                            Cancel at period end
                          </button>
                        )}
                        <button
                          disabled={busy === r.id}
                          onClick={() => onCancel(r, "immediate")}
                          className="rounded-full bg-red-600 px-3 py-1 text-[11px] font-medium text-white disabled:opacity-40"
                        >
                          Cancel now
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ManualSubscriptionForm({ onCreated }: { onCreated: () => void }) {
  const createFn = useServerFn(createManualSubscription);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [priceId, setPriceId] = useState<
    | "whisper_onetime" | "whisper_monthly" | "whisper_yearly"
    | "host_onetime" | "host_monthly" | "host_yearly"
    | "atelier_onetime" | "atelier_monthly" | "atelier_yearly"
  >("host_monthly");
  const [periodEnd, setPeriodEnd] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    setSaving(true);
    try {
      const res = await createFn({
        data: {
          email: email.trim(),
          priceId,
          periodEnd: periodEnd || null,
          note: note.trim() || undefined,
        },
      });
      if ("error" in res) {
        toast.error(res.error);
      } else {
        toast.success("Subscription added");
        setEmail("");
        setNote("");
        setPeriodEnd("");
        setOpen(false);
        onCreated();
      }
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="mt-4">
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white"
        >
          + Add subscription manually
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl bg-card p-5 ring-1 ring-ink/5">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-lg">Add subscription manually</h3>
        <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground">
          Cancel
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Comp an account, gift a plan, or grant access for a partner. The user must already have an account with this email.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          <span className="text-muted-foreground">Customer email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="guest@example.com"
            className="mt-1 w-full rounded border border-ink/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Plan</span>
          <select
            value={priceId}
            onChange={(e) => setPriceId(e.target.value as any)}
            className="mt-1 w-full rounded border border-ink/15 px-3 py-2 text-sm bg-paper"
          >
            <option value="whisper_onetime">Whisper — one-time ($12)</option>
            <option value="whisper_monthly">Whisper — monthly ($6)</option>
            <option value="whisper_yearly">Whisper — yearly ($54)</option>
            <option value="host_onetime">Host — one-time ($35)</option>
            <option value="host_monthly">Host — monthly ($22)</option>
            <option value="host_yearly">Host — yearly ($198)</option>
            <option value="atelier_onetime">Atelier — one-time ($99)</option>
            <option value="atelier_monthly">Atelier — monthly ($55)</option>
            <option value="atelier_yearly">Atelier — yearly ($495)</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Access ends (leave blank = no expiry)</span>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="mt-1 w-full rounded border border-ink/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="text-muted-foreground">Internal note (optional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. comp for press review"
            className="mt-1 w-full rounded border border-ink/15 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={submit}
          disabled={saving}
          className="rounded-full bg-velvet px-5 py-2 text-xs font-medium text-white disabled:opacity-40"
        >
          {saving ? "Adding…" : "Add subscription"}
        </button>
      </div>
    </div>
  );
}

type VendorRow = {
  id: string;
  owner_user_id: string;
  owner_email: string | null;
  name: string;
  slug: string;
  category: string;
  city: string | null;
  region: string | null;
  country: string | null;
  bio: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  hero_image: string | null;
  status: string;
  review_notes: string | null;
  reviewed_at: string | null;
  verified_at: string | null;
  created_at: string;
};

type AdRow = {
  id: string;
  vendor_id: string;
  owner_user_id: string | null;
  owner_email: string | null;
  tier: string;
  headline: string;
  blurb: string | null;
  cta_url: string | null;
  hero_image: string | null;
  region: string | null;
  status: string;
  review_notes: string | null;
  reviewed_at: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
};

const VENDOR_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  reviewing: "bg-sky-100 text-sky-800",
  verified: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  paused: "bg-secondary text-muted-foreground",
};

const AD_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  reviewing: "bg-sky-100 text-sky-800",
  approved: "bg-sky-100 text-sky-800",
  active: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  paused: "bg-secondary text-muted-foreground",
  ended: "bg-secondary text-muted-foreground",
};

function VendorApprovalsPanel() {
  const fetchAll = useServerFn(listVendorsForReview);
  const setVendor = useServerFn(setVendorReviewStatus);
  const setAd = useServerFn(setAdReviewStatus);
  const removeVendor = useServerFn(deleteVendorAsOwner);

  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("ownerApprovalNotes");
      if (raw) setNotes(JSON.parse(raw) as Record<string, string>);
    } catch { /* ignore */ }
  }, []);

  function updateNote(id: string, value: string) {
    setNotes((current) => {
      const next = { ...current, [id]: value };
      try { sessionStorage.setItem("ownerApprovalNotes", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function clearNote(id: string) {
    setNotes((current) => {
      const next = { ...current };
      delete next[id];
      try { sessionStorage.setItem("ownerApprovalNotes", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const load = (options: { showLoading?: boolean } = {}) => {
    if (options.showLoading ?? vendors.length + ads.length === 0) setLoading(true);
    fetchAll()
      .then((r) => {
        if ("error" in r) {
          toast.error(r.error);
          return;
        }
        setVendors(r.vendors as VendorRow[]);
        setAds(r.ads as AdRow[]);
      })
      .catch((e) => toast.error(toUserMessage(e, "Failed to load")))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load({ showLoading: true }); }, []);

  const onVendorAction = async (v: VendorRow, status: "verified" | "rejected" | "paused" | "reviewing" | "pending") => {
    setBusy(v.id);
    try {
      const res = await setVendor({ data: { vendorId: v.id, status, notes: notes[v.id]?.trim() || null } });
      if ("error" in res) { toast.error(res.error); return; }
      const savedNote = notes[v.id]?.trim() || null;
      setVendors((rows) => rows.map((row) => row.id === v.id ? {
        ...row,
        status,
        review_notes: savedNote,
        reviewed_at: new Date().toISOString(),
        verified_at: status === "verified" ? new Date().toISOString() : row.verified_at,
      } : row));
      clearNote(v.id);
      toast.success(`Vendor ${status}`);
    } finally { setBusy(null); }
  };

  const onAdAction = async (a: AdRow, status: "approved" | "active" | "rejected" | "paused" | "reviewing" | "pending") => {
    setBusy(a.id);
    try {
      const res = await setAd({ data: { adId: a.id, status, notes: notes[a.id]?.trim() || null } });
      if ("error" in res) { toast.error(res.error); return; }
      const savedNote = notes[a.id]?.trim() || null;
      setAds((rows) => rows.map((row) => row.id === a.id ? {
        ...row,
        status,
        review_notes: savedNote,
        reviewed_at: new Date().toISOString(),
      } : row));
      clearNote(a.id);
      toast.success(`Ad ${status}`);
    } finally { setBusy(null); }
  };

  const onDeleteVendor = async (v: VendorRow) => {
    if (!(await confirmDialog({ title: `Permanently delete "${v.name}" and all related ads/RFQs? This cannot be undone.` }))) return;
    setBusy(v.id);
    try {
      const res = await removeVendor({ data: { vendorId: v.id } });
      if ("error" in res) { toast.error(res.error); return; }
      setVendors((rows) => rows.filter((row) => row.id !== v.id));
      setAds((rows) => rows.filter((row) => row.vendor_id !== v.id));
      toast.success("Vendor deleted");
    } finally { setBusy(null); }
  };

  const needsReview = (status: string) => status === "pending" || status === "reviewing";
  const visibleVendors = vendors.filter((v) => filter === "all" || needsReview(v.status));
  const visibleAds = ads.filter((a) => filter === "all" || needsReview(a.status));
  const pendingVendorCount = vendors.filter((v) => needsReview(v.status)).length;
  const pendingAdCount = ads.filter((a) => needsReview(a.status)).length;

  return (
    <section className="space-y-8">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-serif text-2xl">Vendor approvals</h2>
          <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
            Review new vendor applications and ad placements. Vendors cannot purchase advertising until you mark their profile as verified.
            Reviewing, pending, rejected, and paused vendors are blocked from checkout until approved.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-secondary p-1 ring-1 ring-ink/10 text-xs">
            <button
              onClick={() => setFilter("pending")}
              className={`rounded-full px-3 py-1 transition ${filter === "pending" ? "bg-paper text-ink shadow-sm" : "text-muted-foreground"}`}
            >
              Needs review ({pendingVendorCount + pendingAdCount})
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`rounded-full px-3 py-1 transition ${filter === "all" ? "bg-paper text-ink shadow-sm" : "text-muted-foreground"}`}
            >
              All
            </button>
          </div>
          <button onClick={() => load({ showLoading: false })} className="rounded-full bg-secondary px-3 py-1.5 text-xs">Refresh</button>
        </div>
      </div>

      <div>
        <h3 className="font-serif text-lg">Vendor applications {loading && <span className="text-xs text-muted-foreground">· loading…</span>}</h3>
        <div className="mt-3 space-y-3">
          {!loading && visibleVendors.length === 0 && (
            <div className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-ink/5">
              {filter === "pending" ? "No vendors waiting for review." : "No vendors yet."}
            </div>
          )}
          {visibleVendors.map((v) => (
            <div key={v.id} className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{v.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] capitalize ${VENDOR_STATUS_COLORS[v.status] ?? "bg-secondary"}`}>{v.status}</span>
                    <span className="text-xs text-muted-foreground">{v.category}{v.city ? ` · ${v.city}` : ""}{v.region ? `, ${v.region}` : ""}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Submitted {formatTimestamp((v.created_at))} by {v.owner_email || formatOwnerId(v.owner_user_id)}
                  </div>
                  {v.bio && <p className="mt-2 text-sm whitespace-pre-wrap">{v.bio}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {v.website && <a href={v.website} target="_blank" rel="noreferrer" className="underline">{v.website}</a>}
                    {v.email && <span>📧 {v.email}</span>}
                    {v.phone && <span>📞 {v.phone}</span>}
                    <Link to="/vendors/$slug" params={{ slug: v.slug }} target="_blank" className="underline">View public page →</Link>
                  </div>
                  {v.review_notes && (
                    <p className="mt-2 text-xs italic text-muted-foreground">Last review note: {v.review_notes}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  value={notes[v.id] ?? ""}
                  onChange={(e) => updateNote(v.id, e.target.value)}
                  placeholder="Optional internal note (saved with the decision)"
                  className="rounded border border-ink/15 px-3 py-2 text-xs"
                />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button disabled={busy === v.id} onClick={() => onVendorAction(v, "verified")} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Approve</button>
                  <button disabled={busy === v.id} onClick={() => onVendorAction(v, "reviewing")} className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Reviewing</button>
                  <button disabled={busy === v.id} onClick={() => onVendorAction(v, "rejected")} className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Reject</button>
                  <button disabled={busy === v.id} onClick={() => onVendorAction(v, "paused")} className="rounded-full bg-secondary px-3 py-1.5 text-xs disabled:opacity-40">Pause</button>
                  <button disabled={busy === v.id} onClick={() => onVendorAction(v, "pending")} className="rounded-full bg-secondary px-3 py-1.5 text-xs disabled:opacity-40">Reset to pending</button>
                  <span className="ml-1 h-5 w-px bg-ink/10" aria-hidden="true" />
                  <button disabled={busy === v.id} onClick={() => onDeleteVendor(v)} className="rounded-full border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-serif text-lg">Ad placements</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Ads only appear publicly when status is <strong>active</strong>. Approving an ad without an active Stripe subscription marks it
          approved but it stays hidden until the vendor pays.
        </p>
        <div className="mt-3 space-y-3">
          {!loading && visibleAds.length === 0 && (
            <div className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-ink/5">
              {filter === "pending" ? "No ads waiting for review." : "No ad placements yet."}
            </div>
          )}
          {visibleAds.map((a) => (
            <div key={a.id} className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{a.headline}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] capitalize ${AD_STATUS_COLORS[a.status] ?? "bg-secondary"}`}>{a.status}</span>
                    <span className="text-xs text-muted-foreground">Tier: {a.tier}{a.region ? ` · ${a.region}` : ""}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Submitted {formatTimestamp((a.created_at))} by {a.owner_email || formatOwnerId(a.owner_user_id)}
                    {a.stripe_subscription_id && <> · sub <span className="font-mono">{a.stripe_subscription_id}</span></>}
                  </div>
                  {a.blurb && <p className="mt-2 text-sm whitespace-pre-wrap">{a.blurb}</p>}
                  {a.cta_url && (
                    <a href={a.cta_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs underline text-muted-foreground">{a.cta_url}</a>
                  )}
                  {a.review_notes && <p className="mt-2 text-xs italic text-muted-foreground">Last review note: {a.review_notes}</p>}
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  value={notes[a.id] ?? ""}
                  onChange={(e) => updateNote(a.id, e.target.value)}
                  placeholder="Optional internal note"
                  className="rounded border border-ink/15 px-3 py-2 text-xs"
                />
                <div className="flex flex-wrap gap-2 justify-end">
                  <button disabled={busy === a.id} onClick={() => onAdAction(a, "approved")} className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Approve</button>
                  <button disabled={busy === a.id} onClick={() => onAdAction(a, "active")} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Activate</button>
                  <button disabled={busy === a.id} onClick={() => onAdAction(a, "reviewing")} className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Reviewing</button>
                  <button disabled={busy === a.id} onClick={() => onAdAction(a, "rejected")} className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Reject</button>
                  <button disabled={busy === a.id} onClick={() => onAdAction(a, "paused")} className="rounded-full bg-secondary px-3 py-1.5 text-xs disabled:opacity-40">Pause</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
