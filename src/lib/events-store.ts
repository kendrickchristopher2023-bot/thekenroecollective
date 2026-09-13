import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { isShirtSize, shirtBand, type ShirtSize } from "@/lib/tshirt-sizes";
import { externalizeInlineEventMedia } from "@/lib/media-upload-client";
import { fareFromCounts, namedPlusOneCount, namedChildPlusOneCount } from "@/lib/party-fare";
import {
  DEFAULT_EVENT_TIME_ZONE,
  eventInstant,
  formatEventDate as formatCanonicalEventDate,
} from "@/lib/datetime";
import {
  normalizeReminderTime,
  reminderTimeFor,
  scheduledReminderInstant,
} from "@/lib/reminder-schedule";



export type RsvpStatus = "pending" | "yes" | "no" | "maybe" | "waitlisted";

export interface PlusOne {
  name: string;
  dietary?: string;
  accessibility?: string;
  /** Optional T-shirt size (enum key from src/lib/tshirt-sizes.ts). Host+ feature. */
  shirtSize?: string;
  /** When true, this named plus-one is a child (billed at the child rate). */
  isChild?: boolean;
}


export type PaymentStatus =
  | "not_sent"
  | "sent"
  | "pending"
  | "partial"
  | "paid"
  | "refunded"
  | "canceled";

/** How money actually changed hands. Enum-only so reports never drift on free text. */
export const PAYMENT_METHODS = [
  "cash",
  "cashapp",
  "venmo",
  "zelle",
  "paypal",
  "check",
  "stripe",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  cashapp: "Cash App",
  venmo: "Venmo",
  zelle: "Zelle",
  paypal: "PayPal",
  check: "Check",
  stripe: "Card (Stripe)",
  other: "Other",
};

/**
 * One append-only money movement. Positive amounts are payments received,
 * negative amounts are refunds. Entries are never edited or removed, so a guest
 * who paid and then declined keeps a full record instead of losing the payment.
 */
export interface PaymentEntry {
  id: string;
  at: string;
  /** Positive = received, negative = refunded. */
  amount: number;
  method: PaymentMethod;
  kind: "payment" | "refund";
  note?: string;
}

export interface GuestPayment {
  status: PaymentStatus;
  link?: string;
  sentAt?: string;
  remindersSent?: number;
  lastReminderAt?: string;
  amount?: number; // per-guest override; falls back to event.paymentAmount
  paidAmount?: number; // legacy single-figure total; kept in sync with history
  /** Append-only audit trail of payments and refunds. */
  history?: PaymentEntry[];
  /** Guest opted into payment nudges even though they only answered "maybe". */
  remindersOptIn?: boolean;
  /**
   * Frozen shirt charge for this guest, written when a payment link is sent or
   * the first payment lands. Without it, a host editing the shirt price later
   * would silently rewrite what already-billed guests owe.
   */
  shirtAmount?: number;
}

export type GuestCategory = "adult" | "kid" | "pet";

export interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  status: RsvpStatus;
  adults?: number;
  children?: number;
  pets?: number;
  category?: GuestCategory;
  dietary?: string;
  payment?: GuestPayment;
  /** ISO timestamp of the last time an invitation email was sent to this guest. */
  invitedAt?: string;
  /** Guest's chosen UI language on the invite page (e.g. "es"). Persists so reminders honor their language. */
  preferredLanguage?: string;
  /** ISO timestamp of the last RSVP-reminder email sent to this guest. */
  lastReminderAt?: string;
  /** How many RSVP reminders have been sent to this guest. */
  reminderCount?: number;
  /** Named plus-ones added by the guest at RSVP time. */
  plusOnes?: PlusOne[];
  /** Accessibility needs (wheelchair, ASL, sensory, etc.). */
  accessibilityNotes?: string;
  /** ISO timestamp of when the guest was promoted from the waitlist. */
  waitlistPromotedAt?: string;
  /**
   * Host-controlled waitlist order (0-based). Set by drag-to-reorder in the
   * waitlist panel; rows without one keep insertion order and sort last. See
   * src/lib/waitlist.ts.
   */
  waitlistPosition?: number;

  /** Optional T-shirt size (enum key from src/lib/tshirt-sizes.ts). Host+ feature. */
  shirtSize?: string;
  /**
   * Spare shirts ordered on top of this party's own sizes. Merchandise, not
   * people: never counted in headcount, capacity or the plus-ones allowance.
   */
  extraShirts?: { size: string; qty: number }[];
  /**
   * How this guest row came to exist. "walkin" rows are created at the door by
   * staff for people who were never on the invite list, so the host panel can
   * report Invited arrived / Walk-ins separately.
   */
  source?: "invite" | "walkin";
}




export interface RegistryLink {
  id: string;
  store: string;
  url: string;
  label?: string;
  note?: string;
  purchased?: boolean;
  thankYouSent?: boolean;
}

export const REGISTRY_STORES = [
  "Amazon", "Target", "Walmart", "Crate & Barrel", "Williams Sonoma",
  "Pottery Barn", "Bed Bath & Beyond", "Etsy", "Zola", "The Knot",
  "MyRegistry", "Honeyfund", "Babylist", "REI", "Best Buy", "Custom",
] as const;

export function detectRegistryStore(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const map: Record<string, string> = {
      "amazon.com": "Amazon", "amzn.to": "Amazon",
      "target.com": "Target", "walmart.com": "Walmart",
      "crateandbarrel.com": "Crate & Barrel",
      "williams-sonoma.com": "Williams Sonoma",
      "potterybarn.com": "Pottery Barn",
      "bedbathandbeyond.com": "Bed Bath & Beyond",
      "etsy.com": "Etsy", "zola.com": "Zola", "theknot.com": "The Knot",
      "myregistry.com": "MyRegistry", "honeyfund.com": "Honeyfund",
      "babylist.com": "Babylist", "rei.com": "REI", "bestbuy.com": "Best Buy",
    };
    for (const key in map) if (host.endsWith(key)) return map[key];
    return "Custom";
  } catch {
    return "Custom";
  }
}

export const REMINDER_PRESETS: { id: string; label: string; days: number }[] = [
  { id: "1y", label: "1 year before", days: 365 },
  { id: "6m", label: "6 months before", days: 182 },
  { id: "2m", label: "2 months before", days: 60 },
  { id: "1m", label: "1 month before", days: 30 },
  { id: "2w", label: "2 weeks before", days: 14 },
  { id: "1w", label: "1 week before", days: 7 },
  { id: "2d", label: "2 days before", days: 2 },
  { id: "1d", label: "1 day before", days: 1 },
  { id: "dayof", label: "Day of the event", days: 0 },
];

export interface Review {
  id: string;
  name: string;
  rating: number; // 1-5
  comment: string;
  createdAt: string;
  guestEmail?: string;
}

export interface Host {
  id: string;
  role: string; // "Host", "Co-host", "Maid of Honor", etc.
  name: string;
  relationship?: string; // "Mother of the bride", "Best friend"
  email?: string;
  phone?: string;
  photo?: string; // data URL
  bio?: string;
  showContact?: boolean; // show email/phone publicly on the invite
}


export type MediaKind = "image" | "gif" | "video" | "ai" | "meme" | "embed";

export interface MediaItem {
  id: string;
  kind: MediaKind;
  url: string;
  caption?: string;
  prompt?: string;
  /** AI tiles only: how many times this tile has been regenerated in place. Capped by AI_REGEN_LIMIT. */
  regenCount?: number;
}

/** Max in-place regenerations allowed per AI gallery tile (3 images total per prompt).
 *  Each regen is a real Lovable AI Gateway image call, so keep this ceiling low. */
export const AI_REGEN_LIMIT = 2;


export interface KEvent {
  id: string;
  /**
   * Local-only ownership marker. It is populated from the authenticated events
   * query and removed before writes. Never trust it as an authorization check.
   */
  _ownerUserId?: string;
  /**
   * Local-only marker for seeded demo events, so anywhere one shows up in a
   * real person's list it can say so plainly. Removed before writes.
   */
  _isDemo?: boolean;
  /** Server-issued token required on /checkin, /qr-cards, /run-of-show share URLs. */
  shareToken?: string;

  title: string;
  date: string;
  /** IANA timezone the event takes place in. When set, formatters render `date` in this zone. */
  timezone?: string;
  venue: string;
  address?: string;
  description: string;
  message: string;
  language?: string;
  guests: Guest[];
  createdAt: string;
  image?: string;
  logo?: string;
  color?: string;
  font?: string;
  bodyFont?: string;
  /**
   * From: display name guests see on invitations and reminders. Defaults to
   * "Host Name (Event title)" when unset — never the platform name.
   */
  senderName?: string;
  paymentEnabled?: boolean;
  paymentAmount?: number;
  paymentAmountChild?: number;
  paymentCurrency?: string;
  paymentPurpose?: string;
  reminderPresetIds?: string[];
  /**
   * Per-preset send time, "HH:MM" in the EVENT'S OWN time zone, keyed by preset
   * id. Missing entries fall back to 9:00 AM event-local.
   */
  reminderTimes?: Record<string, string>;
  reminderLog?: { sentAt: string; presetId?: string; note?: string }[];
  /** Also text the ticked reminders, not just email them. */
  reminderSmsEnabled?: boolean;
  /** Host-authored SMS template for scheduled reminders. Tokens: {event} {when} {name} {link} {host}. */
  reminderSmsBody?: string;
  registry?: RegistryLink[];
  dressCode?: string;
  hashtag?: string;
  playlistUrl?: string;
  /**
   * Photo Wall soundtrack: play songs end to end with a clean gap instead of
   * blending them. Off by default; hosts turn it on for a ceremony where two
   * songs overlapping would be wrong.
   */
  wallNoCrossfade?: boolean;

  /**
   * Photo Wall soundtrack: run the wall with no sound tonight. The music comes
   * from the room (a phone into a speaker, or the venue system) while the screen
   * shows photos. Every song stays attached to the event, so this is reversible
   * and never destroys work.
   */
  wallSilent?: boolean;


  /** Host-uploaded song for the invitation (public storage URL). */
  songUrl?: string;
  songTitle?: string;
  songArtist?: string;
  /** Off hides the download button; guests can still play in the page. */
  songAllowDownload?: boolean;
  livestreamUrl?: string;

  accommodations?: string;
  schedule?: string;
  transit?: string;
  seating?: string;
  photoAlbumUrl?: string;
  canvaUrl?: string;
  rsvpUrl?: string;
  weatherEnabled?: boolean;
  reviews?: Review[];
  payVenmo?: string;
  payCashapp?: string;
  payZelle?: string;
  payPaypal?: string;
  hosts?: Host[];
  voiceMessage?: string;
  voiceMessageDuration?: number;
  welcomeQuote?: string;
  countdownEnabled?: boolean;
  /** When on, a guest who can't find their name can add themselves from the invite. */
  openGuestList?: boolean;
  /** When on, guests may choose to make a comment visible to everyone.
   *  Private, host-only comments are always available. */
  publicCommentsEnabled?: boolean;

  inviteMedia?: MediaItem[];
  thankYouCards?: ThankYouCard[];
  /** In-progress thank-you card composer, saved as the host types so leaving
   *  the screen never loses a sign-off, message, photo or recipient pick. */
  thankYouDraft?: ThankYouDraft;
  inviteAnimation?: InviteAnimation;
  /** How much time the entrance takes: Subtle, Balanced (default) or Cinematic. */
  entrancePace?: EntrancePace;
  seatingTables?: SeatingTable[];
  /** Optional seating constraints: keep pairs together, or apart. Warnings only. */
  seatingRules?: SeatingRule[];
  /**
   * Optional series (occasion) name, e.g. "Kendrick Family Reunion 2027". Events
   * sharing the same trimmed name are shown together and can copy one another's
   * guest list. Empty/undefined means a standalone event, which is the default.
   */
  seriesName?: string;



  timelineBlocks?: TimelineBlock[];
  checkIns?: CheckIn[];
  giftFund?: GiftFund;
  tipJar?: TipJar;
  affiliateClicks?: AffiliateClick[];
  brandedSlug?: string;
  calendarSyncEnabled?: boolean;
  /** ISO date/time by which guests should RSVP. Shown on the invite page and drives auto-nudge cadence. */
  rsvpDeadline?: string;
  /** Offsets (days before deadline) at which to send RSVP reminders. Defaults to [14,7,2]. */
  rsvpReminderOffsetDays?: number[];
  /** Max confirmed attendees (adults+kids). When set with waitlistEnabled, additional yeses go to the waitlist. */
  capacity?: number;
  /** Enable waitlist behavior once capacity is reached. Host+ only. */
  waitlistEnabled?: boolean;
  /** Automatically promote the oldest waitlisted guest when capacity opens. Host+ only. */
  autoPromote?: boolean;
  /**
   * What to do when the next waitlisted party is bigger than the seats that
   * opened: "skip" to the next party that fits (default) or "hold" the seats.
   * A party is never partially promoted. See src/lib/waitlist.ts.
   */
  waitlistPolicy?: "skip" | "hold";
  /**
   * Host deliberately allows the confirmed headcount to exceed the cap. RSVPs
   * are no longer blocked or waitlisted; the over-capacity warning stays.
   */
  allowOverCapacity?: boolean;
  /** Audit trail of waitlist promotions, newest last. Host-visible. */
  waitlistLog?: {
    at: string;
    guestId: string;
    guestName: string;
    heads: number;
    by: "auto" | "host";
    note?: string;
  }[];

  /** How many named plus-ones a guest can add at RSVP. Default 0. */
  plusOnesAllowed?: number;
  /** Collect an optional T-shirt size per person (guest + each named plus-one). Host+ only. */
  tshirtSizesEnabled?: boolean;
  /**
   * Once the host places the shirt order, lock sizes: the RSVP form and the
   * host guest list show them read-only. Owners/admins can still correct a
   * size through the owner console guest editor.
   */
  tshirtSizesLocked?: boolean;
  /** ISO timestamp of when sizes were locked. Shown to guests/hosts. */
  tshirtSizesLockedAt?: string;
  /**
   * Shirts as a priced line item. Deliberately separate from
   * `tshirtSizesEnabled` so a host can collect sizes without charging.
   */
  shirtPricingEnabled?: boolean;
  /** Price per adult-band shirt (XS-3XL), in the event currency. */
  shirtPriceAdult?: number;
  /** Price per youth-band shirt (S-L). Blank falls back to the adult price. */
  shirtPriceYouth?: number;
  /** Let guests order spare shirts beyond their own party. */
  extraShirtsEnabled?: boolean;
  /** Host ceiling on extra shirts per RSVP, 0..MAX_EXTRA_SHIRTS. */
  maxExtraShirtsPerRsvp?: number;
  /**
   * Attendee categories the host accepts on this event. Undefined = enabled,
   * so every existing event keeps today's behaviour. Adults are always on.
   * Turning a category off hides its field everywhere, it never deletes
   * counts guests already submitted.
   */
  kidsEnabled?: boolean;
  /**
   * Casual "I'm bringing my pet" RSVP option. Turning it off removes the pets
   * counter and the pet RSVP option. It is NOT an absolute animal ban: the
   * accessibility notes field stays open so a guest can always flag a
   * service or assistance animal in free text.
   */
  petsEnabled?: boolean;
  /**
   * Optional host-set ceiling on pets per guest row, 0..MAX_PETS_PER_GUEST.
   * Undefined = the default sanity cap. Pets are deliberately excluded from the
   * people/capacity count, so this is a separate anti-garbage guard rather than
   * part of the plus-ones headcount rule.
   */
  maxPetsPerGuest?: number;
  /**
   * Potluck "what to bring" sign-up sheet. Free on every tier. The items and
   * sign-ups live in their own tables (event_bring_items / event_bring_claims);
   * only these three switches live on the event so the public sheet RPC can
   * read them without exposing anything else.
   */
  bringSheetEnabled?: boolean;
  /**
   * Host-set phonetic spellings for the spoken invitation: a venue or family
   * name the reading voice gets wrong. Applied last, so they win over every
   * pronunciation rule in src/lib/speakable.ts.
   */
  pronunciations?: { term: string; sayAs: string }[];
  /** Let guests add their own dish instead of only claiming listed items. */
  bringSheetAllowSuggestions?: boolean;
  /** Show who signed up for what. Off shows only "claimed". */
  bringSheetShowNames?: boolean;
  /**
   * Decorative invite frame id (see src/lib/event-frames.ts). Undefined or
   * "none" = today's clean hero, so existing invites are untouched.
   */
  frame?: string;
  /**
   * Host-chosen frame color as a `#rrggbb` hex. Undefined = inherit the card
   * accent color, which is how frames behaved before the color control, so
   * older events look exactly the same.
   */
  frameColor?: string;
  /**
   * Host-chosen invitation text color as a `#rrggbb` hex. Applies to the
   * invite title, date/time block and venue line. Undefined = the theme's own
   * ink, so every existing invite renders exactly as before.
   */
  textColor?: string;

