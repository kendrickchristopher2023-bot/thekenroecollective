/**
 * Duplicate detection for manual guest adds.
 *
 * Bulk import already skips exact email/phone/name key matches, but the single
 * add box, the contacts picker, walk-ins and guest self-add all appended blindly.
 * On a reunion where several committee members enter the same relative that
 * silently doubles the headcount and the money owed.
 *
 * Pure and dependency-free so it can run in the browser and in a server function.
 */
import { normalizeText, withinOneEdit } from "@/lib/guest-lookup";

export interface DupCandidateGuest {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
}

export type DupReason = "email" | "phone" | "name" | "similar_name";

export interface DuplicateMatch<G extends DupCandidateGuest = DupCandidateGuest> {
  guest: G;
  reason: DupReason;
  /** True when the two records are certainly the same person. */
  exact: boolean;
}

function digits(value: string | null | undefined): string {
  const d = String(value ?? "").replace(/\D+/g, "");
  // Compare on the last 10 digits so +1 country codes still match.
  return d.length > 10 ? d.slice(-10) : d;
}

function sortedNameKey(value: string | null | undefined): string {
  // Commas so "Kendrick, Monica" keys the same as "Monica Kendrick".
  return normalizeText(String(value ?? "").replace(/,/g, " ")).split(" ").filter(Boolean).sort().join(" ");
}

export const DUP_REASON_LABELS: Record<DupReason, string> = {
  email: "same email address",
  phone: "same phone number",
  name: "same name",
  similar_name: "a very similar name",
};

/**
 * Best duplicate candidate for a guest about to be added, or null when the
 * record looks new. Strongest signal wins: email, then phone, then an exact
 * name, then a one-typo name.
 */
export function findDuplicateGuest<G extends DupCandidateGuest>(
  guests: readonly G[],
  incoming: { name?: string; email?: string; phone?: string },
  options: { ignoreId?: string } = {},
): DuplicateMatch<G> | null {
  const email = normalizeText(incoming.email);
  const phone = digits(incoming.phone);
  const nameKey = sortedNameKey(incoming.name);
  if (!email && !phone && !nameKey) return null;

  let similar: DuplicateMatch<G> | null = null;

  for (const g of guests) {
    if (options.ignoreId && g.id === options.ignoreId) continue;
    if (email && normalizeText(g.email) === email) return { guest: g, reason: "email", exact: true };
    if (phone && phone.length >= 7 && digits(g.phone) === phone)
      return { guest: g, reason: "phone", exact: true };
    const existingName = sortedNameKey(g.name);
    if (!nameKey || !existingName) continue;
    if (existingName === nameKey) return { guest: g, reason: "name", exact: true };
    // One typo apart, and only when both sides have a real full name, so
    // "Chris Kendrick" never collides with "Chris Kendricks Jr".
    if (
      !similar &&
      nameKey.length >= 6 &&
      existingName.split(" ").length === nameKey.split(" ").length &&
      withinOneEdit(existingName, nameKey)
    ) {
      similar = { guest: g, reason: "similar_name", exact: false };
    }
  }

  return similar;
}

/** Sentence a host reads in the "add anyway?" prompt. */
export function describeDuplicate(match: DuplicateMatch): string {
  const who = (match.guest.name ?? "").trim() || "an existing guest";
  return `${who} is already on this list with ${DUP_REASON_LABELS[match.reason]}.`;
}
