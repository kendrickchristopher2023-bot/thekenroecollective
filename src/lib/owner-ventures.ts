// Owner Command Center: the venture switcher, shared by client and server.
//
// Attribution is deliberately honest. A metric is only shown for a venture when
// a clear signal ties it to that venture (its own tables, the Stripe venture
// classification, an email template name, or a page route). Anything that cannot
// be tied to one venture stays app-wide and is only counted under All ventures.

export type VentureId = "all" | "events" | "ecards" | "projects" | "resume";

export type VentureOption = {
  id: VentureId;
  label: string;
  /** False means this project cannot read that venture's data yet. */
  connected: boolean;
};

export const OWNER_VENTURES: VentureOption[] = [
  { id: "all", label: "All ventures", connected: true },
  { id: "events", label: "Events & Gatherings", connected: true },
  { id: "ecards", label: "Group eCards", connected: true },
  { id: "projects", label: "Projects", connected: true },
  { id: "resume", label: "Application Kit", connected: true },
];

export function ventureLabel(id: VentureId): string {
  return OWNER_VENTURES.find((v) => v.id === id)?.label ?? "All ventures";
}

export function isVentureConnected(id: VentureId): boolean {
  return OWNER_VENTURES.find((v) => v.id === id)?.connected ?? false;
}

/** Venture names produced by the Stripe payment classification. */
export const VENTURE_REVENUE_NAMES: Record<"events" | "ecards" | "projects" | "resume", string[]> =
  {
    ecards: ["Group eCards"],
    events: ["Events and Gatherings"],
    projects: ["Projects"],
    resume: ["Application Kit"],
  };

/** Email template name prefixes that clearly belong to one venture. */
export const VENTURE_EMAIL_PREFIXES: Record<"events" | "ecards" | "projects", string[]> = {
  ecards: ["ecard"],
  events: ["event", "rsvp", "announcement", "thank", "invite", "checkin", "guest"],
  projects: ["pm", "project"],
};

/** Page route prefixes that clearly belong to one venture. */
export const VENTURE_ROUTE_PREFIXES: Record<"events" | "ecards" | "projects", string[]> = {
  ecards: ["/ecards", "/c/", "/ec/", "/r/"],
  events: ["/events", "/e/", "/invite", "/checkin", "/wall", "/gatherings", "/gift"],
  projects: ["/workroom", "/projects"],
};

/** Which KPI groups make sense for the selected venture. */
export function ventureShows(
  venture: VentureId,
  group:
    | "revenue"
    | "refunds"
    | "ecards"
    | "events"
    | "projects"
    | "resumeFeed"
    | "email"
    | "sms"
    | "errors"
    | "support",
): boolean {
  if (venture === "all") return group !== "resumeFeed";
  switch (group) {
    case "revenue":
      return true;
    case "refunds":
    case "support":
      return false;
    case "ecards":
      return venture === "ecards";
    case "events":
      return venture === "events";
    case "projects":
      return venture === "projects";
    case "resumeFeed":
      return venture === "resume";
    case "email":
    case "errors":
      // The Application Kit sends its own email and logs its own errors in a
      // separate app, so our messaging and error tables say nothing about it.
      return venture !== "resume";
    case "sms":
      return venture === "events";
    default:
      return false;
  }
}

export const APP_WIDE_NOTE =
  "Refunds and support messages are recorded app-wide, so they are only shown under All ventures.";