  /**
   * Selected event theme id (see src/lib/event-themes.ts). A theme is a
   * curated pairing of frame + accent color; storing the id lets the picker
   * show what is selected without re-deriving it from the frame.
   */
  theme?: string;
  /**
   * Host-uploaded decorative artwork (storage URL, never a data URL). Separate
   * from `image` (the hero photo, which is also the social/OG image) and `logo`
   * (the host crest) so clearing one never disturbs the others.
   */
  themeArt?: string;
  /**
   * How `themeArt` is used on the guest-facing invitation:
   * - "background": behind the hero, under a paper scrim
   * - "frame": soft decorative bands/border around the hero
   * - "envelope-only": only skins the opening envelope animation
   * Undefined = "background".
   */
  themeArtMode?: "background" | "frame" | "envelope-only";
  /** Backdrop strength for `themeArt` in background mode, 0.15 to 1. */
  themeArtOpacity?: number;
}


/** Kids counter accepted on this event? Undefined = yes (legacy events). */
export function kidsAllowed(event: Pick<KEvent, "kidsEnabled">): boolean {
  return event.kidsEnabled !== false;
}

/** Casual pet RSVP option accepted on this event? Undefined = yes. */
export function petsAllowed(event: Pick<KEvent, "petsEnabled">): boolean {
  return event.petsEnabled !== false;
}

/**
 * Default sanity ceiling on pets recorded on ONE guest row. Pets never count
 * towards the people headcount or capacity, so they are not covered by the
 * plus-ones allowance rule. This exists purely to stop garbage/abuse entries
 * (someone typing 200). Mirrored server-side in public.public_update_guest.
 */
export const MAX_PETS_PER_GUEST = 5;

/** Effective pets-per-guest ceiling: the host's lower value, else the default. */
export function maxPetsPerGuest(event: Pick<KEvent, "maxPetsPerGuest">): number {
  const raw = Number(event.maxPetsPerGuest ?? MAX_PETS_PER_GUEST);
  if (!Number.isFinite(raw)) return MAX_PETS_PER_GUEST;
  return Math.max(0, Math.min(MAX_PETS_PER_GUEST, Math.floor(raw)));
}

/** Clamp a pets counter into 0..maxPetsPerGuest(event). */
export function clampPets(n: number, event: Pick<KEvent, "maxPetsPerGuest">): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(maxPetsPerGuest(event), Math.floor(n)));
}




export interface TipRecipient {
  id: string;
  name: string;
  role?: string;
  venmo?: string;
  cashapp?: string;
  zelle?: string;
  paypal?: string;
  applePay?: string;
  googlePay?: string;
  customLabel?: string;
  customUrl?: string;
  note?: string;
}

export interface TipJar {
  enabled: boolean;
  title?: string;
  message?: string;
  presetAmounts?: number[];
  recipients: TipRecipient[];
}

export interface GiftFund {
  enabled: boolean;
  label: string;
  description?: string;
  goal?: number;
  currency?: string;
  presetAmounts?: number[];
  contributions: GiftContribution[];
  thankYouNote?: string;
}

export interface GiftContribution {
  id: string;
  name: string;
  email?: string;
  amount: number;
  message?: string;
  sessionId?: string;
  at: string;
  thanked?: boolean;
}

export interface AffiliateClick {
  id: string;
  store: string;
  registryId?: string;
  url: string;
  at: string;
}

export type TableShape =
  | "round"
  | "rectangle"
  | "head"
  | "lounge"
  | "square"
  | "individual"
  | "row"
  | "stadium"
  | "picnic"
  | "cocktail"
  | "sweetheart";

export interface SeatMemberRef {
  guestId: string;
  /** 0-based index within the party. 0..adults-1 = adult, then kids, then pets. */
  memberIndex: number;
}

export interface SeatingTable {
  id: string;
  label: string;
  shape: TableShape;
  capacity: number;
  guestIds: string[];
  note?: string;
  /** Stadium/bleachers only: number of rows (seatsPerRow = ceil(capacity/rows)). */
  rows?: number;
  /** Row/stadium: explicit seats-per-row. Kept synced: rows*perRow = capacity. */
  perRow?: number;
  /** "table" (default) accepts guest drops; "element" is a non-seating venue element (dance floor, bar, etc). */
  kind?: "table" | "element";
  /** For kind="element": which venue element this represents. */
  elementType?: VenueElementType;
  /** When true, shuffle & auto-seat skip this table. Manual drag still works. */
  locked?: boolean;
  /** Optional zone/area label ("Ceremony", "Reception", or custom). Empty = Unzoned. */
  area?: string;
  /** Per-seat explicit assignments keyed by seat index. Overrides derived fill. */
  seatAssignments?: Record<string, SeatMemberRef>;
  /**
   * Venue map position as a percentage of the floor plan (0-100), measured to
   * the CENTER of the table/element. Undefined means "not placed yet", so the
   * map lays it out on an automatic grid until the host drags it.
   */
  x?: number;
  y?: number;
}


export type VenueElementType =
  | "dance_floor"
  | "dj_booth"
  | "buffet"
  | "bar"
  | "stage"
  | "gift_table"
  | "photo_booth"
  | "entrance";

export interface SeatingRule {
  id: string;
  type: "together" | "apart";
  guestAId: string;
  guestBId: string;
}



export interface TimelineBlock {
  id: string;
  time: string; // "18:30"
  durationMin?: number;
  title: string;
  owner?: string; // "MC", "Photographer", "Caterer"
  notes?: string;
  vendor?: string;
}

export interface CheckIn {
  guestId: string;
  at: string; // ISO
  note?: string;
  /**
   * How many PEOPLE arrived under this check-in (the named guest plus whoever
   * came with them). Omitted on older rows, which count as 1.
   */
  heads?: number;
}


// The entrance list, plan gate and occasion matching live in one place now.
// Re-exported here so every existing import keeps working.
import type { EntrancePace, InviteAnimation } from "@/lib/invite-entrances";
export type { EntrancePace, InviteAnimation };

export {
  INVITE_ANIMATIONS,
  ENTRANCE_PACES,
  entrancePhases,
  normalizePace,
  FREE_ANIMATIONS,
  entranceMeta,
  isPremiumEntrance,
  gateEntrance,
  recommendedEntrances,
  isJarringForOccasion,
} from "@/lib/invite-entrances";



import { supabase } from "@/integrations/supabase/client";
import {
  fetchEventById,
  fetchEventBySlug,
  fetchOwnedEventById,
  upsertEvent,
  deleteEventRemote,
} from "@/lib/events-sync.functions";


const BASE_KEY = "kcc.events.v1";
/**
 * The local snapshot is namespaced per signed-in user. A shared key meant that
 * signing in as a second account on the same device (support, a co-host, the
 * demo host) could read the previous account's cached events before the cloud
 * hydrate replaced them. `kcc.events.v1.owner` remembers the last account so a
 * cold load can pick the right namespace synchronously, before the session
 * resolves.
 */
const OWNER_KEY = `${BASE_KEY}.owner`;
let scopeUserId: string | null = null;

function readOwnerHint(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function scopeSuffix(): string {
  const id = scopeUserId ?? readOwnerHint();
  return id ? `.u.${id}` : "";
}

function eventsKey(): string {
  return `${BASE_KEY}${scopeSuffix()}`;
}
function importFlagKey(): string {
  return `${BASE_KEY}${scopeSuffix()}.imported`;
}
function pendingPushKey(): string {
  return `${BASE_KEY}${scopeSuffix()}.pending`;
}

/**
 * Bind local storage to this user. On the first bind we migrate the legacy
 * unscoped snapshot into the user's namespace (the hydrate ownership guard
 * still discards anything that turns out to belong to someone else) and delete
 * the shared copy so no other account can ever read it.
 */
function bindStorageScope(userId: string) {
  if (typeof window === "undefined" || scopeUserId === userId) return;
  const previous = scopeUserId ?? readOwnerHint();
  scopeUserId = userId;
  try {
    localStorage.setItem(OWNER_KEY, userId);
    if (previous !== userId) {
      // A different account previously owned this device's queue markers.
      pendingPush.clear();
      pendingPushRestoredKey = null;
      restorePendingPush();
    }
    const legacy = localStorage.getItem(BASE_KEY);
    if (legacy !== null) {
      if (localStorage.getItem(eventsKey()) === null) {
        localStorage.setItem(eventsKey(), legacy);
        const flag = localStorage.getItem(`${BASE_KEY}.imported`);
        if (flag) localStorage.setItem(importFlagKey(), flag);
        const queued = localStorage.getItem(`${BASE_KEY}.pending`);
        if (queued) localStorage.setItem(pendingPushKey(), queued);
      }
      localStorage.removeItem(BASE_KEY);
      localStorage.removeItem(`${BASE_KEY}.imported`);
      localStorage.removeItem(`${BASE_KEY}.pending`);
    }
  } catch {
    // Storage unavailable: the cloud stays the source of truth.
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function seed(): KEvent[] {
  // No client-side seed — cloud is the source of truth.
  return [];
}

let cache: KEvent[] | null = null;
const listeners = new Set<() => void>();
let hydrated = false;
let hydrating: Promise<void> | null = null;
const pendingPush = new Set<string>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight: Promise<{ failed: string[] }> | null = null;
let retryAttempt = 0;
/** Which storage key the retry queue was last read from (scope aware). */
let pendingPushRestoredKey: string | null = null;
/** Consecutive push failures per event id, so one bad row can't spam toasts. */
const failureCounts = new Map<string, number>();

/** True for transport-level failures (real "offline"), not server rejections. */
function isNetworkFailure(message: string): boolean {
  return /failed to fetch|networkerror|load failed|network request failed|err_internet|timeout/i.test(
    message,
  );
}

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}


/** Hard cap on ids kept in the retry queue so it can never grow unbounded. */
const MAX_PENDING_IDS = 200;
/**
 * Character budget for the local snapshot. Browsers give ~5MB per origin and
 * count UTF-16 code units (roughly 2 bytes each), so a 4.7MB event blob alone
 * blows the quota. We keep the local copy lightweight and treat the cloud as
 * the source of truth for anything heavy.
 */
const LOCAL_BUDGET_CHARS = 1_200_000;

function persistPendingPush() {
  if (typeof window === "undefined") return;
  try {
    const ids = Array.from(pendingPush).slice(-MAX_PENDING_IDS);
    localStorage.setItem(pendingPushKey(), JSON.stringify(ids));
  } catch {
    // The event snapshot itself remains the durable copy if storage is full.
  }
}

function restorePendingPush() {
  if (typeof window === "undefined") return;
  // Keyed by scope, not a one-shot flag: the queue used to be "restored" from
  // the unscoped key during the very first hydrate (which can start before
  // load() runs), leaving it empty. An empty queue makes the cloud copy win the
  // merge, which silently threw away an unsynced edit, e.g. a thank-you note
  // typed just before a hard reload.
  const key = pendingPushKey();
  if (pendingPushRestoredKey === key) return;
  pendingPushRestoredKey = key;
  try {
    const ids = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    if (Array.isArray(ids))
      ids
        .slice(-MAX_PENDING_IDS)
        .forEach((id) => typeof id === "string" && pendingPush.add(id));
  } catch {
    // Ignore a damaged retry marker. Event data still remains in local storage.
  }
}

function scheduleRetry() {
  if (pushTimer) clearTimeout(pushTimer);
  const delay = Math.min(60_000, 2_000 * 2 ** retryAttempt);
  retryAttempt = Math.min(retryAttempt + 1, 5);
  pushTimer = setTimeout(() => void flushPush(), delay);
}

// When the connection comes back, retry straight away instead of waiting out
// the backoff timer, so the offline pill clears as soon as the network does.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    retryAttempt = 0;
    if (pendingPush.size > 0) void flushPush({ silent: true });
  });
}


function notifyListeners() {
  listeners.forEach((l) => l());
}

/**
 * Guarantees the list fields the UI iterates without guards. A cloud row,
 * a hand-edited local cache, or an older record can arrive without `guests`
 * (or `hosts`/`registry`), and a single missing array crashed the whole
 * /events dashboard through rsvpCounts(). Every load path funnels through
 * here so the rest of the app can trust these are arrays.
 */
export function normalizeEvent<T extends Partial<KEvent>>(ev: T): T & KEvent {
  const e = (ev ?? {}) as KEvent;
  if (!Array.isArray(e.guests)) e.guests = [];
  if (e.hosts != null && !Array.isArray(e.hosts)) e.hosts = [];
  if (e.registry != null && !Array.isArray(e.registry)) e.registry = [];
  return e as T & KEvent;
}

function normalizeEvents(list: unknown): KEvent[] {
  return Array.isArray(list) ? list.filter(Boolean).map((e) => normalizeEvent(e as KEvent)) : [];
}

function readLocal(): KEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(eventsKey());
    return raw ? normalizeEvents(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}


/**

 * True when this cached copy had inline media removed to fit local storage.
 * Such a copy is display-only: it must never be pushed to the cloud, or it
 * would overwrite the server's media with blanks.
 */
export function isLocallyStripped(ev: unknown): boolean {
  return !!(ev as { _mediaStripped?: boolean } | null)?._mediaStripped;
}

/** Recursively drop inline data: URLs (photos, video, voice notes) from a copy. */
export function stripInlineMedia(value: unknown): { value: unknown; stripped: boolean } {
  if (typeof value === "string") {
    return value.startsWith("data:") && value.length > 2_000
      ? { value: "", stripped: true }
      : { value, stripped: false };
  }
  if (Array.isArray(value)) {
    let stripped = false;
    const out = value.map((v) => {
      const r = stripInlineMedia(v);
      stripped = stripped || r.stripped;
      return r.value;
    });
    return { value: out, stripped };
  }
  if (value && typeof value === "object") {
    let stripped = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const r = stripInlineMedia(v);
      stripped = stripped || r.stripped;
      out[k] = r.value;
    }
    return { value: out, stripped };
  }
  return { value, stripped: false };
}

function lightenForLocal(ev: KEvent): KEvent {
  const { value, stripped } = stripInlineMedia(ev);
  if (!stripped) return ev;
  return { ...(value as KEvent), _mediaStripped: true } as KEvent;
}

/**
 * Local sync state for a quiet, non-blocking UI indicator. The host must always
 * be able to tell "saved" from "not saved yet" without a blocking red error.
 * - idle: everything the device knows about is on the server.
 * - syncing: edits are queued and being pushed.
 * - offline: a push failed; the edits live only on this device until it works.
 */
export type EventsSyncState = "idle" | "syncing" | "offline";
let syncState: EventsSyncState = "idle";
const syncListeners = new Set<() => void>();

export function getEventsSyncState(): EventsSyncState {
  return syncState;
}

export function subscribeEventsSyncState(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

function setSyncState(next: EventsSyncState) {
  if (syncState === next) return;
  syncState = next;
  syncListeners.forEach((l) => l());
}

function isQuotaError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name ?? "";
  const code = (err as { code?: number } | null)?.code;
  // Safari uses the legacy name; Firefox reports code 1014.
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014;
}

/**
 * Persist a snapshot that always fits: full events while they're small, media
 * stripped when they aren't, then eviction of events with nothing pending, and
 * a real retry on a QuotaExceededError. The in-memory cache keeps the complete
 * data and the cloud remains the durable copy, so the host never hits a
 * dead-end error — but an unsynced edit is never traded away for cache space.
 */
function writeLocal(next: KEvent[]) {
  if (typeof window === "undefined") return;
  let lastError: unknown = null;
  const attempt = (list: KEvent[]): boolean => {
    try {
      localStorage.setItem(eventsKey(), JSON.stringify(list));
      lastError = null;
      return true;
    } catch (err) {
      lastError = err;
      return false;
    }
  };

  let list = next;
  if (JSON.stringify(list).length > LOCAL_BUDGET_CHARS) list = next.map(lightenForLocal);
  // Events with an unflushed push are protected from eviction: dropping one
  // would strand its edit (flushPushBatch skips ids missing from the cache).
  // Everything else sorts newest-first, so eviction drops the stalest event.
  const ordered = [...list].sort((a, b) => {
    const pa = pendingPush.has(a.id) ? 1 : 0;
    const pb = pendingPush.has(b.id) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
  });
  const evictable = () => {
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const ev = ordered[i];
      if (ev && !pendingPush.has(ev.id)) return i;
    }
    return -1;
  };
  while (ordered.length > 1 && JSON.stringify(ordered).length > LOCAL_BUDGET_CHARS) {
    const i = evictable();
    if (i < 0) break; // everything left is unsynced — keep it.
    ordered.splice(i, 1);
  }

  let candidate = ordered;
  for (let i = 0; i < 12; i++) {
    if (attempt(candidate)) return;
    // A failure that is not a quota problem (Safari private mode, storage
    // disabled by policy) must never trigger eviction of user data.
    if (!isQuotaError(lastError)) break;
    let drop = -1;
    for (let index = candidate.length - 1; index >= 0; index -= 1) {
      const ev = candidate[index];
      if (ev && !pendingPush.has(ev.id)) {
        drop = index;
        break;
      }
    }
    if (candidate.length > 1 && drop >= 0) {
      candidate = candidate.filter((_, index) => index !== drop);
      continue;
    }
    // Only unsynced events left: shrink them instead of dropping them.
    const heavy = candidate.findIndex((ev) => !isLocallyStripped(ev));
    if (heavy >= 0) {
      candidate = candidate.map((ev, index) => (index === heavy ? lightenForLocal(ev) : ev));
      continue;
    }
    break;
  }

  if (isQuotaError(lastError)) {
    // Nothing fits — clear the stale snapshot so the next load hydrates from the
    // cloud instead of failing forever, and get the queued edits to the server
    // now, since this device can no longer hold them.
    try {
      localStorage.removeItem(eventsKey());
    } catch {
      /* ignore */
    }
    console.warn("[events] local snapshot skipped (storage quota); cloud remains source of truth");
  } else {
    console.warn("[events] local snapshot unavailable; cloud remains source of truth", lastError);
  }
  if (pendingPush.size > 0) {
    setSyncState("syncing");
    void flushPush({ silent: true });
  }
}



