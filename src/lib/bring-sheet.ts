/**
 * Potluck / "what to bring" sign-up sheet — pure logic.
 *
 * Kept free of React and server imports so the maths (slots remaining,
 * grouping, the still-needed summary, CSV rows) is unit-testable and shared by
 * the host panel, the guest section on the invite page, and the standalone
 * /bring link.
 */

export const BRING_CATEGORIES = [
  { id: "appetizer", label: "Appetizer" },
  { id: "main", label: "Main dish" },
  { id: "side", label: "Side" },
  { id: "salad", label: "Salad" },
  { id: "dessert", label: "Dessert" },
  { id: "baked", label: "Baked goods" },
  { id: "drinks", label: "Drinks" },
  { id: "supplies", label: "Ice & supplies" },
  { id: "other", label: "Other" },
] as const;

export type BringCategoryId = (typeof BRING_CATEGORIES)[number]["id"];

export function bringCategoryLabel(id: string | null | undefined): string {
  const found = BRING_CATEGORIES.find((c) => c.id === id);
  return found ? found.label : "Other";
}

/** RSVP state of the guest behind a sign-up, when we can match them. */
export type BringRsvp = "yes" | "no" | "pending" | "unknown";

export function rsvpLabel(rsvp: BringRsvp | undefined): string {
  if (rsvp === "yes") return "Attending";
  if (rsvp === "no") return "Declined";
  if (rsvp === "pending") return "Not replied";
  return "Not on guest list";
}

function nameKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Link a sign-up back to the RSVP list by name (guests sign up without an
 * account, so the name they typed is all we have). Exact, case and
 * whitespace-insensitive matches only — a fuzzy match here would mislabel
 * someone's attendance, which is worse than showing "not on guest list".
 */
export function matchGuestRsvp(
  claimName: string | null | undefined,
  guests: { name?: string | null; status?: string | null }[] | null | undefined,
): BringRsvp {
  const key = nameKey(claimName);
  if (!key || !guests?.length) return "unknown";
  const hit = guests.find((g) => nameKey(g.name) === key);
  if (!hit) return "unknown";
  const status = (hit.status ?? "").toLowerCase();
  if (status === "yes" || status === "attending" || status === "confirmed") return "yes";
  if (status === "no" || status === "declined") return "no";
  return "pending";
}

export interface BringClaim {
  id: string;
  name: string | null;
  dish: string | null;
  note: string | null;
  createdAt: string;
  /** Filled in on the host side only; guests never see other guests' RSVPs. */
  rsvp?: BringRsvp;
}


export interface BringItem {
  id: string;
  name: string;
  note: string | null;
  category: string;
  slotsNeeded: number;
  serves: number | null;
  suggested: boolean;
  claims: BringClaim[];
}

export interface BringSheet {
  found: boolean;
  eventTitle?: string;
  enabled: boolean;
  allowSuggestions: boolean;
  showNames: boolean;
  dietaryCount?: number;
  accessibilityCount?: number;
  items: BringItem[];
}

export const MAX_BRING_ITEMS = 200;
export const MAX_BRING_SLOTS = 20;

/** How many sign-up spots are still open on an item. Never negative. */
export function slotsRemaining(item: BringItem): number {
  const needed = Math.max(1, Math.floor(item.slotsNeeded || 1));
  return Math.max(0, needed - (item.claims?.length ?? 0));
}

export function isItemFull(item: BringItem): boolean {
  return slotsRemaining(item) === 0;
}

export interface BringTotals {
  items: number;
  claimed: number;
  slotsNeeded: number;
  openSlots: number;
  guestSuggested: number;
  people: number;
  serves: number;
}

