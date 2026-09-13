// Owner AI analyst, Tier 1: the read-only tool registry.
//
// READ ONLY BY CONSTRUCTION. Every tool here only selects data. Nothing in this
// file writes, refunds, emails, texts, or changes a plan. The model never sees
// the database, it can only call these named tools, and every result carries a
// `source` label naming the report or table plus the window it covers, so the
// owner can open that report and verify the number independently.
import { tool } from "ai";
import { withoutAccounts } from "@/lib/owner-account-filter";
import { z } from "zod";

export type SourceRef = { label: string; where: string; window?: string };

type ToolResult = Record<string, unknown> & { source: SourceRef };

const collected: SourceRef[] = [];

/** Sources touched while answering the current question. */
export function takeSources(): SourceRef[] {
  const out = collected.slice();
  collected.length = 0;
  return out;
}

function withSource<T extends Record<string, unknown>>(result: T, source: SourceRef): ToolResult {
  collected.push(source);
  return { ...result, source };
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function windowLabel(since: string, until: string) {
  return `${since.slice(0, 10)} to ${until.slice(0, 10)}`;
}

function clampRange(since?: string, until?: string) {
  const end = until ? new Date(until) : new Date();
  const start = since ? new Date(since) : new Date(end.getTime() - 30 * 86_400_000);
  return { since: start.toISOString(), until: end.toISOString() };
}

const RangeShape = {
  since: z.string().optional().describe("ISO start of the window. Defaults to 30 days ago."),
  until: z.string().optional().describe("ISO end of the window. Defaults to now."),
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/**
 * The demo host and the sample-wedding system account. Their rows are our own
 * demonstration material, so no tool below may count them as customer activity.
 */
async function systemAccountIds(): Promise<string[]> {
  const { getDemoUserIds } = await import("@/lib/demo-accounts.server");
  return await getDemoUserIds().catch(() => [] as string[]);
}

/** Leave every system account out of a query, by whichever column names the account. */
function withoutSystemAccounts(q: any, column: string, ids: string[]) {
  return withoutAccounts(q, column, ids);
}

export function buildOwnerAiTools() {
  return {
    get_revenue_and_activity: tool({
      description:
        "Real revenue and product activity for a date window, from the Owner Report loader (Stripe plus platform tables). Use this for revenue, refunds, orders, revenue by venture, eCards, events, RSVPs, emails and texts sent.",
      inputSchema: z.object({
        ...RangeShape,
        environment: z.enum(["live", "sandbox"]).optional(),
      }),
      execute: async ({ since, until, environment }) => {
        const range = clampRange(since, until);
        const { loadPeriod } = await import("@/lib/owner-report.server");
        const t = await loadPeriod(environment ?? "live", range.since, range.until, "all");
        return withSource(
          {
            gross: dollars(t.grossCents),
            stripeFees: dollars(t.feeCents),
            net: dollars(t.netCents),
            refunds: dollars(t.refundCents),
            payments: t.orders,
            revenueAvailable: t.available,
            note: t.note,
            byVenture: t.byVenture.map((v) => ({
              venture: v.venture,
              gross: dollars(v.grossCents),
              payments: v.orders,
            })),
            ecardsCreated: t.ecardsCreated,
            ecardsPaid: t.ecardsPaid,
            contributions: t.contributions,
            eventsCreated: t.eventsCreated,
            rsvpsYes: t.rsvpsYes,
            projectsCreated: t.projectsCreated,
            emailSent: t.emailSent,
            emailBounced: t.emailBounced,
            smsSent: t.smsSent,
            smsFailed: t.smsFailed,
            errors: t.errors,
            supportMessages: t.supportMessages,
            scopeNotes: t.scopeNotes,
          },
          {
            label: "Owner Report",
            where: "Owner console > Owner Report (Stripe charges plus platform tables)",
            window: windowLabel(range.since, range.until),
          },
        );
      },
    }),

    get_reliability_issues: tool({
      description:
        "Grouped, non-identifying reliability signals for a window: unresolved app errors, bounced emails, failed texts, stuck eCards.",
      inputSchema: z.object(RangeShape),
      execute: async ({ since, until }) => {
        const range = clampRange(since, until);
        const { loadRecentIssues } = await import("@/lib/owner-issues.server");
        const issues = await loadRecentIssues(range.since, range.until, "all");
        return withSource(
          { issues },
          {
            label: "Error monitoring and delivery logs",
            where: "Owner console > Error monitoring, Messaging log",
            window: windowLabel(range.since, range.until),
          },
        );
      },
    }),

    get_support_tickets: tool({
      description:
        "Support tickets, newest first. Use status 'open' for the pending queue. Returns subject, status, contact and age.",
      inputSchema: z.object({
        status: z.enum(["open", "answered", "closed", "any"]).optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ status, limit }) => {
        const sb = await admin();
        let q = withoutSystemAccounts(
          sb
            .from("support_tickets")
            .select("id,subject,status,contact_email,contact_name,created_at,final_reply"),
          "user_id",
          await systemAccountIds(),
        )
          .order("created_at", { ascending: false })
          .limit(Math.min(Math.max(limit ?? 25, 1), 100));
        if (status && status !== "any") q = q.eq("status", status);
        const { data } = await q;
        return withSource(
          {
            count: (data ?? []).length,
            tickets: (data ?? []).map((t: any) => ({
              id: t.id,
              subject: t.subject,
              status: t.status,
              from: t.contact_name || t.contact_email,
              email: t.contact_email,
              opened: t.created_at,
              replied: Boolean(t.final_reply),
            })),
          },
          { label: "Support inbox", where: "Owner console > Support inbox (support_tickets table)" },
        );
      },
    }),

    get_subscriptions_summary: tool({
      description:
        "Current plans across the platform: counts by status and by plan, manual/comped versus Stripe, and how many are set to cancel at period end.",
      inputSchema: z.object({ environment: z.enum(["live", "sandbox", "any"]).optional() }),
      execute: async ({ environment }) => {
        const sb = await admin();
        let q = withoutSystemAccounts(
          sb
            .from("subscriptions")
            .select(
              "price_id,status,environment,cancel_at_period_end,current_period_end,stripe_subscription_id",
            ),
          "user_id",
          await systemAccountIds(),
        );
        if (environment && environment !== "any") q = q.eq("environment", environment);
        const { data } = await q;
        const rows = data ?? [];
        const byStatus: Record<string, number> = {};
        const byPlan: Record<string, number> = {};
        let manual = 0;
        let cancelling = 0;
        for (const r of rows) {
          byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
          const plan = String(r.price_id ?? "unknown").toLowerCase();
          const tier = plan.includes("atelier")
            ? "atelier"
            : plan.includes("host")
              ? "host"
              : plan.includes("whisper")
                ? "whisper"
                : "other";
          byPlan[tier] = (byPlan[tier] ?? 0) + 1;
          if (!r.stripe_subscription_id || String(r.price_id ?? "").startsWith("manual_")) manual += 1;
          if (r.cancel_at_period_end) cancelling += 1;
        }
        return withSource(
          { total: rows.length, byStatus, byPlan, manualOrComped: manual, setToCancel: cancelling },
          { label: "Subscriptions", where: "Owner console > Subscriptions (subscriptions table)" },
        );
      },
    }),

    get_churn_risk: tool({
      description:
        "Accounts at risk: plans set to cancel at period end, past_due plans, and paid plans lapsing within the next N days.",
      inputSchema: z.object({ withinDays: z.number().optional() }),
      execute: async ({ withinDays }) => {
        const sb = await admin();
        const days = Math.min(Math.max(withinDays ?? 30, 1), 180);
        const horizon = new Date(Date.now() + days * 86_400_000).toISOString();
        const { data } = await withoutSystemAccounts(
          sb
            .from("subscriptions")
            .select("user_id,price_id,status,cancel_at_period_end,current_period_end,environment")
            .in("status", ["active", "trialing", "past_due"]),
          "user_id",
          await systemAccountIds(),
        );
        const rows = (data ?? []).filter(
          (r: any) =>
            r.cancel_at_period_end ||
            r.status === "past_due" ||
            (r.current_period_end && r.current_period_end < horizon),
        );
        const ids = [...new Set(rows.map((r: any) => String(r.user_id)))].slice(0, 100) as string[];
        const emails = new Map<string, string>();
        for (const id of ids) {
          try {
            const { data: u } = await sb.auth.admin.getUserById(id);
            if (u?.user?.email) emails.set(id, u.user.email);
          } catch {
            /* ignore */
          }
        }
        return withSource(
          {
            atRisk: rows.length,
            withinDays: days,
            accounts: rows.slice(0, 50).map((r: any) => ({
              email: emails.get(r.user_id) ?? r.user_id,
              plan: r.price_id,
              status: r.status,
              endsAt: r.current_period_end,
              reason: r.cancel_at_period_end
                ? "set to cancel at period end"
                : r.status === "past_due"
                  ? "payment past due"
                  : "renews or lapses soon",
            })),
          },
          {
            label: "Churn risk (derived)",
            where: "subscriptions table, filtered on cancel_at_period_end, past_due, and period end",
            window: `next ${days} days`,
          },
        );
      },
    }),

    get_accounts_overview: tool({
      description:
        "Signup and plan mix across all user accounts: total accounts, new accounts in the window, and how many sit on each profile tier.",
      inputSchema: z.object(RangeShape),
      execute: async ({ since, until }) => {
        const range = clampRange(since, until);
        const sb = await admin();
        const { data: profiles } = await withoutSystemAccounts(
          sb.from("profiles").select("tier,created_at"),
          "id",
          await systemAccountIds(),
        );
        const rows = profiles ?? [];
        const byTier: Record<string, number> = {};
        let newly = 0;
        for (const p of rows) {
          const tier = String(p.tier ?? "postcard");
          byTier[tier] = (byTier[tier] ?? 0) + 1;
          if (p.created_at && p.created_at >= range.since && p.created_at < range.until) newly += 1;
        }
        return withSource(
          { totalAccounts: rows.length, newAccountsInWindow: newly, byTier },
          {
            label: "Users",
            where: "Owner console > Users (profiles table)",
            window: windowLabel(range.since, range.until),
          },
        );
      },
    }),

    find_account: tool({
      description:
        "Look up one customer account by email or name. Returns their plan, roles, gatherings, eCards, support tickets and refunds. Use only when the owner asks about a specific account.",
      inputSchema: z.object({ search: z.string().describe("Email or part of a name.") }),
      execute: async ({ search }) => {
        const sb = await admin();
        const term = search.trim().toLowerCase();
        const { listAllAuthUsers } = await import("@/lib/admin-directory.server");
        const { users } = await listAllAuthUsers();
        const match = users.filter(
          (u: any) =>
            String(u.email ?? "").toLowerCase().includes(term) ||
            String(u.user_metadata?.display_name ?? "").toLowerCase().includes(term),
        );
        if (match.length === 0) {
          return withSource(
            { found: 0, note: "No account matches that search." },
            { label: "Users", where: "auth directory plus profiles table" },
          );
        }
        if (match.length > 1 && !term.includes("@")) {
          return withSource(
            {
              found: match.length,
              candidates: match.slice(0, 10).map((u: any) => ({ email: u.email, id: u.id })),
              note: "More than one account matches. Ask the owner which one.",
            },
            { label: "Users", where: "auth directory" },
          );
        }
        const u: any = match[0];
        const [profile, subs, events, ecards, tickets, refunds, roles] = await Promise.all([
          sb.from("profiles").select("display_name,tier,created_at,deletion_requested_at").eq("id", u.id).maybeSingle(),
          sb.from("subscriptions").select("price_id,status,environment,current_period_end,cancel_at_period_end").eq("user_id", u.id),
          // Demo/seed events never count towards a real account's totals.
          sb.from("events").select("id,created_at,archived_at").eq("user_id", u.id).eq("is_demo", false),
          sb.from("ecards").select("id,status,is_paid").eq("organizer_user_id", u.id),
          sb.from("support_tickets").select("id,subject,status,created_at").eq("user_id", u.id).order("created_at", { ascending: false }).limit(10),
          sb.from("refund_log").select("amount_cents,reason,created_at").eq("user_id", u.id).order("created_at", { ascending: false }).limit(10),
          sb.from("user_roles").select("role").eq("user_id", u.id),
        ]);
        return withSource(
          {
            found: 1,
            email: u.email,
            displayName: (profile as any)?.data?.display_name ?? null,
            signedUp: u.created_at,
            lastSignIn: u.last_sign_in_at ?? null,
            emailConfirmed: Boolean(u.email_confirmed_at),
            profileTier: (profile as any)?.data?.tier ?? "postcard",
            deletionRequested: (profile as any)?.data?.deletion_requested_at ?? null,
            roles: ((roles as any)?.data ?? []).map((r: any) => r.role),
            plans: ((subs as any)?.data ?? []),
            gatherings: ((events as any)?.data ?? []).length,
            archivedGatherings: ((events as any)?.data ?? []).filter((e: any) => e.archived_at).length,
            ecards: ((ecards as any)?.data ?? []).length,
            ecardsPaid: ((ecards as any)?.data ?? []).filter((e: any) => e.is_paid).length,
            tickets: ((tickets as any)?.data ?? []),
            refunds: ((refunds as any)?.data ?? []).map((r: any) => ({
              amount: dollars(r.amount_cents ?? 0),
              reason: r.reason,
              when: r.created_at,
            })),
          },
          {
            label: "Account detail",
            where: "auth directory, profiles, subscriptions, events, ecards, support_tickets, refund_log",
          },
        );
      },
    }),

    get_refunds: tool({
      description: "Refunds actually issued in a window, with amounts and reasons.",
      inputSchema: z.object(RangeShape),
      execute: async ({ since, until }) => {
        const range = clampRange(since, until);
        const sb = await admin();
        const { data } = await withoutSystemAccounts(
          sb
            .from("refund_log")
            .select("amount_cents,currency,reason,environment,created_at"),
          "user_id",
          await systemAccountIds(),
        )
          .gte("created_at", range.since)
          .lt("created_at", range.until)
          .order("created_at", { ascending: false })
          .limit(200);
        const rows = data ?? [];
        const total = rows.reduce((s: number, r: any) => s + (r.amount_cents ?? 0), 0);
        return withSource(
          {
            count: rows.length,
            total: dollars(total),
            refunds: rows.slice(0, 50).map((r: any) => ({
              amount: dollars(r.amount_cents ?? 0),
              reason: r.reason,
              environment: r.environment,
              when: r.created_at,
            })),
          },
          {
            label: "Refund log",
            where: "refund_log table",
            window: windowLabel(range.since, range.until),
          },
        );
      },
    }),

    get_join_requests: tool({
      description:
        "Guest join requests waiting on a host, with party size and how long they have been waiting.",
      inputSchema: z.object({ status: z.enum(["pending", "approved", "declined", "any"]).optional() }),
      execute: async ({ status }) => {
        const sb = await admin();
        let q = sb
          .from("event_guest_requests")
          .select("id,event_id,name,party_size,status,created_at,notified_at,reminded_at")
          .order("created_at", { ascending: false })
          .limit(50);
        if (status && status !== "any") q = q.eq("status", status);
        const { data } = await q;
        return withSource(
          {
            count: (data ?? []).length,
            requests: (data ?? []).map((r: any) => ({
              name: r.name,
              people: 1 + Math.max(0, (r.party_size ?? 1) - 1),
              status: r.status,
              asked: r.created_at,
              hostNotified: Boolean(r.notified_at),
              reminded: Boolean(r.reminded_at),
            })),
          },
          { label: "Join requests", where: "event_guest_requests table" },
        );
      },
    }),

    get_events_overview: tool({
      description:
        "Real (non-demo) gatherings created in a window and how many are archived. Demo/seed events are excluded from the totals and reported separately.",
      inputSchema: z.object(RangeShape),
      execute: async ({ since, until }) => {
        const range = clampRange(since, until);
        const sb = await admin();
        const { data } = await withoutSystemAccounts(
          sb
            .from("events")
            .select("id,created_at,archived_at,is_demo")
            .gte("created_at", range.since)
            .lt("created_at", range.until),
          "user_id",
          await systemAccountIds(),
        );
        const all = data ?? [];
        const rows = all.filter((r: any) => !r.is_demo);
        return withSource(
          {
            created: rows.length,
            archived: rows.filter((r: any) => r.archived_at).length,
            demoExcluded: all.length - rows.length,
          },
          {
            label: "All events (real only)",
            where: "Owner console > All events (events table)",
            window: windowLabel(range.since, range.until),
          },
        );
      },
    }),

    get_feedback: tool({
      description: "Customer product feedback and NPS scores in a window.",
      inputSchema: z.object(RangeShape),
      execute: async ({ since, until }) => {
        const range = clampRange(since, until);
        const sb = await admin();
        const { data } = await sb
          .from("product_feedback")
          .select("nps,rating,comment,created_at")
          .gte("created_at", range.since)
          .lt("created_at", range.until)
          .order("created_at", { ascending: false })
          .limit(100);
        const rows = data ?? [];
        const scores = rows.map((r: any) => r.nps).filter((n: any) => typeof n === "number");
        const avg = scores.length
          ? (scores.reduce((s: number, n: number) => s + n, 0) / scores.length).toFixed(1)
          : null;
        return withSource(
          {
            responses: rows.length,
            averageNps: avg,
            comments: rows
              .filter((r: any) => r.comment)
              .slice(0, 15)
              .map((r: any) => ({ nps: r.nps, rating: r.rating, comment: String(r.comment).slice(0, 240) })),
          },
          {
            label: "Product feedback",
            where: "Owner console > Feedback (product_feedback table)",
            window: windowLabel(range.since, range.until),
          },
        );
      },
    }),
  };
}