async function isSignedIn(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

// Events shared with me as a co-host/viewer, keyed by event id. Kept outside
// the event blob so a collaborator's role can never be spoofed by editing the
// cached JSON on their own device — it is refreshed from the server on hydrate.
const sharedRoles = new Map<string, "cohost" | "viewer">();

/** Role the signed-in user has on an event they don't own, if any. */
export function sharedEventRole(id: string | undefined): "cohost" | "viewer" | undefined {
  return id ? sharedRoles.get(id) : undefined;
}

/** True when the signed-in user can only read this event (viewer collaborator). */
export function isViewOnlyEvent(id: string | undefined): boolean {
  return sharedEventRole(id) === "viewer";
}

async function listMyEventsFromCloud(): Promise<KEvent[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return [];
  const mine = supabase
    .from("events")
    .select("user_id,data,share_token,is_demo")
    .eq("user_id", sessionData.session.user.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  // Collaborations: membership rows first (RLS scopes them to me), then the
  // events themselves, which the "Collaborators read their events" policy
  // allows. Two round trips, but it keeps owners/admins from pulling every
  // event in the system into their own dashboard.
  const shared = (async (): Promise<KEvent[]> => {
    try {
      const { data: rows } = await supabase
        .from("event_members")
        .select("event_id,role")
        .eq("user_id", sessionData.session!.user.id)
        .eq("status", "active");
      sharedRoles.clear();
      const ids = (rows ?? []).map((r) => {
        sharedRoles.set(r.event_id as string, (r.role as "cohost" | "viewer") ?? "viewer");
        return r.event_id as string;
      });
      if (!ids.length) return [];
      const { data } = await supabase
        .from("events")
        .select("user_id,data,share_token,is_demo")
        .in("id", ids)
        .is("archived_at", null);
      return (data ?? []).map((r) => ({
        ...normalizeEvent(r.data as unknown as KEvent),
        shareToken: r.share_token ?? undefined,
        _ownerUserId: r.user_id as string,
        _isDemo: Boolean((r as { is_demo?: boolean }).is_demo),
      }));
    } catch {
      return [];
    }
  })();

  const [{ data, error }, sharedEvents] = await Promise.all([mine, shared]);
  if (error) {
    console.warn("[events] list failed", error);
    return sharedEvents;
  }
  return [
    ...(data ?? []).map((r) => ({
      ...normalizeEvent(r.data as unknown as KEvent),
      shareToken: r.share_token ?? undefined,
      _ownerUserId: r.user_id as string,
      _isDemo: Boolean((r as { is_demo?: boolean }).is_demo),
    })),
    ...sharedEvents,
  ];
}

function eventDataForCloud(event: KEvent): Record<string, unknown> {
  const {
    _ownerUserId: _localOwner,
    _isDemo: _localDemo,
    _mediaStripped: _localMedia,
    shareToken: _serverManagedToken,
    ...data
  } = event as KEvent & {
    _mediaStripped?: boolean;
  };
  return data as unknown as Record<string, unknown>;
}

async function ownerIdsForEvents(ids: string[]): Promise<Map<string, string>> {
  const owners = new Map<string, string>();
  if (ids.length === 0) return owners;
  const { data, error } = await supabase.from("events").select("id,user_id").in("id", ids);
  if (error) return owners;
  for (const row of data ?? []) owners.set(row.id as string, row.user_id as string);
  return owners;
}

async function maySyncEvent(event: KEvent, userId: string): Promise<boolean> {
  // The cached row records who owned it when we last saw it server-side. Trust
  // that first: the `events` SELECT policy hides other hosts' rows from a
  // non-privileged session, so an owner lookup that returns nothing must never
  // be read as "this is my new local event".
  const localOwner = (event as KEvent & { _ownerUserId?: string })._ownerUserId;
  const foreignLocalOwner = !!localOwner && localOwner !== userId;
  if (!foreignLocalOwner) {
    const owners = await ownerIdsForEvents([event.id]);
    const ownerId = owners.get(event.id);
    // No cloud row means this is a genuinely new local event.
    if (!ownerId || ownerId === userId) return true;
  }

  // Owned by someone else: only an active co-host may save. A cached "cohost"
  // role is enough when the membership lookup can't be reached (offline), but a
  // definitive "not a co-host" answer still blocks the write.

  const { data } = await supabase
    .from("event_members")
    .select("role")
    .eq("event_id", event.id)
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("role", "cohost")
    .maybeSingle();
  if (data) return true;
  return sharedEventRole(event.id) === "cohost";
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void flushPush();
  }, 400);
}

async function flushPush(opts?: { silent?: boolean }): Promise<{ failed: string[] }> {
  if (pushInFlight) return pushInFlight;
  pushInFlight = flushPushBatch(opts).finally(() => {
    pushInFlight = null;
  });
  return pushInFlight;
}

/**
 * Restore ONLY the values local stripping blanked out (inline `data:` URLs over
 * 2,000 chars — exactly what `stripInlineMedia` removes) from the cloud copy.
 *
 * Deliberately narrow: any other empty local value is treated as an
 * intentional deletion and left empty, so clearing a photo, note or
 * description is never silently reverted to the server value.
 *
 * Arrays are matched by `id` when both sides carry ids, so reordering hosts or
 * guests locally can never refill one person's media onto another.
 */
function isStrippedMediaValue(remote: unknown): boolean {
  return typeof remote === "string" && remote.startsWith("data:") && remote.length > 2_000;
}

function entityId(value: unknown): string | undefined {
  const id = (value as { id?: unknown } | null)?.id;
  return typeof id === "string" && id ? id : undefined;
}

export function refillFromRemote(local: unknown, remote: unknown): unknown {
  if (local === "" || local === undefined || local === null) {
    // Only inline media that stripping removed comes back. Everything else
    // stays as the user left it (deletions must survive).
    return isStrippedMediaValue(remote) ? remote : local;
  }
  if (Array.isArray(local)) {
    const r = Array.isArray(remote) ? remote : [];
    const byId = new Map<string, unknown>();
    for (const item of r) {
      const id = entityId(item);
      if (id !== undefined && !byId.has(id)) byId.set(id, item);
    }
    return local.map((v, i) => {
      const id = entityId(v);
      // Positional fallback only when this item has no id to match on.
      const match = id !== undefined ? byId.get(id) : r[i];
      return refillFromRemote(v, match);
    });
  }
  if (typeof local === "object") {
    const r = (remote && typeof remote === "object" ? remote : {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(local as Record<string, unknown>)) {
      out[k] = refillFromRemote(v, r[k]);
    }
    return out;
  }
  return local;
}


/**
 * Rebuild a full event from a stripped local copy plus the cloud original, so
 * an edit made before hydration finished can still be saved without wiping
 * media. Returns null when the cloud copy can't be read (caller re-queues).
 */
async function restoreStrippedFromCloud(local: KEvent): Promise<KEvent | null> {
  try {
    // MUST be the owner-authenticated read: the public payload is sanitized, so
    // refilling from it would erase guest contact details on the next save.
    const remote = (await fetchOwnedEventById({ data: { id: local.id } })) as unknown as KEvent | null;

    if (!remote) return null;
    const merged = refillFromRemote(local, remote) as KEvent;
    delete (merged as { _mediaStripped?: boolean })._mediaStripped;
    return merged;
  } catch (err) {
    console.warn("[events] could not refill stripped event from cloud", local.id, err);
    return null;
  }
}


async function flushPushBatch(opts?: { silent?: boolean }): Promise<{ failed: string[] }> {
  if (pendingPush.size === 0) {
    setSyncState("idle");
    return { failed: [] };
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return { failed: [] };
  setSyncState("syncing");
  const ids = Array.from(pendingPush);
  pendingPush.clear();
  persistPendingPush();
  const failed: string[] = [];
  let networkFailure = false;

  for (const id of ids) {
    let ev = (cache ?? []).find((e) => e.id === id);
    if (!ev) {
      // The event is queued but no longer cached (evicted or signed-out cache
      // reset). Never drop it silently: re-queue and surface an unsynced state.
      console.warn("[events] queued event missing from cache, re-queued", id);
      failed.push(id);
      pendingPush.add(id);
      persistPendingPush();
      continue;
    }

    // A media-stripped copy is display-only: pushing it as-is would blank out
    // photos/video already in the cloud. Refill the stripped fields from the
    // server copy first, so the host's edit still saves and media survives.
    if (isLocallyStripped(ev)) {
      const restored = await restoreStrippedFromCloud(ev);
      if (!restored) {
        pendingPush.add(id);
        persistPendingPush();
        scheduleRetry();
        continue;
      }
      ev = restored;
      cache = (cache ?? []).map((item) => (item.id === id ? restored : item));
      notifyListeners();
    }
    const current: KEvent = ev;
    try {

      // A privileged user may legitimately view another host's event. That
      // must never turn the personal autosave queue into an admin write path.
      // Drop a stale foreign queue item before upsert, while still allowing an
      // explicit co-host to save and a brand-new offline event to be created.
      if (!(await maySyncEvent(current, userId))) {
        console.warn("[events] discarded queued write for event not owned or co-hosted by current user", id);
        cache = (cache ?? []).filter((item) => item.id !== id);
        writeLocal(cache);
        notifyListeners();
        continue;
      }

      const uploadSafeEvent = await externalizeInlineEventMedia(current);
      if (uploadSafeEvent !== current) {

        cache = (cache ?? []).map((item) => (item.id === id ? uploadSafeEvent : item));
        writeLocal(cache ?? []);
        notifyListeners();
      }

      const saved = await upsertEvent({
        data: {
          id: uploadSafeEvent.id,
          data: eventDataForCloud(uploadSafeEvent),
          brandedSlug: uploadSafeEvent.brandedSlug ?? null,
        },
      });
      // A connection that drops mid-request can resolve with no body at all
      // (seen when the network was cut during a save): treat it as a failure
      // to retry, not a success.
      if (!saved) throw new Error("Failed to fetch: empty save response");
      if (saved.shareToken && uploadSafeEvent.shareToken !== saved.shareToken) {
        cache = (cache ?? []).map((item) => item.id === id ? { ...item, shareToken: saved.shareToken ?? undefined } : item);
        writeLocal(cache ?? []);
        notifyListeners();
      }
      // Copy protection: the server dropped media that belongs to another
      // account, another event or the showcase, and saved everything else.
      // Drop the same links locally so the next autosave can't paste them
      // back, and tell the host plainly what happened.
      const refusedMedia = (saved as { refusedMedia?: { value: string; reason: string }[] }).refusedMedia ?? [];
      if (refusedMedia.length) {
        const { stripRefusedMedia } = await import("@/lib/event-media-strip");
        const refusedValues = refusedMedia.map((r) => r.value);
        cache = (cache ?? []).map((item) => (item.id === id ? stripRefusedMedia(item, refusedValues) : item));
        writeLocal(cache ?? []);
        notifyListeners();
        const reasons = Array.from(new Set(refusedMedia.map((r) => r.reason)));
        toast.error(reasons[0] ?? "That media can't be used on this event.", {
          id: `events-store-media-${id}`,
          description: `${reasons.length > 1 ? reasons.slice(1).join(" ") + " " : ""}Everything else was saved.`,
          duration: 12000,
        });
      }
    } catch (err) {
      const msg = String((err as any)?.message ?? "");
      // Permanent rejection: the row belongs to another host. Retrying can never
      // succeed, so drop the queue entry and the cached copy instead of looping
      // (a stuck entry here is what surfaced as a hard error page).
      if (/own or co-host/i.test(msg)) {
        console.warn("[events] dropped queued write for a foreign event", id);
        pendingPush.delete(id);
        persistPendingPush();
        cache = (cache ?? []).filter((item) => item.id !== id);
        writeLocal(cache);
        notifyListeners();
        continue;
      }

      // A custom link that another event already owns can NEVER succeed on
      // retry, so the old behaviour pinned the queue in "Syncing" forever and
      // silently blocked every other edit on the event (capacity, guests…).
      // Save the rest of the change without the conflicting link, clear it
      // locally so the retry can't reintroduce it, and tell the host that the
      // only thing they still need to redo is choosing a new link.
      if (/\/e\/[^\s]+ (?:is already taken|was just claimed)/i.test(msg) && current.brandedSlug) {
        try {
          const withoutSlug = { ...current, brandedSlug: undefined } as KEvent;
          await upsertEvent({
            data: {
              id: withoutSlug.id,
              data: eventDataForCloud(withoutSlug),
              brandedSlug: null,
            },
          });
          cache = (cache ?? []).map((item) => (item.id === id ? withoutSlug : item));
          writeLocal(cache ?? []);
          notifyListeners();
          pendingPush.delete(id);
          persistPendingPush();
          failureCounts.delete(id);
          toast.error("That custom link is already taken by another event.", {
            id: `events-store-slug-${id}`,
            description:
              "Everything else was saved. Pick a different link in Share settings.",
            duration: 12000,
          });
          continue;
        } catch (retryErr) {
          console.warn("[events] slug-free retry failed", id, retryErr);
        }
      }

      // An add-on refusal can never succeed on retry: the same event would be
      // sent again and refused again, and every later edit would sit behind
      // it. Thank-you cards: save everything else with the cloud's cards and
      // say so. A guest jump the account is not entitled to: keep the edits on
      // this device, say so once, and stop retrying until the host acts.
      if (/thank-you card studio/i.test(msg)) {
        try {
          const remote = (await fetchOwnedEventById({ data: { id } })) as unknown as KEvent | null;
          const restored = {
            ...current,
            thankYouCards: remote?.thankYouCards,
            thankYouDraft: remote?.thankYouDraft,
          } as KEvent;
          await upsertEvent({
            data: { id, data: eventDataForCloud(restored), brandedSlug: restored.brandedSlug ?? null },
          });
          cache = (cache ?? []).map((item) => (item.id === id ? restored : item));
          writeLocal(cache ?? []);
          notifyListeners();
          pendingPush.delete(id);
          persistPendingPush();
          failureCounts.delete(id);
          toast.error("Thank-you card changes weren't saved.", {
            id: `events-store-thankyou-${id}`,
            description:
              "The thank-you card studio isn't unlocked on this account. Everything else was saved.",
            duration: 12000,
          });
          continue;
        } catch (retryErr) {
          console.warn("[events] thank-you-free retry failed", id, retryErr);
        }
      }
      if (/bulk guest import add-on/i.test(msg)) {
        pendingPush.delete(id);
        persistPendingPush();
        failureCounts.delete(id);
        toast.error("This guest list couldn't be saved.", {
          id: `events-store-import-${id}`,
          description: `${msg} Your edits stay on this device. Unlock guest import from Add-ons, or add guests in smaller groups, and save again.`,
          duration: 15000,
        });
        continue;
      }

      console.warn("[events] upsert failed", id, err);
      failed.push(id);
      if (isNetworkFailure(msg)) networkFailure = true;
      // Keep the change queued so a later autosave or an explicit Save can retry it.
      pendingPush.add(id);
      persistPendingPush();
      // Plan-cap rejections are actionable and self-explanatory — always show
      // the server's own wording (it names the window and the next open slot)
      // instead of the generic "couldn't sync" copy.
      if (/rolling 12 months|supports up to|Upgrade to/i.test(msg)) {

        toast.error(msg, { id: `events-store-cap-${id}`, duration: 12000 });
        continue;
      }
      if (opts?.silent) continue;
      // A save that never reaches the cloud is invisible on this device (it
      // still looks "saved" locally) and can be silently lost on another —
      // tell the host instead of just logging it. Name the event and the real
      // reason: pushing the whole queue means the event that failed is often
      // NOT the one the host is editing right now.
      const failCount = (failureCounts.get(id) ?? 0) + 1;
      failureCounts.set(id, failCount);
      const title = String((current as { title?: string }).title ?? "").trim();
      if (failCount <= 3) {
        toast.error(
          title ? `Couldn't save "${title}" to the cloud.` : "Couldn't sync your changes to the cloud.",
          {
            id: `events-store-sync-${id}`,
            description: isNetworkFailure(msg)
              ? "Looks like a connection drop. This device keeps your edits and retries automatically."
              : `${msg || "The server rejected the save."} Your edits stay on this device and retry automatically.`,
          },
        );
      }
    }

  }
  if (failed.length > 0) {
    // Only claim "working offline" when the browser really lost the network.
    // A single rejected row used to pin the offline banner on screen even
    // though everything else was saving fine.
    setSyncState(networkFailure || isBrowserOffline() ? "offline" : "syncing");
    scheduleRetry();
  } else {
    retryAttempt = 0;
    failureCounts.clear();
    setSyncState(pendingPush.size > 0 ? "syncing" : "idle");
  }

  persistPendingPush();
  return { failed };

}

/**
 * Explicit "Save now" trigger for the UI. Same path as autosave — it just
 * cancels the debounce, forces the given event into the queue, and reports
 * success/failure so the button can show a real Saved / retry state.
 */
export async function saveEventsNow(eventId?: string): Promise<boolean> {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  if (eventId && (cache ?? []).some((e) => e.id === eventId)) pendingPush.add(eventId);
  const { failed } = await flushPush({ silent: true });
  return failed.length === 0;
}


async function hydrate(force = false) {
  // If already hydrated and not a forced refresh, skip.
  if (hydrated && !force) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    // Unsynced edits must be known BEFORE the merge below, otherwise the cloud
    // copy overwrites them.
    restorePendingPush();
    const localSnapshot = readLocal();
    if (cache === null) {
      cache = localSnapshot;
      notifyListeners();
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      hydrated = true;
      notifyListeners();
      return;
    }
    // Namespace this device's cache to the signed-in account before any read or
    // write below touches local storage.
    const scopeChanged = scopeUserId !== userId;
    bindStorageScope(userId);
    restorePendingPush();
    const local = scopeChanged ? readLocal() : localSnapshot;
    if (scopeChanged) {
      cache = local;
    }

    try {
      const remote = await listMyEventsFromCloud();
      const byId = new Map<string, KEvent>();
      // Remote wins on conflict; localStorage fills in anything not yet uploaded.
      for (const e of remote) byId.set(e.id, e);
      const alreadyImported = typeof window !== "undefined" && localStorage.getItem(importFlagKey()) === "1";
      const toImport: KEvent[] = [];
      const localOnlyPendingIds = local
        .filter((event) => !byId.has(event.id) && pendingPush.has(event.id))
        .map((event) => event.id);
      const localOnlyOwners = await ownerIdsForEvents(localOnlyPendingIds);
      for (const e of local) {
        const knownOwnerId = e._ownerUserId ?? localOnlyOwners.get(e.id);
        // A co-host legitimately edits someone else's event, so a foreign owner
        // id alone must not purge their unsynced edit from the queue.
        const isForeignPending =
          pendingPush.has(e.id) &&
          !!knownOwnerId &&
          knownOwnerId !== userId &&
          sharedEventRole(e.id) !== "cohost";
        if (isForeignPending) {
          pendingPush.delete(e.id);
          persistPendingPush();
          console.warn("[events] removed foreign event from pending queue", e.id);
          continue;
        }
        // A media-stripped cache copy is incomplete, so it must never stand in
        // for the server's data. If it carries an unsynced edit, keep the edit
        // and refill the stripped media from the cloud copy instead.
        if (isLocallyStripped(e)) {
          const cloud = byId.get(e.id);
          if (!cloud) {
            byId.set(e.id, e);
          } else if (pendingPush.has(e.id)) {
            const restored = refillFromRemote(e, cloud) as KEvent;
            delete (restored as { _mediaStripped?: boolean })._mediaStripped;
            byId.set(e.id, restored);
          }
          continue;
        }
        if (!byId.has(e.id)) {
          // The cloud list is authoritative for "which events are mine": it is
          // scoped to owned + collaborated rows and excludes archived ones. A
          // cached event the server didn't return is therefore either archived,
          // deleted, or someone else's row that an owner/admin once opened (RLS
          // lets them read it) — none of which belong in the personal list.
          // Keep it only when it carries an unflushed edit, or when the legacy
          // one-time upload of pre-cloud localStorage events hasn't run yet.
          if (pendingPush.has(e.id)) {
            byId.set(e.id, { ...e, _ownerUserId: knownOwnerId ?? userId });
          } else if (!alreadyImported) {
            byId.set(e.id, e);
            toImport.push(e);
          }
        } else if (pendingPush.has(e.id)) {
          byId.set(e.id, e);
        }

      }


      const merged = Array.from(byId.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      cache = merged;
      writeLocal(merged);
      notifyListeners();

      // One-time upload of localStorage-only events
      for (const ev of toImport) {
        try {
          await upsertEvent({
            data: {
              id: ev.id,
              data: eventDataForCloud(ev),
              brandedSlug: ev.brandedSlug ?? null,
            },
          });
        } catch (err) {
          console.warn("[events] import failed", ev.id, err);
        }
      }
      if (typeof window !== "undefined") localStorage.setItem(importFlagKey(), "1");

      // Edits queued in a previous session (offline, quota error, closed tab)
      // only ever retried on an online/visibility event. Retry them on load.
      if (pendingPush.size > 0) void flushPush({ silent: true });

    } catch (err) {
      console.warn("[events] hydrate failed, using local cache", err);
    } finally {
      hydrated = true;
      hydrating = null;
      notifyListeners();
    }
  })();
  return hydrating;
}


function load(): KEvent[] {
  restorePendingPush();
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = [];
    return cache;
  }
  cache = readLocal();
  void hydrate();
  return cache;
}