export function bringTotals(items: BringItem[]): BringTotals {
  let claimed = 0;
  let slotsNeeded = 0;
  let openSlots = 0;
  let guestSuggested = 0;
  let serves = 0;
  const names = new Set<string>();
  for (const item of items) {
    const needed = Math.max(1, Math.floor(item.slotsNeeded || 1));
    slotsNeeded += needed;
    claimed += Math.min(needed, item.claims?.length ?? 0);
    openSlots += slotsRemaining(item);
    if (item.suggested) guestSuggested += 1;
    if (item.serves && item.claims?.length) serves += item.serves * item.claims.length;
    for (const c of item.claims ?? []) {
      const key = (c.name ?? "").trim().toLowerCase();
      if (key) names.add(key);
    }
  }
  return {
    items: items.length,
    claimed,
    slotsNeeded,
    openSlots,
    guestSuggested,
    people: names.size,
    serves,
  };
}

/** Items grouped by category, in the canonical category order. */
export function groupByCategory(items: BringItem[]): { id: string; label: string; items: BringItem[] }[] {
  const order = BRING_CATEGORIES.map((c) => c.id) as string[];
  const buckets = new Map<string, BringItem[]>();
  for (const item of items) {
    const key = order.includes(item.category) ? item.category : "other";
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }
  return order
    .filter((id) => (buckets.get(id)?.length ?? 0) > 0)
    .map((id) => ({ id, label: bringCategoryLabel(id), items: buckets.get(id)! }));
}

/** Items with at least one open spot, in list order. */
export function openItems(items: BringItem[]): BringItem[] {
  return items.filter((i) => slotsRemaining(i) > 0);
}

/**
 * Plain-text "still needed" summary hosts can paste into an announcement or
 * text thread. Returns an empty string when nothing is outstanding.
 */
export function stillNeededSummary(items: BringItem[]): string {
  const open = openItems(items);
  if (open.length === 0) return "";
  return open
    .map((i) => {
      const left = slotsRemaining(i);
      const qty = left > 1 ? ` (${left} more needed)` : "";
      return `• ${i.name}${qty}${i.note ? ` — ${i.note}` : ""}`;
    })
    .join("\n");
}

export function bringCsvRows(items: BringItem[]): string[][] {
  const rows: string[][] = [
    ["Category", "Item", "Host note", "Spots needed", "Spots filled", "Serves", "Added by", "Signed up", "RSVP", "Bringing", "Guest note"],
  ];
  for (const item of items) {
    const needed = Math.max(1, Math.floor(item.slotsNeeded || 1));
    const addedBy = item.suggested ? "Guest" : "Host";
    if (!item.claims?.length) {
      rows.push([
        bringCategoryLabel(item.category),
        item.name,
        item.note ?? "",
        String(needed),
        "0",
        item.serves ? String(item.serves) : "",
        addedBy,
        "",
        "",
        "",
        "",
      ]);
      continue;
    }
    for (const c of item.claims) {
      rows.push([
        bringCategoryLabel(item.category),
        item.name,
        item.note ?? "",
        String(needed),
        String(item.claims.length),
        item.serves ? String(item.serves) : "",
        addedBy,
        c.name ?? "Anonymous",
        c.rsvp ? rsvpLabel(c.rsvp) : "",
        c.dish ?? "",
        c.note ?? "",
      ]);
    }
  }
  return rows;
}

export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const v = cell ?? "";
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(","),
    )
    .join("\n");
}

/** Loose duplicate detection so we can gently warn a second guest. */
export function looksLikeDuplicate(dish: string, items: BringItem[]): string | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
  const target = norm(dish);
  if (target.length < 3) return null;
  for (const item of items) {
    for (const c of item.claims ?? []) {
      // Fall back to the item name: a guest who claims without renaming the
      // dish still counts as "someone is already bringing this".
      const label = c.dish ?? item.name;
      const other = norm(label);
      if (!other) continue;
      if (other === target || other.includes(target) || target.includes(other)) {
        return label;
      }
    }
  }
  return null;
}

export interface BringTemplateItem {
  name: string;
  category: BringCategoryId;
  slotsNeeded?: number;
  note?: string;
}

