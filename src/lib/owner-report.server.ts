// Owner Command Center: read-only analytics aggregation, with venture scoping.
//
// Everything in this module is READ ONLY. No inserts, updates or deletes.
// Money figures come from Stripe balance transactions (actual gross, actual
// processing fees, actual refunds). Product metrics come from plain counted
// reads of the app's own tables.
//
// Venture scoping rule: only count something for a venture when a clear signal
// ties it there (its own tables, the Stripe venture classification, an email
// template name, or a page route). Everything else stays app-wide.

import { withoutAccounts } from "@/lib/owner-account-filter";
import type { StripeEnv } from "@/lib/stripe.server";
import type { ResumeVentureBlock } from "@/lib/resume-feed.server";
import {
  VENTURE_EMAIL_PREFIXES,
  VENTURE_REVENUE_NAMES,
  VENTURE_ROUTE_PREFIXES,
  type VentureId,
} from "@/lib/owner-ventures";

export type Bucket = { day: string; value: number };

export type RevenueBlock = {
  grossCents: number;
  feeCents: number;
  netCents: number;
  refundCents: number;
  orders: number;
  currency: string;
  byVenture: Array<{ venture: string; grossCents: number; orders: number }>;
  revenueByDay: Bucket[];
  ordersByDay: Bucket[];
  available: boolean;
  note: string | null;
};

export type ProductBlock = {
  ecardsCreated: number;
  ecardsPaid: number;
  contributions: number;
  eventsCreated: number;
  rsvpsYes: number;
  projectsCreated: number;
  tasksCreated: number;
  emailSent: number;
  emailBounced: number;
  smsSent: number;
  smsFailed: number;
  errors: number;
  supportMessages: number;
  emailByDay: Bucket[];
  smsByDay: Bucket[];
};

export type PeriodTotals = RevenueBlock &
  ProductBlock & {
    /** Plain-language notes about what could not be attributed to this venture. */
    scopeNotes: string[];
    /** Only present when the Application Kit venture is selected. */
    resume?: ResumeVentureBlock;
  };

const VENTURE_ECARDS = "Group eCards";
const VENTURE_EVENTS = "Events and Gatherings";
const VENTURE_WORKROOM = "Projects";
const VENTURE_PLANS = "Plans and subscriptions";
const VENTURE_RESUME = "Application Kit";
const VENTURE_OTHER = "Other";

function dayKey(iso: string | number): string {
  const d = typeof iso === "number" ? new Date(iso * 1000) : new Date(iso);
  return d.toISOString().slice(0, 10);
}