function save(next: KEvent[]) {
  const prev = cache ?? [];
  cache = next;
  // Diff and queue BEFORE persisting, so eviction inside writeLocal already
  // knows which events have an unflushed change and must be kept.
  const prevById = new Map(prev.map((e) => [e.id, e]));
  const nextById = new Map(next.map((e) => [e.id, e]));
  for (const [id, ev] of nextById) {
    const before = prevById.get(id);
    if (!before || JSON.stringify(before) !== JSON.stringify(ev)) {
      pendingPush.add(id);
      persistPendingPush();
    }
  }
  if (pendingPush.size > 0) setSyncState("syncing");
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) {
      pendingPush.delete(id);
      persistPendingPush();
      void deleteEventRemote({ data: { id } }).catch((err) =>
        console.warn("[events] delete failed", id, err),
      );
    }
  }
  writeLocal(next);
  schedulePush();
  listeners.forEach((l) => l());
}


// Re-fetch fresh data on real auth transitions (sign-in / sign-out), but
// NEVER flip `hydrated` back to false — that's what causes the "Loading
// event…" flash on token refreshes / tab refocus. Once we've hydrated
// once, the UI keeps rendering the cached data while the new fetch runs
// in the background (stale-while-revalidate).
if (typeof window !== "undefined") {
  let lastUserId: string | null = null;
  supabase.auth.getSession().then(({ data }) => {
    lastUserId = data.session?.user?.id ?? null;
  });
  supabase.auth.onAuthStateChange((event, session) => {
    const uid = session?.user?.id ?? null;
    if (event === "SIGNED_OUT") {
      lastUserId = null;
      notifyListeners();
      // Re-run hydration silently (will pick up unauthenticated empty state)
      hydrating = null;
      void hydrate(true);
      return;
    }
    if (event === "SIGNED_IN" && uid && uid !== lastUserId) {
      lastUserId = uid;
      // Trigger a background refresh without resetting `hydrated`
      hydrating = null;
      void hydrate(true);
    }
  });
  window.addEventListener("online", () => {
    if (pendingPush.size > 0) void flushPush();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && pendingPush.size > 0) void flushPush();
  });
}

// Allow other modules (e.g. auth flow) to re-hydrate after sign in
export function refreshEventsFromCloud() {
  // Don't flip `hydrated` — keep the UI stable while we refetch.
  hydrating = null;
  void hydrate(true);
}

export function rememberEventSnapshot(event: KEvent) {
  const list = load();
  const exists = list.some((e) => e.id === event.id);
  const next = exists
    ? list.map((e) => (e.id === event.id ? (pendingPush.has(event.id) ? e : event) : e))
    : [event, ...list];
  cache = next;
  writeLocal(next);
  notifyListeners();
}


// Fetch a single event from the cloud by id (used by public invite/gift pages).
// The payload comes back sanitized: no guest contact details, no host-only
// data. `guestId` is the one guest whose own record is returned complete, so a
// personal invitation link can pre-fill their RSVP form.
export async function fetchPublicEvent(
  id: string,
  guestId?: string | null,
  shareToken?: string | null,
): Promise<KEvent | undefined> {
  try {
    const remote = (await fetchEventById({
      data: { id, ...(guestId ? { g: guestId } : {}), ...(shareToken ? { t: shareToken } : {}) },
    })) as unknown as KEvent | null;
    return remote ? normalizeEvent(remote) : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchPublicEventBySlug(
  slug: string,
  guestId?: string | null,
  shareToken?: string | null,
): Promise<KEvent | undefined> {
  try {
    const remote = (await fetchEventBySlug({
      data: { slug, ...(guestId ? { g: guestId } : {}), ...(shareToken ? { t: shareToken } : {}) },
    })) as unknown as KEvent | null;
    return remote ? normalizeEvent(remote) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Host-side single-event read for screens the owner uses (dashboard,
 * run-of-show, QR cards, check-in). Tries the authenticated full-blob read
 * first, then falls back to the sanitized public payload for visitors who are
 * not signed in or do not own the event. Door staff arrive with a `?t=` share
 * token instead of a session, so it is passed through: the sanitizer returns
 * the event's share token only when the presented one matches.
 */
export async function fetchViewerEvent(
  id: string,
  shareToken?: string | null,
): Promise<KEvent | undefined> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const owned = (await fetchOwnedEventById({ data: { id } })) as unknown as KEvent | null;
      if (owned) return normalizeEvent(owned);
    }
  } catch {
    /* fall through to the public payload */
  }
  return fetchPublicEvent(id, null, shareToken ?? null);
}




const EMPTY_EVENTS: KEvent[] = [];
const subscribeEvents = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const getEventsSnapshot = () => load();
const getEventsServerSnapshot = () => EMPTY_EVENTS;

export function useEvents(): KEvent[] {
  useEffect(() => {
    void hydrate();
  }, []);
  return useSyncExternalStore(subscribeEvents, getEventsSnapshot, getEventsServerSnapshot);
}

export function useEventsReady(): boolean {
  useEffect(() => {
    void hydrate();
  }, []);
  // Sticky: once we have cached data OR finished hydration once, never flip
  // back to "not ready". This prevents event-opening flicker on token
  // refreshes, tab refocus, and silent SIGNED_IN auth events.
  return useSyncExternalStore(
    subscribeEvents,
    () => hydrated || (cache !== null && cache.length >= 0),
    () => false,
  );
}


export function useEvent(id: string | undefined): KEvent | undefined {
  const events = useEvents();
  return events.find((e) => e.id === id);
}

export function useEventBySlug(slug: string | undefined): KEvent | undefined {
  const events = useEvents();
  if (!slug) return undefined;
  const s = slug.toLowerCase();
  return events.find((e) => (e.brandedSlug || "").toLowerCase() === s);
}

export function isSlugAvailable(slug: string, exceptEventId?: string): boolean {
  const s = slug.toLowerCase();
  return !load().some((e) => (e.brandedSlug || "").toLowerCase() === s && e.id !== exceptEventId);
}

export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function createEvent(input: Omit<KEvent, "id" | "createdAt" | "guests"> & { guests?: Guest[] }): KEvent {
  const event: KEvent = {
    ...input,
    id: uid(),
    createdAt: new Date().toISOString(),
    guests: input.guests ?? [],
  };
  save([event, ...load()]);
  return event;
}

export function updateEvent(id: string, patch: Partial<KEvent>) {
  save(load().map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

export function deleteEvent(id: string) {
  save(load().filter((e) => e.id !== id));
}

/**
 * Duplicate an event: copy every field except id/createdAt/guests/RSVP-derived
 * state. Title is prefixed with "Copy of ", date is nudged 7 days forward so
 * the new draft doesn't collide with the original, and guests are reset.
 */
export function duplicateEvent(id: string): KEvent | null {
  const source = load().find((e) => e.id === id);
  if (!source) return null;
  if (source._isDemo || source.id === "showcase-wedding") return null;
  // Shift date forward one week if it parses, otherwise keep as-is.
  let newDate = source.date;
  try {
    const d = new Date(source.date);
    if (!Number.isNaN(+d)) {
      d.setDate(d.getDate() + 7);
      // Preserve YYYY-MM-DDTHH:MM naive-local shape when source uses it.
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(source.date)) {
        const pad = (n: number) => String(n).padStart(2, "0");
        newDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      } else {
        newDate = d.toISOString();
      }
    }
  } catch { /* keep original */ }
  const { id: _id, createdAt: _c, guests: _g, shareToken: _token, _ownerUserId: _owner, ...rest } = source as any;
  const copy = createEvent({
    ...rest,
    title: `Copy of ${source.title}`,
    date: newDate,
    guests: [],
  });
  return copy;
}

export function addGuest(eventId: string, name: string, email: string, phone: string, address?: string) {
  const guest: Guest = { id: uid(), name, email, phone, address, status: "pending" as RsvpStatus };
  save(
    load().map((e) =>
      e.id === eventId
        ? { ...e, guests: [...e.guests, guest] }
        : e,
    ),
  );
  return guest;
}

export function removeGuest(eventId: string, guestId: string) {
  save(
    load().map((e) =>
      e.id === eventId ? { ...e, guests: e.guests.filter((g) => g.id !== guestId) } : e,
    ),
  );
}

/**
 * Puts a previously removed guest back, at their original position where
 * possible. Used by the "Undo" toast after a host removes someone by mistake.
 */
export function restoreGuest(eventId: string, guest: Guest, index?: number) {
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      if (e.guests.some((g) => g.id === guest.id)) return e;
      const guests = [...e.guests];
      const at = index === undefined ? guests.length : Math.max(0, Math.min(index, guests.length));
      guests.splice(at, 0, guest);
      return { ...e, guests };
    }),
  );
}

export function setRsvp(eventId: string, guestId: string, status: RsvpStatus) {
  save(
    load().map((e) =>
      e.id === eventId
        ? { ...e, guests: e.guests.map((g) => (g.id === guestId ? { ...g, status } : g)) }
        : e,
    ),
  );
}

export function updateGuest(eventId: string, guestId: string, patch: Partial<Guest>) {
  save(
    load().map((e) =>
      e.id === eventId
        ? { ...e, guests: e.guests.map((g) => (g.id === guestId ? { ...g, ...patch } : g)) }
        : e,
    ),
  );
}

/**
 * Persist the host's manual waitlist order. `orderedIds` is the full waitlist
 * in the order the host wants it; positions are rewritten 0..n-1 so there are
 * never gaps or ties for the worker to guess at.
 */
export function reorderWaitlist(eventId: string, orderedIds: string[]) {
  const rank = new Map(orderedIds.map((id, i) => [id, i]));
  save(
    load().map((e) =>
      e.id === eventId
        ? {
            ...e,
            guests: e.guests.map((g) =>
              rank.has(g.id) ? { ...g, waitlistPosition: rank.get(g.id) } : g,
            ),
          }
        : e,
    ),
  );
}

/**
 * Promote one waitlisted party to confirmed and write an audit line so the host
 * can see what happened, including when it happened unattended. Whole party
 * only — this never splits a family.
 *
 * Notification is the caller's job (see promoteWaitlistGuestFn) so this stays
 * safe to call from tests without sending anything.
 */
export function promoteFromWaitlist(
  eventId: string,
  guestId: string,
  by: "auto" | "host" = "host",
  note?: string,
) {
  const at = new Date().toISOString();
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      const guest = e.guests.find((g) => g.id === guestId);
      if (!guest) return e;
      const heads = partyHeadcount(guest);
      return {
        ...e,
        guests: e.guests.map((g) =>
          g.id === guestId
            ? { ...g, status: "yes" as RsvpStatus, waitlistPromotedAt: at, waitlistPosition: undefined }
            : g,
        ),
        waitlistLog: [
          ...(e.waitlistLog ?? []),
          { at, guestId, guestName: guest.name || "Guest", heads, by, ...(note ? { note } : {}) },
        ].slice(-200),
      };
    }),
  );
}

/** Send a promoted party back to the waitlist (host undo of an over-eager promote). */
export function returnToWaitlist(eventId: string, guestId: string) {
  save(
    load().map((e) =>
      e.id === eventId
        ? {
            ...e,
            guests: e.guests.map((g) =>
              g.id === guestId
                ? { ...g, status: "waitlisted" as RsvpStatus, waitlistPromotedAt: undefined }
                : g,
            ),
          }
        : e,
    ),
  );
}


