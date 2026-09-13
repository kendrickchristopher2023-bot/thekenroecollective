// Single source of truth for programmatic tier limits.
//
// Enforcement code (server gates, sync functions, quota checks) imports
// from HERE. Presentation/docs code (FAQ, tutorials, pricing UI, chatbot,
// upgrade modals, settings billing) imports from `tier-config.ts`, which
// re-exports these constants so numbers never drift between the two.
//
// This file contains ONLY numbers + type-safe helpers. No copy, no
// marketing strings, no feature lists — keep it small so the enforcement
// surface is auditable at a glance.

export type TierKey = "postcard" | "whisper" | "host" | "atelier";

export interface TierLimits {
  activeEvents: number;
  guestsPerEvent: number;
  projectSeats: number;
  smsRemindersPerEvent: number;
  /**
   * Collaborators (co-hosts + viewers) a host may have on ONE event. Seats are
   * always drawn from the EVENT OWNER's tier — a collaborator's own account and
   * its allowances are untouched by events shared with them.
   */
  collaboratorSeats: number;
}

const INF = Number.POSITIVE_INFINITY;

// Base tier limits. `projectSeats` here is what the tier includes WITHOUT
// the Project Management add-on. NO tier includes seats by default —
// Project Management is a paid add-on for every tier, including Atelier.
export const TIER_LIMITS: Record<TierKey, TierLimits> = {
  postcard: { activeEvents: 1, guestsPerEvent: 75, projectSeats: 0, smsRemindersPerEvent: 0, collaboratorSeats: 0 },
  // SMS is Host/Atelier-only for free. Whisper is 0 here on purpose — Postcard
  // and Whisper unlock SMS by buying the `sms_pack_addon` (see SMS_PACK_*).
  whisper: { activeEvents: 3, guestsPerEvent: 150, projectSeats: 0, smsRemindersPerEvent: 0, collaboratorSeats: 1 },
  host: { activeEvents: 10, guestsPerEvent: 750, projectSeats: 0, smsRemindersPerEvent: 50, collaboratorSeats: 2 },
  atelier: { activeEvents: INF, guestsPerEvent: INF, projectSeats: 0, smsRemindersPerEvent: INF, collaboratorSeats: 5 },
};

/** Days an unaccepted collaborator invitation stays valid (matches pm_invites). */
export const COLLABORATOR_INVITE_TTL_DAYS = 14;


// Effective project-seat cap when the PM add-on is active. The count
// includes the project owner — a "seat" is a person with access.
//
// Projects is a standalone venture: a customer with the PM add-on and no paid
// Events plan gets the same 5 seats as Host, rather than being pinned to the
// old 3-seat Postcard floor. Larger teams are handled through /contact — there
// are deliberately no separate Projects seat SKUs.
export const PM_ADDON_SEAT_LIMITS: Record<TierKey, number> = {
  postcard: 5,
  whisper: 5,
  host: 5,
  atelier: 20,
};

export function isUnlimited(n: number): boolean {
  return !Number.isFinite(n);
}

export function getTierLimits(tier: TierKey): TierLimits {
  return TIER_LIMITS[tier];
}

/**
 * Effective project-seat limit for a project owner.
 * PM is a paid add-on for ALL tiers, including Atelier. Without the
 * add-on, every tier gets 0 seats and no PM access.
 */
export function getEffectiveProjectSeats(tier: TierKey, hasPmAddon: boolean): number {
  if (!hasPmAddon) return 0;
  return PM_ADDON_SEAT_LIMITS[tier];
}

// ---------------------------------------------------------------------------
// SMS entitlement
// ---------------------------------------------------------------------------
// Free SMS is Host/Atelier only. Postcard and Whisper unlock sending by buying
// the one-time `sms_pack_addon` ($6, profiles.sms_pack_enabled). The paid
// unlock grants the Host per-event allowance.
export const SMS_PACK_PRICE_ID = "sms_pack_addon";
export const SMS_PACK_PER_EVENT_ALLOWANCE = TIER_LIMITS.host.smsRemindersPerEvent;

/** Per-event SMS cap once the paid add-on is taken into account. */
export function getEffectiveSmsCap(tier: TierKey, smsPackPaid: boolean): number {
  const base = TIER_LIMITS[tier].smsRemindersPerEvent;
  if (!smsPackPaid) return base;
  if (isUnlimited(base)) return base;
  return Math.max(base, SMS_PACK_PER_EVENT_ALLOWANCE);
}

/** Whether the account may send SMS at all. */
export function canSendSms(tier: TierKey, smsPackPaid: boolean): boolean {
  return getEffectiveSmsCap(tier, smsPackPaid) > 0;
}