function addBucket(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function toBuckets(map: Map<string, number>, since: string, until: string): Bucket[] {
  const out: Bucket[] = [];
  const start = new Date(since);
  const end = new Date(until);
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
  let guard = 0;
  while (cursor < end && guard < 800) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({ day: key, value: map.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return out;
}

type Sale = {
  day: string;
  amount: number;
  fee: number;
  pi: string | null;
  kind: string | null;
  invoice: string | null;
  customer: string | null;
};

/** Actual money movement for the window, straight from Stripe, optionally one venture. */
export async function loadRevenue(
  env: StripeEnv,
  since: string,
  until: string,
  venture: VentureId = "all",
): Promise<RevenueBlock> {
  const empty: RevenueBlock = {
    grossCents: 0,
    feeCents: 0,
    netCents: 0,
    refundCents: 0,
    orders: 0,
    currency: "usd",
    byVenture: [],
    revenueByDay: [],
    ordersByDay: [],
    available: false,
    note: null,
  };

  let stripe: ReturnType<typeof import("@/lib/stripe.server").createStripeClient>;
  try {
    const { createStripeClient } = await import("@/lib/stripe.server");
    stripe = createStripeClient(env);
  } catch {
    return { ...empty, note: "Payment records are not reachable right now." };
  }

  const gte = Math.floor(new Date(since).getTime() / 1000);
  const lt = Math.floor(new Date(until).getTime() / 1000);

  let refundCents = 0;
  let refundFeeCents = 0;
  let currency = "usd";
  const sales: Sale[] = [];
  const refundMap = new Map<string, number>();

  try {
    for await (const bt of stripe.balanceTransactions.list({
      created: { gte, lt },
      limit: 100,
      expand: ["data.source"],
    })) {
      const key = dayKey(bt.created);
      currency = bt.currency || currency;
      const isSale = bt.type === "charge" || bt.type === "payment";
      const isRefund =
        bt.type === "refund" ||
        bt.type === "payment_refund" ||
        bt.type === "payment_failure_refund";

      if (isSale) {
        const src = bt.source as any;
        sales.push({
          day: key,
          amount: bt.amount,
          fee: bt.fee,
          pi:
            typeof src?.payment_intent === "string"
              ? src.payment_intent
              : (src?.payment_intent?.id ?? null),
          kind: (src?.metadata?.kind as string | undefined) ?? null,
          invoice: typeof src?.invoice === "string" ? src.invoice : (src?.invoice?.id ?? null),
          customer: typeof src?.customer === "string" ? src.customer : (src?.customer?.id ?? null),
        });
      } else if (isRefund) {
        refundCents += Math.abs(bt.amount);
        refundFeeCents += bt.fee;
        addBucket(refundMap, key, bt.amount);
      }
    }
  } catch {
    return { ...empty, note: "Payment records could not be loaded for this period." };
  }

  const classified = await classifyCharges(sales, stripe);
  const scopedNames = venture === "all" ? null : ((VENTURE_REVENUE_NAMES as any)[venture] ?? []);
  const kept = scopedNames ? classified.filter((c) => scopedNames.includes(c.venture)) : classified;

  let grossCents = 0;
  let feeCents = 0;
  let orders = 0;
  const revenueMap = new Map<string, number>();
  const ordersMap = new Map<string, number>();
  const totals = new Map<string, { grossCents: number; orders: number }>();

  for (const c of kept) {
    grossCents += c.sale.amount;
    feeCents += c.sale.fee;
    orders += 1;
    addBucket(revenueMap, c.sale.day, c.sale.amount);
    addBucket(ordersMap, c.sale.day, 1);
    const row = totals.get(c.venture) ?? { grossCents: 0, orders: 0 };
    row.grossCents += c.sale.amount;
    row.orders += 1;
    totals.set(c.venture, row);
  }

  // Refunds are recorded against the payment processor, not a venture, so they
  // stay app-wide rather than being split with a guess.
  const includeRefunds = venture === "all";
  if (includeRefunds) {
    feeCents += refundFeeCents;
    for (const [day, amount] of refundMap) addBucket(revenueMap, day, amount);
  }

  const byVenture = [...totals.entries()]
    .map(([name, v]) => ({ venture: name, ...v }))
    .sort((a, b) => b.grossCents - a.grossCents);

  return {
    grossCents,
    feeCents,
    netCents: grossCents - feeCents - (includeRefunds ? refundCents : 0),
    refundCents: includeRefunds ? refundCents : 0,
    orders,
    currency,
    byVenture,
    revenueByDay: toBuckets(revenueMap, since, until),
    ordersByDay: toBuckets(ordersMap, since, until),
    available: true,
    note: null,
  };
}

type StripeClient = ReturnType<typeof import("@/lib/stripe.server").createStripeClient>;

const RESUME_PRODUCT_NAME = "Application Kit Pro";
let resumeProductIds: Set<string> | null = null;

/**
 * The Application Kit tags its Stripe Product, Price, Customer and
 * Subscription with metadata.venture = "resume". Stripe does not copy that
 * marker onto the invoice, charge or balance transaction, so we resolve the
 * product ids once and match against them.
 */
async function getResumeProductIds(stripe: StripeClient): Promise<Set<string>> {
  if (resumeProductIds) return resumeProductIds;
  const ids = new Set<string>();
  try {
    const byMeta = await stripe.products.search({
      query: `metadata['venture']:'resume'`,
      limit: 20,
    });
    for (const p of byMeta.data) ids.add(p.id);
  } catch {
    // Search is unavailable in some accounts; the name scan below still works.
  }
  if (ids.size === 0) {
    try {
      for await (const p of stripe.products.list({ limit: 100, active: true })) {
        if (p.name === RESUME_PRODUCT_NAME) ids.add(p.id);
      }
    } catch {
      // Leave empty; resume revenue simply stays unclassified this run.
    }
  }
  resumeProductIds = ids;
  return ids;
}

/** True when this subscription or invoice charge belongs to Application Kit. */
async function isResumeSale(sale: Sale, stripe: StripeClient): Promise<boolean> {
  const productIds = await getResumeProductIds(stripe);

  if (sale.invoice && productIds.size) {
    try {
      const invoice = await stripe.invoices.retrieve(sale.invoice, {
        expand: ["lines.data.price.product"],
      });
      for (const line of invoice.lines?.data ?? []) {
        const price = (line as any)?.price ?? (line as any)?.pricing?.price_details;
        const product = price?.product;
        const productId = typeof product === "string" ? product : product?.id;
        if (productId && productIds.has(productId)) return true;
      }
    } catch {
      // Fall through to the customer check.
    }
  }

  if (sale.customer) {
    try {
      const customer = await stripe.customers.retrieve(sale.customer);
      const marker = (customer as any)?.metadata?.venture;
      if (typeof marker === "string" && marker.toLowerCase() === "resume") return true;
    } catch {
      // Nothing more to check.
    }
  }

  return false;
}

/** Maps payments to a venture using the app's own payment references. */
async function classifyCharges(
  sales: Sale[],
  stripe: StripeClient,
): Promise<Array<{ sale: Sale; venture: string }>> {
  const pis = sales.map((c) => c.pi).filter((v): v is string => !!v);
  const lookup = new Map<string, string>();

  if (pis.length) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [ecards, addons, passes] = await Promise.all([
      supabaseAdmin
        .from("ecards")
        .select("stripe_payment_intent_id")
        .in("stripe_payment_intent_id", pis),
      supabaseAdmin
        .from("event_addons")
        .select("stripe_payment_intent_id")
        .in("stripe_payment_intent_id", pis),
      supabaseAdmin
        .from("one_time_passes")
        .select("stripe_payment_intent_id")
        .in("stripe_payment_intent_id", pis),
    ]);
    for (const r of ecards.data ?? []) {
      if (r.stripe_payment_intent_id) lookup.set(r.stripe_payment_intent_id, VENTURE_ECARDS);
    }
    for (const r of addons.data ?? []) {
      if (r.stripe_payment_intent_id) lookup.set(r.stripe_payment_intent_id, VENTURE_EVENTS);
    }
    for (const r of passes.data ?? []) {
      if (r.stripe_payment_intent_id) lookup.set(r.stripe_payment_intent_id, VENTURE_EVENTS);
    }
  }

  const out: Array<{ sale: Sale; venture: string }> = [];
  for (const sale of sales) {
    const fromDb = sale.pi ? lookup.get(sale.pi) : undefined;
    if (fromDb) {
      out.push({ sale, venture: fromDb });
      continue;
    }
    const kind = (sale.kind ?? "").toLowerCase();
    let venture = VENTURE_OTHER;
    if (kind.includes("ecard")) venture = VENTURE_ECARDS;
    else if (kind.includes("project") || kind.includes("workroom")) venture = VENTURE_WORKROOM;
    else if (kind.includes("event") || kind.includes("addon")) venture = VENTURE_EVENTS;
    else if (kind.includes("sub") || kind.includes("plan") || kind.includes("tier"))
      venture = VENTURE_PLANS;

    // Only subscription-style charges can be a resume sale, and our own
    // Kenroe payments are already matched above, so this cannot steal them.
    if (venture === VENTURE_OTHER || venture === VENTURE_PLANS) {
      if (await isResumeSale(sale, stripe)) venture = VENTURE_RESUME;
    }
    out.push({ sale, venture });
  }
  return out;
}

async function countRows(
  table: string,
  since: string,
  until: string,
  column = "created_at",
  filter?: (q: any) => any,
): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q: any = supabaseAdmin
    .from(table as any)
    .select("id", { count: "exact", head: true })
    .gte(column, since)
    .lt(column, until);
  if (filter) q = filter(q);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

async function dailySeries(
  table: string,
  since: string,
  until: string,
  column: string,
  filter?: (q: any) => any,
): Promise<Bucket[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q: any = supabaseAdmin
    .from(table as any)
    .select(column)
    .gte(column, since)
    .lt(column, until)
    .limit(10000);
  if (filter) q = filter(q);
  const { data } = await q;
  const map = new Map<string, number>();
  for (const row of (data ?? []) as any[]) {
    const v = row[column];
    if (v) addBucket(map, dayKey(v), 1);
  }
  return toBuckets(map, since, until);
}

/** ilike OR filter, or null when the venture has no clear signal for that column. */
function prefixFilter(column: string, prefixes: string[] | undefined) {
  if (!prefixes || prefixes.length === 0) return null;
  const clause = prefixes.map((p) => `${column}.ilike.${p}%`).join(",");
  return (q: any) => q.or(clause);
}

function combine(...filters: Array<((q: any) => any) | null>) {
  const list = filters.filter(Boolean) as Array<(q: any) => any>;
  if (list.length === 0) return undefined;
  return (q: any) => list.reduce((acc, f) => f(acc), q);
}

const ZERO_SERIES = (since: string, until: string) => toBuckets(new Map(), since, until);

/**
 * Messages left on cards, minus anything on a demo or sample card. The
 * contributions table carries no account column, so the demo and showcase
 * cards are looked up first and their messages taken out by card id.
 */
async function countDemoFreeContributions(
  since: string,
  until: string,
  demoIds: string[],
): Promise<number> {
  const total = await countRows("ecard_contributions", since, until);
  if (!demoIds.length || total === 0) return total;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cards } = await supabaseAdmin
    .from("ecards")
    .select("id")
    .in("organizer_user_id", demoIds)
    .limit(2000);
  const ids = (cards ?? []).map((c: any) => c.id);
  if (!ids.length) return total;
  let demoMessages = 0;
  for (let i = 0; i < ids.length; i += 100) {
    demoMessages += await countRows("ecard_contributions", since, until, "created_at", (q: any) =>
      q.in("ecard_id", ids.slice(i, i + 100)),
    );
  }
  return Math.max(0, total - demoMessages);
}

/** Product and operations metrics for the window, scoped to one venture when asked. */
export async function loadProduct(
  since: string,
  until: string,
  venture: VentureId = "all",
): Promise<ProductBlock & { scopeNotes: string[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const all = venture === "all";
  const isEcards = all || venture === "ecards";
  const isEvents = all || venture === "events";
  const isProjects = all || venture === "projects";
  // The Application Kit is a separate app, so none of our own tables describe
  // it. Its numbers come from its metrics feed instead.
  const isResume = venture === "resume";
  const ownTables = !isResume;
  const scopeNotes: string[] = [];

  const emailFilter = all
    ? undefined
    : (prefixFilter("template_name", (VENTURE_EMAIL_PREFIXES as any)[venture]) ?? undefined);
  const errorFilter = all
    ? undefined
    : (prefixFilter("route", (VENTURE_ROUTE_PREFIXES as any)[venture]) ?? undefined);

  const withStatus = (status: string) => (q: any) => q.eq("status", status);
  // Demo and showcase accounts never count toward the owner's numbers.
  const { getDemoUserIds } = await import("@/lib/demo-accounts.server");
  const demoIds = await getDemoUserIds().catch(() => [] as string[]);
  const notDemo = (col: string) => (q: any) => withoutAccounts(q, col, demoIds);

  const [
    ecardsCreated,
    ecardsPaid,
    contributions,
    eventsCreated,
    projectsCreated,
    tasksCreated,
    emailSent,
    emailBounced,
    smsSent,
    smsFailed,
    errors,
    supportMessages,
    emailByDay,
    smsByDay,
  ] = await Promise.all([
    isEcards ? countRows("ecards", since, until, "created_at", notDemo("organizer_user_id")) : 0,
    isEcards ? countRows("ecards", since, until, "paid_at", notDemo("organizer_user_id")) : 0,
    isEcards ? countDemoFreeContributions(since, until, demoIds) : 0,
    isEvents ? countRows("events", since, until, "created_at", notDemo("user_id")) : 0,
    isProjects ? countRows("pm_projects", since, until, "created_at", notDemo("owner_user_id")) : 0,
    isProjects ? countRows("pm_tasks", since, until, "created_at", notDemo("created_by")) : 0,
    ownTables
      ? countRows(
          "email_send_log",
          since,
          until,
          "created_at",
          combine(withStatusIn(["sent","delivered"]), emailFilter ?? null),
        )
      : 0,
    ownTables
      ? countRows(
          "email_send_log",
          since,
          until,
          "created_at",
          combine(withStatus("bounced"), emailFilter ?? null),
        )
      : 0,
    isEvents
      ? countRows("sms_outbox", since, until, "created_at", combine(withStatusIn(["sent","delivered"]), notDemo("user_id")))
      : 0,
    isEvents
      ? countRows("sms_outbox", since, until, "created_at", combine(withStatus("failed"), notDemo("user_id")))
      : 0,
    ownTables
      ? countRows("app_error_logs", since, until, "created_at", combine(errorFilter ?? null, notDemo("user_id")))
      : 0,
    all ? countRows("support_tickets", since, until, "created_at", notDemo("user_id")) : 0,
    ownTables
      ? dailySeries(
          "email_send_log",
          since,
          until,
          "created_at",
          combine(withStatusIn(["sent","delivered"]), emailFilter ?? null),
        )
      : ZERO_SERIES(since, until),
    isEvents
      ? dailySeries(
          "sms_outbox",
          since,
          until,
          "created_at",
          combine(withStatusIn(["sent","delivered"]), notDemo("user_id")),
        )
      : ZERO_SERIES(since, until),
  ]);

  if (isResume) {
    scopeNotes.push(
      "Application Kit product numbers come from that app's own metrics feed. Its emails, errors and support messages are recorded in that app, not here.",
    );
  } else if (!all) {
    scopeNotes.push(
      "Emails and errors counted here are the ones that clearly belong to this venture, by template name or page. Anything app-wide is only counted under All ventures.",
    );
    scopeNotes.push(
      "Refunds and support messages are app-wide, so they appear under All ventures.",
    );
    if (!isEvents) scopeNotes.push("Text messages are only used by Events & Gatherings.");
  }

  // RSVPs live inside each event's guest list, so they are counted from the
  // events created in the window.
  let rsvpsYes = 0;
  if (isEvents) {
    // Shared accessor: demo events are excluded unless the request opts in.
    const { eventsReadQuery } = await import("@/lib/events-access.server");
    const { query } = await eventsReadQuery("data");
    const { data: eventRows } = await query
      .gte("created_at", since)
      .lt("created_at", until)
      .limit(2000);
    for (const row of (eventRows ?? []) as any[]) {
      const guests = row?.data?.guests;
      if (Array.isArray(guests)) {
        for (const g of guests) {
          const r = String(g?.rsvp ?? g?.status ?? "").toLowerCase();
          if (r === "yes" || r === "attending" || r === "accepted") rsvpsYes += 1;
        }
      }
    }
  }

  return {
    ecardsCreated,
    ecardsPaid,
    contributions,
    eventsCreated,
    rsvpsYes,
    projectsCreated,
    tasksCreated,
    emailSent,
    emailBounced,
    smsSent,
    smsFailed,
    errors,
    supportMessages,
    emailByDay,
    smsByDay,
    scopeNotes,
  };
}

export async function loadPeriod(
  env: StripeEnv,
  since: string,
  until: string,
  venture: VentureId = "all",
): Promise<PeriodTotals> {
  const [revenue, product, resume] = await Promise.all([
    loadRevenue(env, since, until, venture),
    loadProduct(since, until, venture),
    venture === "resume"
      ? import("@/lib/resume-feed.server").then((m) => m.loadResumeMetrics(since, until))
      : Promise.resolve(undefined),
  ]);
  return { ...revenue, ...product, ...(resume ? { resume } : {}) };
}