export function rsvpCounts(event: KEvent) {
  const c = { yes: 0, no: 0, maybe: 0, pending: 0, waitlisted: 0 };
  let adults = 0;
  let children = 0;
  let pets = 0;
  const guests = Array.isArray(event?.guests) ? event.guests : [];
  guests.forEach((g) => {
    if (g?.status && c[g.status] !== undefined) c[g.status]++;
    if (g.status === "yes" || g.status === "maybe") {
      const namedPlus = Array.isArray(g.plusOnes) ? g.plusOnes.length : 0;
      adults += g.adults ?? (g.category === "pet" ? 0 : g.category === "kid" ? 0 : (g.status === "yes" ? 1 : 0));
      adults += namedPlus;
      children += g.children ?? (g.category === "kid" ? 1 : 0);
      pets += g.pets ?? (g.category === "pet" ? 1 : 0);
    }
  });
  return { ...c, total: guests.length, adults, children, pets, attendees: adults + children + pets };
}

/**
 * Hard ceiling on plus-ones a host may allow per guest. Mirrored server-side in
 * public_update_guest, which clamps anything larger.
 */
export const MAX_PLUS_ONES = 20;

/**
 * Hard ceiling on adults / kids / pets recorded on a SINGLE guest row. Mirrored
 * server-side in public_update_guest, which clamps anything larger. Bigger
 * parties are meant to be split into separate guest rows.
 */
export const MAX_PARTY_COUNT = 20;

/** Clamp a party counter (adults, kids, pets) into 0..MAX_PARTY_COUNT. */
export function clampPartyCount(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_PARTY_COUNT, Math.floor(n)));
}

/**
 * The most people ONE guest row may represent, derived from the host's
 * plus-ones allowance: the guest themselves plus their allowance. With
 * "1 plus-one per guest" that is 2 heads total, whether those extra heads are
 * entered as named plus-ones or silently bumped on the Adults / Kids counters.
 *
 * Adults / Kids used to be a separate escape valve from plus-ones, so a guest
 * with an allowance of 1 could claim 3 adults and bring two unnamed extras.
 * Mirrored server-side in public.public_update_guest, which rejects anything
 * larger on the guest RSVP path.
 */
export function maxPartyHeads(event: Pick<KEvent, "plusOnesAllowed">): number {
  const allowed = Math.max(0, Math.min(MAX_PLUS_ONES, Number(event.plusOnesAllowed ?? 0)));
  return Math.min(MAX_PARTY_COUNT, 1 + allowed);
}

/** Heads represented by an in-progress party edit (adults + kids + named plus-ones). */
export function partyHeadsFrom(adults: number, children: number, namedPlusOnes: number): number {
  return Math.max(0, adults || 0) + Math.max(0, children || 0) + Math.max(0, namedPlusOnes || 0);
}

/**
 * Headcount for ONE guest's party: the guest, their kids, and their named
 * plus-ones. Single source of truth — the RSVP form, the host dashboard and
 * the SQL capacity check (public.event_confirmed_headcount) all use this same
 * shape, so the numbers cannot drift apart.
 */
export function partyHeadcount(guest: Guest): number {
  const namedPlus = Array.isArray(guest.plusOnes) ? guest.plusOnes.length : 0;
  return (guest.adults ?? 1) + (guest.children ?? 0) + namedPlus;
}

/** Confirmed attendee headcount (adults+kids+plus-ones, "yes" only) for capacity checks. */
export function confirmedHeadcount(event: KEvent, excludeGuestId?: string): number {
  let n = 0;
  for (const g of event.guests) {
    if (g.status !== "yes") continue;
    if (excludeGuestId && g.id === excludeGuestId) continue;
    n += partyHeadcount(g);
  }
  return n;
}

/**
 * Committed headcount: everyone who has NOT explicitly declined — invited
 * (no reply yet), maybe, and yes. Waitlisted guests are excluded because they
 * do not hold a seat.
 *
 * This is the number the HOST is warned against when adding or editing a
 * guest: a list built wildly over capacity while everyone is still pending
 * silently becomes the guest's problem later (blocked or waitlisted at RSVP
 * time), which is backwards. `confirmedHeadcount` stays the guest-facing /
 * server-side rule ("yes" only), so real seats are never over-counted there.
 */
export function committedHeadcount(event: KEvent, excludeGuestId?: string): number {
  let n = 0;
  for (const g of event.guests) {
    if (g.status === "no" || g.status === "waitlisted") continue;
    if (excludeGuestId && g.id === excludeGuestId) continue;
    n += partyHeadcount(g);
  }
  return n;
}



// Event date/time. All of it delegates to src/lib/datetime.ts, the ONE approved
// formatting module: an event is a wall clock at a place, formatted in exactly
// one place so no two surfaces can ever disagree again.

/** The real UTC instant of an event's venue wall clock (calendars, countdowns). */
export function zonedWallClockToUtc(iso: string, timeZone?: string): Date {
  return eventInstant(iso, timeZone);
}

/** Display parts for an event date. See EventDateParts in src/lib/datetime.ts. */
export const formatEventDate = formatCanonicalEventDate;


/**
 * Legacy prototype payment host. It was never registered, so any stored link
 * pointing at it is dead and must be replaced on read/write.
 */
const DEAD_PAY_HOST = "pay.kenroe.app";

/** True when a stored payment link actually resolves to something real. */
export function isRealPaymentLink(link?: string | null): boolean {
  return !!link && !link.includes(DEAD_PAY_HOST);
}

/**
 * The guest's real payment destination: their own invitation page, which
 * renders the host's configured Venmo / CashApp / PayPal / Zelle buttons with
 * the guest's owed amount pre-filled (see PaymentBlock in invite.$eventId).
 */
export function guestPaymentLink(eventId: string): string {
  const base =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://thekenroecollective.com";
  return `${base}/invite/${eventId}`;
}

/** Keep an existing real link, otherwise fall back to the invitation page. */
export function resolvePaymentLink(eventId: string, link?: string | null): string {
  return isRealPaymentLink(link) ? (link as string) : guestPaymentLink(eventId);
}

/** True when the host has at least one way for guests to actually pay them. */
export function hasPayoutMethod(event: KEvent): boolean {
  return !!(event.payVenmo || event.payCashapp || event.payZelle || event.payPaypal);
}

export function sendPaymentLink(eventId: string, guestId: string) {
  const now = new Date().toISOString();
  save(
    load().map((e) =>
      e.id === eventId
        ? {
            ...e,
            guests: e.guests.map((g) =>
              g.id === guestId
                ? {
                    ...g,
                    payment: {
                      status: "sent",
                      link: resolvePaymentLink(eventId, g.payment?.link),
                      sentAt: now,
                      remindersSent: 0,
                      // Freeze what the guest is being billed for shirts, so a
                      // later price edit can't rewrite an invoice already sent.
                      shirtAmount: shirtChargeLive(e, g),
                    },
                  }
                : g,
            ),
          }
        : e,
    ),
  );
}

/**
 * Records that a manual payment reminder went out for this guest: preserves
 * everything already on the payment record (history, amounts, link) and bumps
 * the reminder counter + timestamp that drive the 3-send cap and 72h spacing.
 *
 * Delivery itself is NOT done here. It happens through
 * src/lib/payment-notify.ts -> sendPaymentMessages (real transactional email)
 * and queueSms (real SMS outbox). The previous version of this function called
 * sendTransactionalEmail("payment-reminder"), which the
 * /lovable/email/transactional/send allow-list rejects with 403 — the failure
 * was swallowed, so hosts saw a success toast while nothing was ever sent.
 */
export function markPaymentReminderSent(eventId: string, guestId: string) {
  const now = new Date().toISOString();
  save(
    load().map((e) =>
      e.id === eventId
        ? {
            ...e,
            guests: e.guests.map((g) => {
              if (g.id !== guestId) return g;
              const prev = g.payment ?? { status: "not_sent" as PaymentStatus };
              const link = resolvePaymentLink(eventId, prev.link);
              return {
                ...g,
                payment: {
                  ...prev,
                  status:
                    prev.status === "paid" || prev.status === "refunded" || prev.status === "canceled"
                      ? prev.status
                      : prev.status === "partial"
                        ? "partial"
                        : "pending",
                  link,
                  sentAt: prev.sentAt ?? now,
                  remindersSent: (prev.remindersSent ?? 0) + 1,
                  lastReminderAt: now,
                },
              };
            }),
          }
        : e,
    ),
  );
}

/** Back-compat alias — same counter bump, no delivery. */
export const resendPaymentReminder = markPaymentReminderSent;


/** Which guests a bulk payment nudge would actually reach. */
export type ReminderScope = "unpaid" | "partial" | "all";

/**
 * Guests eligible for a bulk nudge in this scope. "unpaid" = nothing received
 * yet, "partial" = some money in but a balance remains, "all" = both. Always
 * filtered through paymentReminderEligible so the cap and 72h spacing hold for
 * bulk sends exactly as they do for a single guest.
 */
export function remindablePaymentGuests(
  event: KEvent,
  scope: ReminderScope = "all",
  now: number = Date.now(),
): Guest[] {
  return event.guests.filter((g) => {
    if (!paymentReminderEligible(event, g, now)) return false;
    if (scope === "all") return true;
    const collected = Math.max(0, guestCollected(event, g));
    return scope === "partial" ? collected > 0 : collected <= 0;
  });
}

/**
 * Records counters for a bulk nudge. Only the guests the server actually
 * reached are passed in, so a skipped guest never burns one of their three
 * reminders.
 */
export function markPaymentGroupReminded(eventId: string, guestIds: string[]): number {
  guestIds.forEach((id) => markPaymentReminderSent(eventId, id));
  return guestIds.length;
}


export function setPaymentStatus(eventId: string, guestId: string, status: PaymentStatus) {
  save(
    load().map((e) =>
      e.id === eventId
        ? {
            ...e,
            guests: e.guests.map((g) =>
              g.id === guestId
                ? {
                    ...g,
                    payment: {
                      ...(g.payment ?? { status: "not_sent" }),
                      status,
                      link: resolvePaymentLink(eventId, g.payment?.link),
                    },
                  }
                : g,
            ),
          }
        : e,
    ),
  );
}

export function logEventReminder(eventId: string, presetId?: string, note?: string) {
  save(
    load().map((e) =>
      e.id === eventId
        ? {
            ...e,
            reminderLog: [
              { sentAt: new Date().toISOString(), presetId, note },
              ...(e.reminderLog ?? []),
            ],
          }
        : e,
    ),
  );
}

export function upcomingReminders(event: KEvent): { presetId: string; label: string; date: Date; past: boolean }[] {
  const ids = event.reminderPresetIds ?? [];
  const now = Date.now();
  return REMINDER_PRESETS.filter((p) => ids.includes(p.id))
    .map((p) => {
      // The host's chosen local time (default 9:00 AM) in the event's own zone,
      // N days before the event's own date.
      const date = scheduledReminderInstant(
        event.date,
        event.timezone,
        p.days,
        reminderTimeFor(p.id, event.reminderTimes),
      );
      return date ? { presetId: p.id, label: p.label, date, past: date.getTime() < now } : null;
    })
    .filter((r): r is { presetId: string; label: string; date: Date; past: boolean } => r !== null);
}

/** Sets one preset's send time ("HH:MM", event-local). */
export function setReminderTime(eventId: string, presetId: string, time: string) {
  const norm = normalizeReminderTime(time);
  if (!norm) return;
  save(
    load().map((e) =>
      e.id === eventId
        ? { ...e, reminderTimes: { ...(e.reminderTimes ?? {}), [presetId]: norm } }
        : e,
    ),
  );
}

/**
 * Scheduled-SMS settings for reminders. The host's template is stored verbatim
 * (only length-capped) so the cron worker sends exactly the text they wrote.
 */
export function setReminderSms(
  eventId: string,
  patch: { enabled?: boolean; body?: string },
) {
  save(
    load().map((e) =>
      e.id === eventId
        ? {
            ...e,
            ...(patch.enabled === undefined ? {} : { reminderSmsEnabled: patch.enabled }),
            ...(patch.body === undefined ? {} : { reminderSmsBody: patch.body.slice(0, 320) }),
          }
        : e,
    ),
  );
}


export function setGuestPaymentAmount(eventId: string, guestId: string, amount: number | undefined) {
  save(
    load().map((e) =>
      e.id === eventId
        ? {
            ...e,
            guests: e.guests.map((g) =>
              g.id === guestId
                ? { ...g, payment: { ...(g.payment ?? { status: "not_sent" }), amount } }
                : g,
            ),
          }
        : e,
    ),
  );
}

export function setGuestPaidAmount(eventId: string, guestId: string, paidAmount: number | undefined) {
  save(
    load().map((e) =>
      e.id === eventId
        ? {
            ...e,
            guests: e.guests.map((g) =>
              g.id === guestId
                ? { ...g, payment: { ...(g.payment ?? { status: "not_sent" }), paidAmount } }
                : g,
            ),
          }
        : e,
    ),
  );
}

export function sendPaymentLinkToAll(eventId: string) {
  const now = new Date().toISOString();
  save(
    load().map((e) =>
      e.id === eventId
        ? {
            ...e,
            guests: e.guests.map((g) => ({
              ...g,
              payment: {
                status: g.payment?.status && g.payment.status !== "not_sent" ? g.payment.status : "sent",
                link: resolvePaymentLink(eventId, g.payment?.link),
                sentAt: g.payment?.sentAt ?? now,
                remindersSent: g.payment?.remindersSent ?? 0,
                amount: g.payment?.amount,
                paidAmount: g.payment?.paidAmount,
                shirtAmount: g.payment?.shirtAmount ?? shirtChargeLive(e, g),
              },
            })),
          }
        : e,
    ),
  );
}

export function computeOwed(
  event: KEvent,
  adults: number,
  children: number,
  adultOverride?: number,
): number {
  // Single source of truth (src/lib/party-fare.ts) so the reconciliation report,
  // the reminder worker and this store can never drift on the child rate again.
  // Pets are never billed, and 0 adults + 0 kids owes $0.
  return fareFromCounts(event as Record<string, any>, adults, children, adultOverride);
}

/** Hard ceiling on spare shirts per RSVP, mirroring the pets sanity cap. */
export const MAX_EXTRA_SHIRTS = 10;

/** Host ceiling on extra shirts for this event, clamped into 0..MAX_EXTRA_SHIRTS. */
export function maxExtraShirts(event: Pick<KEvent, "maxExtraShirtsPerRsvp">): number {
  const raw = Number(event.maxExtraShirtsPerRsvp ?? MAX_EXTRA_SHIRTS);
  if (!Number.isFinite(raw)) return MAX_EXTRA_SHIRTS;
  return Math.max(0, Math.min(MAX_EXTRA_SHIRTS, Math.floor(raw)));
}

/** Is shirt pricing live on this event? Needs payments on, sizes on and a price. */
export function shirtPricingOn(event: KEvent): boolean {
  if (!event.paymentEnabled || !event.tshirtSizesEnabled || !event.shirtPricingEnabled) return false;
  return shirtUnitPrice(event, "adult") > 0 || shirtUnitPrice(event, "youth") > 0;
}

/** Price for one shirt in a band. Youth falls back to adult, like paymentAmountChild. */
export function shirtUnitPrice(event: KEvent, band: "adult" | "youth"): number {
  const adult = Math.max(0, Number(event.shirtPriceAdult ?? 0) || 0);
  if (band === "adult") return adult;
  const n = Number(event.shirtPriceYouth);
  // Blank/absent youth price means "same as adult", mirroring paymentAmountChild.
  return Number.isFinite(n) && n >= 0 && String(event.shirtPriceYouth ?? "") !== "" ? n : adult;
}

/** Price for one size, resolved through its band. */
export function shirtPriceForSize(event: KEvent, size: string): number {
  if (!isShirtSize(size)) return 0;
  return shirtUnitPrice(event, shirtBand(size));
}

/** Extra-shirt lines on a guest, sanitised and clamped to the host's ceiling. */
export function guestExtraShirts(event: KEvent, g: Guest): { size: ShirtSize; qty: number }[] {
  if (!event.tshirtSizesEnabled || !event.extraShirtsEnabled) return [];
  const ceiling = maxExtraShirts(event);
  const out: { size: ShirtSize; qty: number }[] = [];
  let running = 0;
  for (const line of Array.isArray(g.extraShirts) ? g.extraShirts : []) {
    if (!isShirtSize(line?.size) || running >= ceiling) continue;
    const qty = Math.min(MAX_EXTRA_SHIRTS, Math.max(0, Math.floor(Number(line.qty) || 0)));
    if (qty <= 0) continue;
    const take = Math.min(qty, ceiling - running);
    running += take;
    out.push({ size: line.size, qty: take });
  }
  return out;
}

/** Total spare shirts requested on this RSVP. */
export function guestExtraShirtCount(event: KEvent, g: Guest): number {
  return guestExtraShirts(event, g).reduce((s, l) => s + l.qty, 0);
}

/**
 * Live shirt charge for a guest row: each attending person's own size plus every
 * spare shirt. Declined and waitlisted rows are never billed, same rule the
 * shirt tally uses, so nobody pays for a shirt they will not receive.
 */
