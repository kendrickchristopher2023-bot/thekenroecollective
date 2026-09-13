/**
 * Single source of truth for the admin/owner Reports hub.
 *
 * Every report in the product is listed here once. The hub renders this array,
 * so a new report only has to be added in one place to be discoverable. Reports
 * still live in their contextual homes (owner tabs, the event's own Reports
 * tab); these entries are links into them, not copies of them.
 */
export type ReportGroup = "business" | "guests" | "ops";

/** Tab ids the Owner console accepts in its `?tab=` search param. */
export type OwnerTabId =
  | "revenue"
  | "report"
  | "assistant"
  | "approvals"
  | "announcements"
  | "reports"
  | "reconciliation"
  | "guestneeds"
  | "tiers"
  | "discounts"
  | "subscriptions"
  | "users"
  | "support"
  | "settings"
  | "messaging"
  | "errors";

export type AccountReport = {
  id: string;
  title: string;
  blurb: string;
  group: ReportGroup;
  /** Hidden from plain admins when true. */
  ownerOnly: boolean;
  /** Owner console tab id, or null when the report has its own route. */
  ownerTab: OwnerTabId | null;
  /** Used instead of ownerTab for reports that live on their own route. */
  route?: "/owner-analytics" | "/activity-log";
};

export const REPORT_GROUPS: { id: ReportGroup; title: string; blurb: string }[] = [
  {
    id: "guests",
    title: "Guests",
    blurb: "What guests told you: attendance, needs, sizes.",
  },
  {
    id: "business",
    title: "Business",
    blurb: "Revenue, payments, and how the collective is doing.",
  },
  {
    id: "ops",
    title: "Operations",
    blurb: "Delivery logs, activity, and app health.",
  },
];

export const ACCOUNT_REPORTS: AccountReport[] = [
  {
    id: "activity",
    title: "Activity log",
    blurb: "Who checked guests in or reversed a check-in, with gathering, guest, party size, and timestamp.",
    group: "ops",
    ownerOnly: false,
    ownerTab: null,
    route: "/activity-log",
  },
  {
    id: "guestneeds",
    title: "Dietary & accessibility",
    blurb: "Every dietary restriction and accessibility need across all events, in one list for catering and venues.",
    group: "guests",
    ownerOnly: false,
    ownerTab: "guestneeds",
  },
  {
    id: "report",
    title: "Owner Report",
    blurb: "The headline snapshot: events, guests, and growth at a glance.",
    group: "business",
    ownerOnly: true,
    ownerTab: "report",
  },
  {
    id: "assistant",
    title: "Owner assistant",
    blurb:
      "Ask questions about the platform's real data and get answers with the reports they came from.",
    group: "business",
    ownerOnly: true,
    ownerTab: "assistant",
  },
  {
    id: "revenue",
    title: "Revenue",
    blurb: "Subscriptions, plan mix, and monthly recurring revenue.",
    group: "business",
    ownerOnly: true,
    ownerTab: "revenue",
  },
  {
    id: "reconciliation",
    title: "Payment reconciliation",
    blurb: "Billed against collected against outstanding, event by event.",
    group: "business",
    ownerOnly: false,
    ownerTab: "reconciliation",
  },
  {
    id: "analytics",
    title: "Analytics",
    blurb: "Traffic, sign-up funnel, and conversion over any date range.",
    group: "business",
    ownerOnly: true,
    ownerTab: null,
    route: "/owner-analytics",
  },
  {
    id: "messaging",
    title: "Messaging log",
    blurb: "Every email and text the app has sent, with delivery status.",
    group: "ops",
    ownerOnly: true,
    ownerTab: "messaging",
  },
  {
    id: "updates",
    title: "Recent activity",
    blurb: "The latest changes hosts made across their events.",
    group: "ops",
    ownerOnly: false,
    ownerTab: "reports",
  },
  {
    id: "errors",
    title: "Error monitoring",
    blurb: "Application errors captured from real sessions.",
    group: "ops",
    ownerOnly: true,
    ownerTab: "errors",
  },
];

export function visibleAccountReports(isOwner: boolean): AccountReport[] {
  return ACCOUNT_REPORTS.filter((r) => isOwner || !r.ownerOnly);
}

export type EventReportKind = "full" | "attendance" | "shirts" | "bring" | "summary";

export const EVENT_REPORTS: { id: EventReportKind; title: string; blurb: string }[] = [
  {
    id: "full",
    title: "Guest data report",
    blurb: "Everything guests submitted: RSVP, headcounts, shirt sizes, dietary, accessibility, payments. Export CSV or email it.",
  },
  {
    id: "attendance",
    title: "Attendance CSV",
    blurb: "One row per guest with RSVP status, adults, children, and pets.",
  },
  {
    id: "shirts",
    title: "Shirt order CSV",
    blurb: "Size tally for the printer, plus who ordered what.",
  },
  {
    id: "bring",
    title: "What to bring CSV",
    blurb: "Every potluck item with spots needed, who signed up, their RSVP status, and what they are bringing.",
  },

  {
    id: "summary",
    title: "Event summary",
    blurb: "The printable one-pager with counts and response rate, on the event's own Reports tab.",
  },
];