export interface BringTemplate {
  id: string;
  name: string;
  emoji: string;
  items: BringTemplateItem[];
}

/** One-tap starter lists. Hosts can edit or delete anything afterwards. */
export const BRING_TEMPLATES: BringTemplate[] = [
  {
    id: "bbq",
    name: "Backyard BBQ",
    emoji: "🔥",
    items: [
      { name: "Burger buns", category: "side", slotsNeeded: 2 },
      { name: "Potato salad", category: "salad" },
      { name: "Coleslaw", category: "salad" },
      { name: "Chips & dip", category: "appetizer", slotsNeeded: 2 },
      { name: "Soft drinks", category: "drinks", slotsNeeded: 2 },
      { name: "Bag of ice", category: "supplies", slotsNeeded: 2 },
      { name: "Dessert", category: "dessert", slotsNeeded: 2 },
    ],
  },
  {
    id: "bake-sale",
    name: "Bake sale",
    emoji: "🧁",
    items: [
      { name: "Brownies", category: "baked", slotsNeeded: 2, note: "Cut and boxed if you can" },
      { name: "Cookies", category: "baked", slotsNeeded: 3 },
      { name: "Cupcakes", category: "baked", slotsNeeded: 2 },
      { name: "Nut-free treat", category: "baked", note: "Please label ingredients" },
      { name: "Paper plates & napkins", category: "supplies" },
    ],
  },
  {
    id: "thanksgiving",
    name: "Thanksgiving",
    emoji: "🦃",
    items: [
      { name: "Mac & cheese", category: "side" },
      { name: "Greens", category: "side" },
      { name: "Dressing", category: "side" },
      { name: "Cranberry sauce", category: "side" },
      { name: "Dinner rolls", category: "side" },
      { name: "Sweet potato pie", category: "dessert", slotsNeeded: 2 },
      { name: "Sparkling cider", category: "drinks" },
    ],
  },
  {
    id: "brunch",
    name: "Brunch",
    emoji: "🥞",
    items: [
      { name: "Fruit platter", category: "appetizer" },
      { name: "Pastries", category: "baked", slotsNeeded: 2 },
      { name: "Breakfast casserole", category: "main" },
      { name: "Juice", category: "drinks", slotsNeeded: 2 },
      { name: "Coffee & creamer", category: "drinks" },
    ],
  },
  {
    id: "bonfire",
    name: "Bonfire",
    emoji: "\ud83e\udeb5",
    items: [
      { name: "Firewood bundle", category: "supplies", slotsNeeded: 3, note: "Dry, split logs if you can" },
      { name: "Fire starters or kindling", category: "supplies" },
      { name: "S'mores kit (marshmallows, chocolate, grahams)", category: "dessert", slotsNeeded: 2 },
      { name: "Roasting sticks or skewers", category: "supplies" },
      { name: "Hot dogs & buns", category: "main", slotsNeeded: 2 },
      { name: "Chips & dip", category: "appetizer", slotsNeeded: 2 },
      { name: "Hot cocoa or cider", category: "drinks", slotsNeeded: 2 },
      { name: "Cooler of drinks & ice", category: "drinks" },
      { name: "Folding chairs", category: "supplies", slotsNeeded: 4 },
      { name: "Blankets", category: "supplies", slotsNeeded: 3 },
      { name: "Bug spray", category: "supplies" },
      { name: "Trash bags", category: "supplies" },
    ],
  },
  {
    id: "office",
    name: "Office party",
    emoji: "🎉",
    items: [
      { name: "Finger food tray", category: "appetizer", slotsNeeded: 2 },
      { name: "Pizza", category: "main", slotsNeeded: 2 },
      { name: "Salad", category: "salad" },
      { name: "Cake", category: "dessert" },
      { name: "Cups, plates, cutlery", category: "supplies" },
      { name: "Bag of ice", category: "supplies" },
    ],
  },
];