export function shirtChargeLive(event: KEvent, g: Guest): number {
  if (!shirtPricingOn(event)) return 0;
  if (g.status === "no" || g.status === "waitlisted") return 0;
  let total = 0;
  if (isShirtSize(g.shirtSize)) total += shirtPriceForSize(event, g.shirtSize);
  for (const p of Array.isArray(g.plusOnes) ? g.plusOnes : []) {
    if (isShirtSize(p?.shirtSize)) total += shirtPriceForSize(event, p.shirtSize as string);
  }
  for (const line of guestExtraShirts(event, g)) {
    total += line.qty * shirtPriceForSize(event, line.size);
  }
  return total;
}

/**
 * Shirt charge used for billing. A frozen snapshot wins once the guest has been
 * billed, so later price edits never rewrite an existing invoice.
 */
export function shirtChargeForGuest(event: KEvent, g: Guest): number {
  const frozen = g.payment?.shirtAmount;
  if (typeof frozen === "number" && Number.isFinite(frozen) && frozen >= 0) return frozen;
  return shirtChargeLive(event, g);
}

/**
 * Adults we bill for: the invited guest's own adult count plus every adult they
 * named as a plus-one. Named plus-ones are real attending heads (capacity and
 * the reconciliation report have always counted them), so the fare counts them
 * too. A plus-one flagged as a child is billed at the child rate, not the adult
 * rate, so a family naming a child no longer overpays. This is what lets the
 * RSVP form derive Adults instead of asking guests to type their party into a
 * raw counter.
 */
export function billableAdults(g: Guest): number {
  return (
    Math.max(0, g.adults ?? 1) +
    namedPlusOneCount(g as Record<string, any>) -
    namedChildPlusOneCount(g as Record<string, any>)
  );
}

/** Number of children we bill for, including plus-ones flagged as children. */
export function billableChildren(g: Guest): number {
  return Math.max(0, g.children ?? 0) + namedChildPlusOneCount(g as Record<string, any>);
}

/**
 * Everything this guest owes: attendance fare plus shirts. The per-guest
 * `payment.amount` override stays an attendance-fare override only, so a comped
 * fare never accidentally comps shirts.
 */
export function guestOwedAmount(event: KEvent, g: Guest): number {
  return (
    computeOwed(event, billableAdults(g), billableChildren(g), g.payment?.amount) +
    shirtChargeForGuest(event, g)
  );
}

/** Attendance-only portion, for the itemised split in the reconciliation report. */
export function guestAttendanceAmount(event: KEvent, g: Guest): number {
  return computeOwed(event, billableAdults(g), billableChildren(g), g.payment?.amount);
}

/** Every payment/refund entry for a guest, newest last. */
export function paymentHistory(g: Guest): PaymentEntry[] {
  return Array.isArray(g.payment?.history) ? (g.payment!.history as PaymentEntry[]) : [];
}

/** Gross received (payments only, refunds excluded). */
export function paidGross(g: Guest): number {
  const hist = paymentHistory(g);
  if (hist.length) {
    return hist.filter((h) => h.amount > 0).reduce((s, h) => s + h.amount, 0);
  }
  return Math.max(0, g.payment?.paidAmount ?? 0);
}

/** Total refunded back to the guest (absolute value). */
export function refundedTotal(g: Guest): number {
  return paymentHistory(g)
    .filter((h) => h.amount < 0)
    .reduce((s, h) => s + Math.abs(h.amount), 0);
}

/**
 * Net money the host is actually holding for this guest. Partial payments count
 * for exactly what was received — the old report only counted guests flagged
 * "paid", so every partial silently vanished from the collected total.
 */
export function paidNet(g: Guest): number {
  const hist = paymentHistory(g);
  if (hist.length) return hist.reduce((s, h) => s + h.amount, 0);
  const legacy = g.payment?.paidAmount;
  if (typeof legacy === "number") return Math.max(0, legacy);
  return g.payment?.status === "paid" ? -1 : 0; // -1 = "use owed amount", resolved by caller
}

/** Net collected for a guest, resolving the legacy "paid with no amount" case. */
export function guestCollected(event: KEvent, g: Guest): number {
  const net = paidNet(g);
  if (net === -1) return guestOwedAmount(event, g);
  return net;
}

/** Status implied by the money on file, used after recording a payment/refund. */
export function derivePaymentStatus(event: KEvent, g: Guest, previous: PaymentStatus): PaymentStatus {
  if (previous === "canceled") return "canceled";
  const owed = guestOwedAmount(event, g);
  const net = guestCollected(event, g);
  const gross = paidGross(g);
  if (gross > 0 && net <= 0) return "refunded";
  if (owed > 0 && net >= owed) return "paid";
  if (net > 0) return "partial";
  return previous === "not_sent" ? "not_sent" : previous;
}

export function paymentReport(event: KEvent) {
  let billed = 0;
  let collected = 0;
  let refunded = 0;
  const byStatus: Record<PaymentStatus, number> = {
    not_sent: 0,
    sent: 0,
    pending: 0,
    partial: 0,
    paid: 0,
    refunded: 0,
    canceled: 0,
  };
  let billedAttendance = 0;
  let billedShirts = 0;
  // Adult vs child split of the attendance fare, so a host can see how much of
  // the money owed comes from the child rate instead of guessing from headcount.
  let adultHeads = 0;
  let childHeads = 0;
  let billedAdults = 0;
  let billedChildren = 0;
  event.guests.forEach((g) => {
    const status = g.payment?.status ?? "not_sent";
    byStatus[status]++;
    if (status !== "canceled") {
      billed += guestOwedAmount(event, g);
      // Itemised so a host can read shirt spend against attendance income.
      billedAttendance += guestAttendanceAmount(event, g);
      billedShirts += shirtChargeForGuest(event, g);
      const a = billableAdults(g);
      const c = billableChildren(g);
      adultHeads += a;
      childHeads += c;
      billedAdults += computeOwed(event, a, 0, g.payment?.amount);
      billedChildren += computeOwed(event, 0, c, g.payment?.amount);
    }
    // Count what was actually received, whatever the status label says.
    collected += Math.max(0, guestCollected(event, g));
    refunded += refundedTotal(g);
  });
  return {
    enabled: !!event.paymentEnabled,
    currency: event.paymentCurrency ?? "USD",
    billed,
    billedAttendance,
    billedShirts,
    adultHeads,
    childHeads,
    billedAdults,
    billedChildren,
    childRate:
      event.paymentAmountChild === undefined || event.paymentAmountChild === null
        ? (event.paymentAmount ?? 0)
        : Number(event.paymentAmountChild) || 0,
    collected,
    refunded,
    outstanding: Math.max(0, billed - collected),
    byStatus,
  };
}

/** Max payment nudges per guest, and the minimum gap between them. */
export const PAYMENT_REMINDER_MAX = 3;
export const PAYMENT_REMINDER_MIN_GAP_HOURS = 72;

/**
 * Should this guest get another payment nudge? Targets confirmed guests (and
 * "maybe" guests who opted in), stops as soon as the balance is settled,
 * refunded or canceled, caps the number of sends and spaces them out.
 */
export function paymentReminderEligible(
  event: KEvent,
  g: Guest,
  now: number = Date.now(),
): boolean {
  if (!event.paymentEnabled) return false;
  const p = g.payment;
  if (!p || p.status === "not_sent") return false;
  if (p.status === "canceled" || p.status === "paid" || p.status === "refunded") return false;
  if (g.status !== "yes" && !(g.status === "maybe" && p.remindersOptIn)) return false;
  const owed = guestOwedAmount(event, g);
  if (owed <= 0) return false;
  if (guestCollected(event, g) >= owed) return false;
  if ((p.remindersSent ?? 0) >= PAYMENT_REMINDER_MAX) return false;
  const last = p.lastReminderAt ? Date.parse(p.lastReminderAt) : NaN;
  if (Number.isFinite(last) && now - last < PAYMENT_REMINDER_MIN_GAP_HOURS * 3600_000) return false;
  return true;
}

/** Append a received payment (append-only; never rewrites earlier entries). */
export function recordPayment(
  eventId: string,
  guestId: string,
  input: { amount: number; method: PaymentMethod; note?: string },
) {
  appendPaymentEntry(eventId, guestId, {
    id: uid(),
    at: new Date().toISOString(),
    amount: Math.abs(input.amount),
    method: input.method,
    kind: "payment",
    note: input.note,
  });
}

/** Append a refund. Keeps the original payment record intact. */
export function recordRefund(
  eventId: string,
  guestId: string,
  input: { amount: number; method: PaymentMethod; note?: string },
) {
  appendPaymentEntry(eventId, guestId, {
    id: uid(),
    at: new Date().toISOString(),
    amount: -Math.abs(input.amount),
    method: input.method,
    kind: "refund",
    note: input.note,
  });
}

export function setPaymentRemindersOptIn(eventId: string, guestId: string, optIn: boolean) {
  save(
    load().map((e) =>
      e.id === eventId
        ? {
            ...e,
            guests: e.guests.map((g) =>
              g.id === guestId
                ? { ...g, payment: { ...(g.payment ?? { status: "not_sent" as PaymentStatus }), remindersOptIn: optIn } }
                : g,
            ),
          }
        : e,
    ),
  );
}

function appendPaymentEntry(eventId: string, guestId: string, entry: PaymentEntry) {
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      return {
        ...e,
        guests: e.guests.map((g) => {
          if (g.id !== guestId) return g;
          const prev = g.payment ?? { status: "not_sent" as PaymentStatus };
          const history = [...paymentHistory(g), entry];
          const next: Guest = {
            ...g,
            payment: {
              ...prev,
              history,
              // First money in freezes the shirt charge too, so the balance a
              // guest paid against can't drift when prices change later.
              shirtAmount: prev.shirtAmount ?? shirtChargeLive(e, g),
              // Keep the legacy single figure in sync so older views/exports and
              // any code that still reads paidAmount stay correct.
              paidAmount: history.reduce((s, h) => s + h.amount, 0),
            },
          };
          return {
            ...next,
            payment: { ...next.payment!, status: derivePaymentStatus(e, next, prev.status) },
          };
        }),
      };
    }),
  );
}

export function addRegistry(eventId: string, url: string, label?: string, note?: string, store?: string) {
  const link: RegistryLink = {
    id: uid(),
    url,
    label,
    note,
    store: store || detectRegistryStore(url),
    purchased: false,
  };
  save(
    load().map((e) =>
      e.id === eventId ? { ...e, registry: [...(e.registry ?? []), link] } : e,
    ),
  );
}

export function updateRegistry(eventId: string, linkId: string, patch: Partial<RegistryLink>) {
  save(
    load().map((e) =>
      e.id === eventId
        ? { ...e, registry: (e.registry ?? []).map((r) => (r.id === linkId ? { ...r, ...patch } : r)) }
        : e,
    ),
  );
}

export function removeRegistry(eventId: string, linkId: string) {
  save(
    load().map((e) =>
      e.id === eventId ? { ...e, registry: (e.registry ?? []).filter((r) => r.id !== linkId) } : e,
    ),
  );
}

export function addReview(eventId: string, review: Omit<Review, "id" | "createdAt">) {
  const r: Review = { ...review, id: uid(), createdAt: new Date().toISOString() };
  save(
    load().map((e) =>
      e.id === eventId ? { ...e, reviews: [r, ...(e.reviews ?? [])] } : e,
    ),
  );
  return r;
}

export function removeReview(eventId: string, reviewId: string) {
  save(
    load().map((e) =>
      e.id === eventId ? { ...e, reviews: (e.reviews ?? []).filter((r) => r.id !== reviewId) } : e,
    ),
  );
}

export function reviewStats(event: KEvent) {
  const reviews = event.reviews ?? [];
  if (reviews.length === 0) return { count: 0, average: 0, distribution: [0, 0, 0, 0, 0] };
  const distribution = [0, 0, 0, 0, 0];
  let sum = 0;
  reviews.forEach((r) => {
    const v = Math.max(1, Math.min(5, Math.round(r.rating)));
    distribution[v - 1]++;
    sum += v;
  });
  return { count: reviews.length, average: sum / reviews.length, distribution };
}

export function addHost(eventId: string, host: Omit<Host, "id">) {
  const h: Host = { ...host, id: uid() };
  save(
    load().map((e) =>
      e.id === eventId ? { ...e, hosts: [...(e.hosts ?? []), h] } : e,
    ),
  );
  return h;
}

export function updateHost(eventId: string, hostId: string, patch: Partial<Host>) {
  save(
    load().map((e) =>
      e.id === eventId
        ? { ...e, hosts: (e.hosts ?? []).map((h) => (h.id === hostId ? { ...h, ...patch } : h)) }
        : e,
    ),
  );
}

export function removeHost(eventId: string, hostId: string) {
  save(
    load().map((e) =>
      e.id === eventId ? { ...e, hosts: (e.hosts ?? []).filter((h) => h.id !== hostId) } : e,
    ),
  );
}

export function addMedia(eventId: string, item: Omit<MediaItem, "id">) {
  const m: MediaItem = { ...item, id: uid() };
  save(load().map((e) => (e.id === eventId ? { ...e, inviteMedia: [...(e.inviteMedia ?? []), m] } : e)));
  return m;
}

export function updateMedia(eventId: string, mediaId: string, patch: Partial<MediaItem>) {
  save(
    load().map((e) =>
      e.id === eventId
        ? { ...e, inviteMedia: (e.inviteMedia ?? []).map((m) => (m.id === mediaId ? { ...m, ...patch } : m)) }
        : e,
    ),
  );
}

export function removeMedia(eventId: string, mediaId: string) {
  save(
    load().map((e) =>
      e.id === eventId ? { ...e, inviteMedia: (e.inviteMedia ?? []).filter((m) => m.id !== mediaId) } : e,
    ),
  );
}

export function setVoiceMessage(eventId: string, dataUrl: string, duration: number) {
  updateEvent(eventId, { voiceMessage: dataUrl, voiceMessageDuration: duration });
}

export function clearVoiceMessage(eventId: string) {
  updateEvent(eventId, { voiceMessage: undefined, voiceMessageDuration: undefined });
}

export type ThankYouChannel = "email" | "sms" | "print";

export interface ThankYouCard {
  id: string;
  message: string;
  design: "ivory" | "velvet" | "garden" | "midnight" | "confetti";
  photo?: string;
  /** Optional animated GIF (URL) chosen from the celebration gallery */
  gif?: string;
  /** A letter, poem, or song from Atelier Studio, delivered as a hosted page
   *  that plays it and always prints the written words underneath. */
  pieceUrl?: string;
  pieceTitle?: string;
  pieceKind?: string;
  signOff?: string;
  recipientIds: string[];
  channel: ThankYouChannel;
  createdAt: string;
  /** ISO date-time the host has scheduled this card to be sent. */
  scheduledFor?: string;
  sentAt?: string;
  /** When set to true, the cron worker will email this card on the schedule
   *  (event date + `autoSendAfterHours`) to every yes guest with an email. */
  autoSend?: boolean;
  /** Hours after the event date to fire the auto-send (default 48). */
  autoSendAfterHours?: number;
  /** ISO timestamp set by the cron worker when the auto-send completes. */
  autoSentAt?: string;
  /** True only when the host actually wrote/edited this copy. An automated
   *  sender must never deliver content the host did not author, so the worker
   *  holds any card with this explicitly `false`. */
  hostAuthored?: boolean;
  /** Print-at-home cards only: guest ids the host has ticked as posted. We
   *  never print or mail anything; this is the host's own tracking. */
  mailedGuestIds?: string[];
}

/** Unsent composer state for the thank-you card studio. Persisted per event so
 *  the host can leave the screen and come back to exactly what they typed. */
export interface ThankYouDraft {
  message?: string;
  signOff?: string;
  design?: ThankYouCard["design"];
  channel?: ThankYouChannel;
  photo?: string;
  gif?: string;
  pieceUrl?: string;
  pieceTitle?: string;
  pieceKind?: string;
  recipientIds?: string[];
  /** "now" | "at" (absolute date-time) | "after" (hours after the event) */
  sendMode?: "now" | "at" | "after";
  /** datetime-local value, kept verbatim so the input round-trips. */
  scheduledFor?: string;
  afterHours?: number;
  updatedAt?: string;
  /** The card this composer state was last saved/scheduled into. Editing then
   *  re-saving updates that card instead of stacking up duplicates. */
  cardId?: string;
}

export function setThankYouDraft(eventId: string, patch: Partial<ThankYouDraft>) {
  save(
    load().map((e) =>
      e.id === eventId
        ? { ...e, thankYouDraft: { ...(e.thankYouDraft ?? {}), ...patch, updatedAt: new Date().toISOString() } }
        : e,
    ),
  );
}

export function clearThankYouDraft(eventId: string) {
  save(load().map((e) => (e.id === eventId ? { ...e, thankYouDraft: undefined } : e)));
}



export function addThankYouCard(eventId: string, card: Omit<ThankYouCard, "id" | "createdAt">) {
  const c: ThankYouCard = { ...card, id: uid(), createdAt: new Date().toISOString() };
  save(load().map((e) => (e.id === eventId ? { ...e, thankYouCards: [...(e.thankYouCards ?? []), c] } : e)));
  return c;
}

export function updateThankYouCard(eventId: string, cardId: string, patch: Partial<ThankYouCard>) {
  save(
    load().map((e) =>
      e.id === eventId
        ? { ...e, thankYouCards: (e.thankYouCards ?? []).map((c) => (c.id === cardId ? { ...c, ...patch } : c)) }
        : e,
    ),
  );
}

export function removeThankYouCard(eventId: string, cardId: string) {
  save(
    load().map((e) =>
      e.id === eventId ? { ...e, thankYouCards: (e.thankYouCards ?? []).filter((c) => c.id !== cardId) } : e,
    ),
  );
}

export function markThankYouSent(eventId: string, cardId: string) {
  updateThankYouCard(eventId, cardId, { sentAt: new Date().toISOString() });
}

// ─── Series (occasions) ─────────────────────────────────────────────────────

/** Normalised key for a series name, so "Reunion " and "reunion" group together. */
export function seriesKey(name: string | undefined | null): string {
  return (name ?? "").trim().toLowerCase();
}

/** Set (or clear, with an empty string) the series an event belongs to. */
export function setEventSeries(eventId: string, name: string) {
  const clean = name.trim().slice(0, 80);
  save(
    load().map((e) =>
      e.id === eventId ? { ...e, seriesName: clean ? clean : undefined } : e,
    ),
  );
}

/** Distinct series names across the given events, sorted alphabetically. */
export function listSeriesNames(events: KEvent[]): string[] {
  const seen = new Map<string, string>();
  for (const e of events) {
    const key = seriesKey(e.seriesName);
    if (key && !seen.has(key)) seen.set(key, (e.seriesName ?? "").trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Other events in the same series as `event` (never the event itself). */
export function siblingsInSeries(events: KEvent[], event: KEvent): KEvent[] {
  const key = seriesKey(event.seriesName);
  if (!key) return [];
  return events.filter((e) => e.id !== event.id && seriesKey(e.seriesName) === key);
}

/**
 * Stage 1 of the series feature: seed a sub-event's guest list from another
 * event, so a weekend of gatherings is imported once instead of three times.
 * People are copied as fresh invitees (new ids, pending RSVP, no payment or
 * send history) and anyone already on the list by email/phone/name is skipped.
 */
export function copyGuestsFromEvent(targetEventId: string, sourceEventId: string): number {
  let added = 0;
  const all = load();
  const source = all.find((e) => e.id === sourceEventId);
  if (!source) return 0;
  const ident = (g: Guest) =>
    (g.email || "").trim().toLowerCase() ||
    (g.phone || "").replace(/\D/g, "") ||
    g.name.trim().toLowerCase();
  save(
    all.map((e) => {
      if (e.id !== targetEventId) return e;
      const have = new Set(e.guests.map(ident));
      const incoming: Guest[] = [];
      for (const g of source.guests) {
        const key = ident(g);
        if (!key || have.has(key)) continue;
        have.add(key);
        incoming.push({
          id: uid(),
          name: g.name,
          email: g.email,
          phone: g.phone,
          address: g.address,
          status: "pending" as RsvpStatus,
          adults: g.adults,
          children: g.children,
          pets: g.pets,
          category: g.category,
          dietary: g.dietary,
          accessibilityNotes: g.accessibilityNotes,
          preferredLanguage: g.preferredLanguage,
        });
      }
      added = incoming.length;
      return incoming.length ? { ...e, guests: [...e.guests, ...incoming] } : e;
    }),
  );
  return added;
}

// ─── Seating ────────────────────────────────────────────────────────────────

/** Move a table/element on the venue map. Coordinates are clamped percentages. */
export function setTablePosition(eventId: string, tableId: string, x: number, y: number) {
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n * 10) / 10));
  updateSeatingTable(eventId, tableId, { x: clamp(x), y: clamp(y) });
}

/**
 * Lay every table and element out on an even grid. Used for "Auto arrange" and
 * as the starting point for a floor plan the host has never dragged.
 */
export function autoArrangeVenueMap(eventId: string) {
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      const all = e.seatingTables ?? [];
      if (!all.length) return e;
      const cols = Math.max(1, Math.ceil(Math.sqrt(all.length)));
      const rows = Math.ceil(all.length / cols);
      return {
        ...e,
        seatingTables: all.map((t, i) => ({
          ...t,
          x: Math.round((((i % cols) + 0.5) / cols) * 1000) / 10,
          y: Math.round((((Math.floor(i / cols)) + 0.5) / rows) * 1000) / 10,
        })),
      };
    }),
  );
}

/** Drop every saved position so the map falls back to the automatic grid. */
export function clearVenueMapPositions(eventId: string) {
  save(
    load().map((e) =>
      e.id === eventId
        ? {
            ...e,
            seatingTables: (e.seatingTables ?? []).map(({ x: _x, y: _y, ...rest }) => rest),
          }
        : e,
    ),
  );
}

export function addSeatingTable(
  eventId: string,
  label: string,
  shape: TableShape = "round",
  capacity = 8,
  extras: Partial<SeatingTable> = {},
) {
  const t: SeatingTable = { id: uid(), label, shape, capacity, guestIds: [], ...extras };
  save(load().map((e) => (e.id === eventId ? { ...e, seatingTables: [...(e.seatingTables ?? []), t] } : e)));
  return t;
}

/** Find the seating table (kind !== "element") a guest is assigned to, if any. */
export function findGuestTable(event: KEvent, guestId: string): SeatingTable | undefined {
  return (event.seatingTables ?? []).find(
    (t) => t.kind !== "element" && t.guestIds.includes(guestId),
  );
}

// ─── Seating rules ──────────────────────────────────────────────────────────

export function addSeatingRule(eventId: string, rule: Omit<SeatingRule, "id">) {
  const r: SeatingRule = { ...rule, id: uid() };
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      let tables = e.seatingTables ?? [];

      // A rule is an instruction, not merely a warning. If both guests are
      // already at the same table, put their party blocks next to one another
      // in the auto-filled chair order immediately. This is the case that used
      // to show a valid "Together" rule while another party sat between them.
      if (rule.type === "together") {
        const tableIndex = tables.findIndex(
          (table) =>
            table.kind !== "element" &&
            table.guestIds.includes(rule.guestAId) &&
            table.guestIds.includes(rule.guestBId),
        );
        if (tableIndex >= 0) {
          const table = tables[tableIndex];
          const withoutPair = table.guestIds.filter(
            (id) => id !== rule.guestAId && id !== rule.guestBId,
          );
          const firstPairIndex = Math.min(
            table.guestIds.indexOf(rule.guestAId),
            table.guestIds.indexOf(rule.guestBId),
          );
          const insertAt = Math.max(0, Math.min(firstPairIndex, withoutPair.length));
          const guestIds = [...withoutPair];
          guestIds.splice(insertAt, 0, rule.guestAId, rule.guestBId);
          tables = tables.map((item, index) =>
            index === tableIndex ? { ...item, guestIds, seatAssignments: undefined } : item,
          );
        }
      }

      return { ...e, seatingRules: [...(e.seatingRules ?? []), r], seatingTables: tables };
    }),
  );
  return r;
}

export function removeSeatingRule(eventId: string, ruleId: string) {
  save(
    load().map((e) =>
      e.id === eventId ? { ...e, seatingRules: (e.seatingRules ?? []).filter((r) => r.id !== ruleId) } : e,
    ),
  );
}

/** Apply saved keep-together rules to the current chair order. This also
 * repairs charts created before together rules became enforceable. */
export function enforceSeatingRules(eventId: string) {
  const current = load();
  let changed = false;
  const next = current.map((event) => {
    if (event.id !== eventId) return event;
    let tables = event.seatingTables ?? [];
    for (const rule of event.seatingRules ?? []) {
      if (rule.type !== "together") continue;
      const tableIndex = tables.findIndex(
        (table) =>
          table.kind !== "element" &&
          table.guestIds.includes(rule.guestAId) &&
          table.guestIds.includes(rule.guestBId),
      );
      if (tableIndex < 0) continue;
      const table = tables[tableIndex];
      const a = table.guestIds.indexOf(rule.guestAId);
      const b = table.guestIds.indexOf(rule.guestBId);
      if (Math.abs(a - b) === 1) continue;
      const withoutPair = table.guestIds.filter(
        (id) => id !== rule.guestAId && id !== rule.guestBId,
      );
      const insertAt = Math.max(0, Math.min(Math.min(a, b), withoutPair.length));
      const guestIds = [...withoutPair];
      guestIds.splice(insertAt, 0, rule.guestAId, rule.guestBId);
      tables = tables.map((item, index) =>
        index === tableIndex ? { ...item, guestIds, seatAssignments: undefined } : item,
      );
      changed = true;
    }
    return tables === event.seatingTables ? event : { ...event, seatingTables: tables };
  });
  if (changed) save(next);
}

/** Compute rule violations against current seating assignments. */
export function seatingRuleViolations(event: KEvent): {
  rule: SeatingRule;
  reason: string;
  guestA?: Guest;
  guestB?: Guest;
}[] {
  const rules = event.seatingRules ?? [];
  if (!rules.length) return [];
  const tables = (event.seatingTables ?? []).filter((t) => t.kind !== "element");
  const tableByGuest = new Map<string, string>();
  for (const t of tables) for (const gid of t.guestIds) tableByGuest.set(gid, t.id);

  const out: { rule: SeatingRule; reason: string; guestA?: Guest; guestB?: Guest }[] = [];
  for (const rule of rules) {
    const gA = event.guests.find((g) => g.id === rule.guestAId);
    const gB = event.guests.find((g) => g.id === rule.guestBId);
    if (!gA || !gB) continue;
    const tA = tableByGuest.get(gA.id);
    const tB = tableByGuest.get(gB.id);
    if (rule.type === "together") {
      if (tA && tB && tA !== tB) {
        out.push({ rule, guestA: gA, guestB: gB, reason: `${gA.name} and ${gB.name} should sit together but are at different tables.` });
      }
    } else {
      if (tA && tB && tA === tB) {
        out.push({ rule, guestA: gA, guestB: gB, reason: `${gA.name} and ${gB.name} should sit apart but are at the same table.` });
      }
    }
  }
  return out;
}


export function updateSeatingTable(eventId: string, tableId: string, patch: Partial<SeatingTable>) {
  save(
    load().map((e) =>
      e.id === eventId
        ? { ...e, seatingTables: (e.seatingTables ?? []).map((t) => (t.id === tableId ? { ...t, ...patch } : t)) }
        : e,
    ),
  );
}

export function removeSeatingTable(eventId: string, tableId: string) {
  save(
    load().map((e) =>
      e.id === eventId ? { ...e, seatingTables: (e.seatingTables ?? []).filter((t) => t.id !== tableId) } : e,
    ),
  );
}

export function assignGuestToTable(eventId: string, tableId: string | null, guestId: string) {
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      const tables = (e.seatingTables ?? []).map((t) => ({
        ...t,
        guestIds: t.guestIds.filter((g) => g !== guestId),
        // Clear any per-seat assignments referencing this guest — party moved.
        seatAssignments: t.seatAssignments
          ? Object.fromEntries(
              Object.entries(t.seatAssignments).filter(([, r]) => r.guestId !== guestId),
            )
          : t.seatAssignments,
      }));
      if (tableId) {
        const idx = tables.findIndex((t) => t.id === tableId);
        // Never assign guests to non-seating venue elements.
        if (idx >= 0 && tables[idx].kind !== "element") {
          const togetherIds = new Set([guestId]);
          let changed = true;
          while (changed) {
            changed = false;
            for (const rule of e.seatingRules ?? []) {
              if (rule.type !== "together") continue;
              if (togetherIds.has(rule.guestAId) && !togetherIds.has(rule.guestBId)) {
                togetherIds.add(rule.guestBId);
                changed = true;
              } else if (togetherIds.has(rule.guestBId) && !togetherIds.has(rule.guestAId)) {
                togetherIds.add(rule.guestAId);
                changed = true;
              }
            }
          }
          const linked = Array.from(togetherIds).filter((id) =>
            e.guests.some((guest) => guest.id === id && guest.status !== "no"),
          );
          const used = tables[idx].guestIds
            .filter((id) => !togetherIds.has(id))
            .map((id) => e.guests.find((guest) => guest.id === id))
            .filter((guest): guest is Guest => !!guest)
            .reduce((sum, guest) => sum + partyMemberCount(guest), 0);
          const needed = linked
            .map((id) => e.guests.find((guest) => guest.id === id))
            .filter((guest): guest is Guest => !!guest)
            .reduce((sum, guest) => sum + partyMemberCount(guest), 0);
          // Keep the old single-party behavior if a linked group cannot fit;
          // the UI will show the violation rather than silently overfill.
          const movingIds = used + needed <= tables[idx].capacity ? linked : [guestId];
          const movingSet = new Set(movingIds);
          for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
            tables[tableIndex] = {
              ...tables[tableIndex],
              guestIds: tables[tableIndex].guestIds.filter((id) => !movingSet.has(id)),
              seatAssignments: tables[tableIndex].seatAssignments
                ? Object.fromEntries(
                    Object.entries(tables[tableIndex].seatAssignments ?? {}).filter(
                      ([, ref]) => !movingSet.has(ref.guestId),
                    ),
                  )
                : tables[tableIndex].seatAssignments,
            };
          }
          tables[idx] = { ...tables[idx], guestIds: [...tables[idx].guestIds, ...movingIds] };
        }
      }

      return { ...e, seatingTables: tables };
    }),
  );
}

/** Party member count = adults (including named adult plus-ones) + children (including child plus-ones) + pets. */
export function partyMemberCount(g: Guest): number {
  const a = billableAdults(g);
  const k = billableChildren(g);
  const p = Math.max(0, g.pets ?? 0);
  return a + k + p;
}

export function memberRole(g: Guest, memberIndex: number): "adult" | "kid" | "pet" {
  const a = billableAdults(g);
  const k = billableChildren(g);
  if (memberIndex < a) return "adult";
  if (memberIndex < a + k) return "kid";
  return "pet";
}

/**
 * Auto-fill map for one table: seatIndex -> member ref, mirroring the renderer's
 * rule (explicit assignments win; remaining members of `guestIds` parties fill
 * the lowest free seats, skipping members explicitly placed on any table).
 */
function autoFillRefs(
  guests: Guest[],
  tables: SeatingTable[],
  table: SeatingTable,
): Record<string, SeatMemberRef> {
  const explicitAnywhere = new Set<string>();
  for (const t of tables) {
    for (const r of Object.values(t.seatAssignments ?? {})) {
      explicitAnywhere.add(`${r.guestId}:${r.memberIndex}`);
    }
  }
  const local = table.seatAssignments ?? {};
  const queue: SeatMemberRef[] = [];
  for (const id of table.guestIds) {
    const g = guests.find((x) => x.id === id);
    if (!g) continue;
    for (let mi = 0; mi < partyMemberCount(g); mi++) {
      if (explicitAnywhere.has(`${g.id}:${mi}`)) continue;
      queue.push({ guestId: g.id, memberIndex: mi });
    }
  }
  const out: Record<string, SeatMemberRef> = {};
  const capacity = Math.max(table.capacity, queue.length + Object.keys(local).length);
  for (let i = 0; i < capacity && queue.length > 0; i++) {
    if (local[String(i)]) continue;
    out[String(i)] = queue.shift()!;
  }
  return out;
}

/** Assign a single party member to a specific seat on a table. Removes prior placement of that member; if target seat has an occupant, swaps them into the source seat (or unassigns if source was auto-derived). */
export function placeMemberAtSeat(
  eventId: string,
  targetTableId: string,
  seatIndex: number,
  ref: SeatMemberRef,
) {
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      const tables = (e.seatingTables ?? []).map((t) => ({ ...t, seatAssignments: { ...(t.seatAssignments ?? {}) } }));

      // Find source (existing explicit placement of this member).
      type SourceLoc = { tableIdx: number; seatKey: string };
      const sourceHolder: { v: SourceLoc | null } = { v: null };
      tables.forEach((t, ti) => {
        for (const [k, r] of Object.entries(t.seatAssignments!)) {
          if (r.guestId === ref.guestId && r.memberIndex === ref.memberIndex) {
            sourceHolder.v = { tableIdx: ti, seatKey: k };
          }
        }
      });
      const src = sourceHolder.v;

      const targetIdx = tables.findIndex((t) => t.id === targetTableId);
      if (targetIdx < 0 || tables[targetIdx].kind === "element") return e;

      const seatKey = String(seatIndex);
      const occupant = tables[targetIdx].seatAssignments![seatKey];

      // Place member at target seat.
      tables[targetIdx].seatAssignments![seatKey] = ref;

      if (src && occupant) {
        tables[src.tableIdx].seatAssignments![src.seatKey] = occupant;
      } else if (src) {
        delete tables[src.tableIdx].seatAssignments![src.seatKey];
      }

      // A party's `guestIds` membership must stay exclusive to a single table —
      // the same invariant `assignGuestToTable` enforces. Otherwise auto-fill
      // runs independently on both tables and the untouched party members get
      // duplicated at each one.
      for (let i = 0; i < tables.length; i++) {
        if (i === targetIdx) continue;
        if (!tables[i].guestIds.includes(ref.guestId)) continue;
        // Pin the party's other members where they currently sit at their old
        // home table so moving one chip doesn't drag the whole party along.
        const auto = autoFillRefs(e.guests, tables, tables[i]);
        for (const [k, r] of Object.entries(auto)) {
          if (r.guestId !== ref.guestId) continue;
          if (r.memberIndex === ref.memberIndex) continue;
          if (!tables[i].seatAssignments![k]) tables[i].seatAssignments![k] = r;
        }
        tables[i] = {
          ...tables[i],
          guestIds: tables[i].guestIds.filter((g) => g !== ref.guestId),
        };
      }

      // Ensure the member's party is registered on the target table's guestIds so
      // exports and legacy views still see the guest.
      if (!tables[targetIdx].guestIds.includes(ref.guestId)) {
        tables[targetIdx] = {
          ...tables[targetIdx],
          guestIds: [...tables[targetIdx].guestIds, ref.guestId],
        };
      }

      return { ...e, seatingTables: tables };
    }),
  );
}


/** Clear a member's explicit seat assignment (returns them to auto-fill at their party's home table). */
export function clearMemberSeat(eventId: string, ref: SeatMemberRef) {
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      const tables = (e.seatingTables ?? []).map((t) => {
        if (!t.seatAssignments) return t;
        const next = { ...t.seatAssignments };
        for (const [k, r] of Object.entries(next)) {
          if (r.guestId === ref.guestId && r.memberIndex === ref.memberIndex) delete next[k];
        }
        return { ...t, seatAssignments: next };
      });
      return { ...e, seatingTables: tables };
    }),
  );
}

/**
 * Union-find grouping of attending guests by "keep together" rules.
 *
 * IMPORTANT: this must include guests already pinned to a locked table so
 * that a rule pairing a locked guest with an unlocked one still produces a
 * single group. Excluding locked guests here was the root cause of
 * "keep together" rules being silently ignored: the unlocked partner had no
 * union partner to merge with and was bin-packed onto an unrelated table
 * while the rule kept rendering as if nothing were wrong.
 *
 * Exported (pure, no storage access) so it can be unit tested directly.
 */
export function groupGuestsByTogetherRules(
  attendingGuests: Guest[],
  rules: SeatingRule[],
): Guest[][] {
  const parent: Record<string, string> = {};
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: string, b: string) => { parent[find(a)] = find(b); };
  for (const g of attendingGuests) parent[g.id] = g.id;
  for (const r of rules) {
    if (r.type === "together" && parent[r.guestAId] && parent[r.guestBId]) {
      union(r.guestAId, r.guestBId);
    }
  }
  const groups: Record<string, Guest[]> = {};
  for (const g of attendingGuests) {
    const k = find(g.id);
    (groups[k] ??= []).push(g);
  }
  return Object.values(groups);
}

/** Randomly redistribute attending parties across non-locked seating tables, honoring keep-together rules. Clears seatAssignments. */
export function shuffleSeating(eventId: string) {
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      const all = e.seatingTables ?? [];
      const lockedTables = all.filter((t) => t.locked && t.kind !== "element");
      const openTables = all.filter((t) => !t.locked && t.kind !== "element");
      const elements = all.filter((t) => t.kind === "element");
      const lockedGuestIds = new Set(lockedTables.flatMap((t) => t.guestIds));
      const lockedTableByGuest = new Map<string, string>();
      for (const t of lockedTables) for (const gid of t.guestIds) lockedTableByGuest.set(gid, t.id);

      // All attending guests, including ones already pinned to a locked table —
      // locked members must still participate in union-find so a rule pairing
      // them with an unlocked guest is honored (see groupGuestsByTogetherRules).
      const attendingAll = e.guests.filter((g) => g.status !== "no");
      const groupsAll = groupGuestsByTogetherRules(attendingAll, e.seatingRules ?? []);

      // Reset open tables.
      const capacityLeft = new Map<string, number>();
      const assigned = new Map<string, string[]>();
      for (const t of openTables) {
        capacityLeft.set(t.id, t.capacity);
        assigned.set(t.id, []);
      }
      // Track remaining capacity on locked tables too, since unlocked partners
      // of a locked guest get seated there rather than shuffled elsewhere.
      const lockedAssignedExtra = new Map<string, string[]>();
      const lockedCapacityLeft = new Map<string, number>();
      for (const t of lockedTables) {
        const used = t.guestIds.reduce(
          (n, gid) => n + (e.guests.find((g) => g.id === gid) ? partyMemberCount(e.guests.find((g) => g.id === gid)!) : 0),
          0,
        );
        lockedCapacityLeft.set(t.id, t.capacity - used);
        lockedAssignedExtra.set(t.id, []);
      }

      const openGroups: Guest[][] = [];
      for (const group of groupsAll) {
        const lockedMembers = group.filter((g) => lockedGuestIds.has(g.id));
        if (lockedMembers.length === 0) {
          openGroups.push(group);
          continue;
        }
        // Pin the whole group to the locked member's table (best-effort: if the
        // group spans multiple distinct locked tables, that's a genuine,
        // pre-existing conflict a rule can't silently resolve — leave those
        // extra members alone rather than guessing).
        const targetTableId = lockedTableByGuest.get(lockedMembers[0].id)!;
        for (const g of group) {
          if (lockedGuestIds.has(g.id)) continue; // already seated there
          const need = partyMemberCount(g);
          if ((lockedCapacityLeft.get(targetTableId) ?? 0) >= need) {
            lockedAssignedExtra.get(targetTableId)!.push(g.id);
            lockedCapacityLeft.set(targetTableId, (lockedCapacityLeft.get(targetTableId) ?? 0) - need);
          } else {
            // No room at the locked table — fall back to normal placement
            // rather than silently dropping the guest.
            openGroups.push([g]);
          }
        }
      }

      // Sort groups by total size desc for best-fit.
      const groupList = openGroups.sort(
        (a, b) => b.reduce((n, g) => n + partyMemberCount(g), 0) - a.reduce((n, g) => n + partyMemberCount(g), 0),
      );

      // Shuffle table order for randomness.
      const tableOrder = [...openTables].sort(() => Math.random() - 0.5);

      for (const group of groupList) {
        const need = group.reduce((n, g) => n + partyMemberCount(g), 0);
        // Find first table that fits.
        let placed = false;
        for (const t of tableOrder) {
          if ((capacityLeft.get(t.id) ?? 0) >= need) {
            for (const g of group) assigned.get(t.id)!.push(g.id);
            capacityLeft.set(t.id, (capacityLeft.get(t.id) ?? 0) - need);
            placed = true;
            break;
          }
        }
        if (!placed) {
          // Split group members individually across any table with room.
          for (const g of group) {
            const sz = partyMemberCount(g);
            const t = tableOrder.find((tt) => (capacityLeft.get(tt.id) ?? 0) >= sz);
            if (t) {
              assigned.get(t.id)!.push(g.id);
              capacityLeft.set(t.id, (capacityLeft.get(t.id) ?? 0) - sz);
            }
          }
        }
      }

      const newTables: SeatingTable[] = [
        ...openTables.map((t) => ({
          ...t,
          guestIds: assigned.get(t.id) ?? [],
          seatAssignments: {},
        })),
        ...lockedTables.map((t) => ({
          ...t,
          guestIds: [...t.guestIds, ...(lockedAssignedExtra.get(t.id) ?? [])],
        })),
        ...elements,
      ];
      // Preserve original order.
      const byId = new Map(newTables.map((t) => [t.id, t]));
      const ordered = all.map((t) => byId.get(t.id) ?? t);
      return { ...e, seatingTables: ordered };
    }),
  );
}

// ─── Timeline ───────────────────────────────────────────────────────────────


export const TIMELINE_PRESETS: { title: string; owner: string }[] = [
  { title: "Guest arrival", owner: "Host" },
  { title: "Ceremony", owner: "Officiant" },
  { title: "Cocktail hour", owner: "Caterer" },
  { title: "First dance", owner: "DJ" },
  { title: "Toasts", owner: "MC" },
  { title: "Dinner served", owner: "Caterer" },
  { title: "Cake cutting", owner: "Host" },
  { title: "Send-off", owner: "Host" },
];

export function addTimelineBlock(eventId: string, block: Omit<TimelineBlock, "id">) {
  const b: TimelineBlock = { ...block, id: uid() };
  save(load().map((e) => (e.id === eventId ? { ...e, timelineBlocks: [...(e.timelineBlocks ?? []), b] } : e)));
  return b;
}

export function updateTimelineBlock(eventId: string, blockId: string, patch: Partial<TimelineBlock>) {
  save(
    load().map((e) =>
      e.id === eventId
        ? { ...e, timelineBlocks: (e.timelineBlocks ?? []).map((b) => (b.id === blockId ? { ...b, ...patch } : b)) }
        : e,
    ),
  );
}

export function removeTimelineBlock(eventId: string, blockId: string) {
  save(
    load().map((e) =>
      e.id === eventId ? { ...e, timelineBlocks: (e.timelineBlocks ?? []).filter((b) => b.id !== blockId) } : e,
    ),
  );
}

// ─── Check-ins ─────────────────────────────────────────────────────────────

export function checkInGuest(eventId: string, guestId: string, note?: string, heads?: number) {
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      const existing = (e.checkIns ?? []).filter((c) => c.guestId !== guestId);
      return { ...e, checkIns: [...existing, { guestId, at: new Date().toISOString(), note, heads }] };
    }),
  );
}

export function undoCheckIn(eventId: string, guestId: string) {
  save(
    load().map((e) =>
      e.id === eventId ? { ...e, checkIns: (e.checkIns ?? []).filter((c) => c.guestId !== guestId) } : e,
    ),
  );
}

export function isCheckedIn(event: KEvent, guestId: string): boolean {
  return (event.checkIns ?? []).some((c) => c.guestId === guestId);
}

/** Optimistically append a walk-in guest + arrival to this device's cache. */
export function addWalkInGuestLocal(
  eventId: string,
  guest: { id: string; name: string; adults: number; children: number; note?: string },
) {
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      const row: Guest = {
        id: guest.id,
        name: guest.name,
        email: "",
        phone: "",
        status: "yes",
        adults: clampPartyCount(guest.adults),
        children: clampPartyCount(guest.children),
        dietary: guest.note,
        source: "walkin",
      };
      const heads = partyHeadcount(row);
      return {
        ...e,
        guests: [...e.guests, row],
        checkIns: [...(e.checkIns ?? []), { guestId: guest.id, at: new Date().toISOString(), heads, note: "walk-in" }],
      };
    }),
  );
}

export function isWalkIn(guest: Guest): boolean {
  return guest.source === "walkin" || guest.id.startsWith("walkin-");
}

/**
 * Real arrival headcount: sums `heads` per check-in (falling back to the
 * guest's own party size, then 1), so a party of four scanned once counts as
 * four people at the door. Shares partyHeadcount with the capacity rules so
 * the door count and the cap can never disagree.
 */
export function arrivedHeadcount(event: KEvent, filter?: (g: Guest) => boolean): number {
  let n = 0;
  for (const c of event.checkIns ?? []) {
    const g = event.guests.find((x) => x.id === c.guestId);
    if (filter && (!g || !filter(g))) continue;
    n += c.heads ?? (g ? partyHeadcount(g) : 1);
  }
  return n;
}

/** Door/host summary: invited arrivals, walk-ins and who is still expected. */
export function checkInSummary(event: KEvent) {
  const invitedExpected = event.guests.filter(
    (g) => !isWalkIn(g) && (g.status === "yes" || g.status === "maybe"),
  );
  const expectedHeads = invitedExpected.reduce((sum, g) => sum + partyHeadcount(g), 0);
  const invitedArrivedHeads = arrivedHeadcount(event, (g) => !isWalkIn(g));
  const walkInGuests = event.guests.filter(isWalkIn);
  const walkInHeads = arrivedHeadcount(event, isWalkIn);
  const invitedArrivedRows = (event.checkIns ?? []).filter((c) => {
    const g = event.guests.find((x) => x.id === c.guestId);
    return !!g && !isWalkIn(g);
  }).length;
  return {
    expectedHeads,
    invitedArrivedHeads,
    invitedArrivedRows,
    walkInHeads,
    walkInCount: walkInGuests.length,
    yetToArriveHeads: Math.max(0, expectedHeads - invitedArrivedHeads),
    totalOnSiteHeads: invitedArrivedHeads + walkInHeads,
    invitedExpected,
    walkInGuests,
  };
}


// ─── Gift fund ──────────────────────────────────────────────────────────────

export function setGiftFund(eventId: string, patch: Partial<GiftFund>) {
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      const current: GiftFund =
        e.giftFund ?? {
          enabled: false,
          label: "Honeymoon Fund",
          currency: "USD",
          presetAmounts: [25, 50, 100, 250],
          contributions: [],
        };
      return { ...e, giftFund: { ...current, ...patch } };
    }),
  );
}

export function addGiftContribution(
  eventId: string,
  c: Omit<GiftContribution, "id" | "at">,
) {
  const contribution: GiftContribution = {
    ...c,
    id: uid(),
    at: new Date().toISOString(),
  };
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      const fund: GiftFund =
        e.giftFund ?? {
          enabled: true,
          label: "Gift Fund",
          currency: "USD",
          presetAmounts: [25, 50, 100, 250],
          contributions: [],
        };
      // dedupe by sessionId
      if (c.sessionId && fund.contributions.some((x) => x.sessionId === c.sessionId)) {
        return e;
      }
      return {
        ...e,
        giftFund: { ...fund, contributions: [contribution, ...fund.contributions] },
      };
    }),
  );
  return contribution;
}

export function markContributionThanked(eventId: string, contribId: string) {
  save(
    load().map((e) => {
      if (e.id !== eventId || !e.giftFund) return e;
      return {
        ...e,
        giftFund: {
          ...e.giftFund,
          contributions: e.giftFund.contributions.map((c) =>
            c.id === contribId ? { ...c, thanked: true } : c,
          ),
        },
      };
    }),
  );
}

export function giftFundTotal(event: KEvent): number {
  return (event.giftFund?.contributions ?? []).reduce((s, c) => s + c.amount, 0);
}

// ─── Affiliate clicks ──────────────────────────────────────────────────────

export function logAffiliateClick(
  eventId: string,
  data: { store: string; url: string; registryId?: string },
) {
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      const click: AffiliateClick = {
        id: uid(),
        at: new Date().toISOString(),
        ...data,
      };
      const list = [click, ...(e.affiliateClicks ?? [])].slice(0, 500);
      return { ...e, affiliateClicks: list };
    }),
  );
}

// ─── Tip jar (multi-recipient deep-link tips) ──────────────────────────────

const DEFAULT_TIP_JAR: TipJar = {
  enabled: false,
  title: "Leave a tip",
  message: "If you'd like to leave a little extra love, tap any option below.",
  presetAmounts: [10, 20, 50, 100],
  recipients: [],
};

export function getTipJar(event: KEvent): TipJar {
  return event.tipJar ?? DEFAULT_TIP_JAR;
}

export function setTipJar(eventId: string, patch: Partial<TipJar>) {
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      const current: TipJar = e.tipJar ?? DEFAULT_TIP_JAR;
      return { ...e, tipJar: { ...current, ...patch } };
    }),
  );
}

export function addTipRecipient(eventId: string, recipient?: Partial<TipRecipient>) {
  const r: TipRecipient = {
    id: uid(),
    name: recipient?.name ?? "",
    role: recipient?.role,
    venmo: recipient?.venmo,
    cashapp: recipient?.cashapp,
    zelle: recipient?.zelle,
    paypal: recipient?.paypal,
    applePay: recipient?.applePay,
    googlePay: recipient?.googlePay,
    customLabel: recipient?.customLabel,
    customUrl: recipient?.customUrl,
    note: recipient?.note,
  };
  save(
    load().map((e) => {
      if (e.id !== eventId) return e;
      const current: TipJar = e.tipJar ?? DEFAULT_TIP_JAR;
      return { ...e, tipJar: { ...current, recipients: [...current.recipients, r] } };
    }),
  );
  return r;
}

export function updateTipRecipient(eventId: string, recipientId: string, patch: Partial<TipRecipient>) {
  save(
    load().map((e) => {
      if (e.id !== eventId || !e.tipJar) return e;
      return {
        ...e,
        tipJar: {
          ...e.tipJar,
          recipients: e.tipJar.recipients.map((r) => (r.id === recipientId ? { ...r, ...patch } : r)),
        },
      };
    }),
  );
}

export function removeTipRecipient(eventId: string, recipientId: string) {
  save(
    load().map((e) => {
      if (e.id !== eventId || !e.tipJar) return e;
      return {
        ...e,
        tipJar: {
          ...e.tipJar,
          recipients: e.tipJar.recipients.filter((r) => r.id !== recipientId),
        },
      };
    }),
  );
}
