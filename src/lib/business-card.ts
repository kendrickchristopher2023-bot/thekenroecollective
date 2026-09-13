/**
 * The digital business card, in one place.
 *
 * Every surface reads from the same record: the page, the saved contact file,
 * the email signature and the downloadable picture. Change the phone number in
 * one row and all four change together, so nothing can drift out of date.
 */

export type BusinessCard = {
  slug: string;
  full_name: string;
  role: string;
  organisation: string;
  email: string;
  /** Stored in +E.164 form. May be hidden on the page while still living in the saved contact. */
  phone: string | null;
  website: string;
  photo_url: string | null;
  /**
   * A phone number printed as plain text on a public page is harvested by
   * scrapers within days and cannot be un-collected. Off by default: the
   * number still travels inside the saved contact file.
   */
  show_phone_on_page: boolean;
  tagline: string | null;
  /**
   * A card stays off the public page until its details are filled in, so a
   * half-finished card can never be handed out by accident.
   */
  published: boolean;
};

/** The details a card cannot go live without. */
export const REQUIRED_CARD_FIELDS = [
  { key: "full_name", label: "Name" },
  { key: "role", label: "Role or title" },
  { key: "email", label: "Email address" },
] as const;

/** Which required details are still blank, in plain words for the owner console. */
export function missingCardFields(card: BusinessCard): string[] {
  return REQUIRED_CARD_FIELDS.filter((f) => !String(card[f.key] ?? "").trim()).map((f) => f.label);
}

/** True when the card has enough on it to be worth handing to a stranger. */
export function isCardReady(card: BusinessCard): boolean {
  return missingCardFields(card).length === 0;
}

/** Something to call the card while its name is still blank. */
export function cardDisplayName(card: BusinessCard): string {
  return card.full_name.trim() || `Card at /card/${card.slug}`;
}

/** 1-980-236-0667 from +19802360667, for reading aloud and for print. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

/** Website without the scheme, for showing on a card. */
export function displayWebsite(website: string): string {
  return website.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function initials(fullName: string): string {
  if (!fullName.trim()) return "?";
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function splitName(fullName: string): { given: string; family: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return { given: parts[0] ?? "", family: "" };
  return { given: parts.slice(0, -1).join(" "), family: parts[parts.length - 1]! };
}

/** A vCard line must be escaped, or a comma in a role silently splits the field. */
function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
}

/**
 * vCard 3.0, because that is what both iOS Contacts and Android Contacts open
 * without complaint. Lines are joined with CRLF, which the spec requires and
 * some Android builds enforce strictly.
 */
export function buildVCard(card: BusinessCard, cardUrl: string): string {
  const { given, family } = splitName(card.full_name);
  const lines: string[] = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(family)};${esc(given)};;;`,
    `FN:${esc(card.full_name)}`,
  ];
  if (card.organisation.trim()) lines.push(`ORG:${esc(card.organisation)}`);
  if (card.role.trim()) lines.push(`TITLE:${esc(card.role)}`);
  if (card.email.trim()) lines.push(`EMAIL;type=INTERNET;type=WORK:${esc(card.email)}`);
  if (card.phone) {
    lines.push(`TEL;type=CELL;type=VOICE:${esc(formatPhone(card.phone))}`);
  }
  lines.push(`URL;type=WORK:${esc(card.website)}`);
  if (card.photo_url) lines.push(`PHOTO;VALUE=URI:${esc(card.photo_url)}`);
  lines.push(`NOTE:${esc(`Digital card: ${cardUrl}`)}`);
  lines.push(`REV:${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}`);
  lines.push("END:VCARD");
  return lines.join("\r\n") + "\r\n";
}

export function vCardFilename(card: BusinessCard): string {
  const base = card.full_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base || card.slug}.vcf`;
}

/** Plain text signature, for anyone whose mail client strips formatting. */
export function signatureText(card: BusinessCard): string {
  const lines = [
    card.full_name,
    [card.role, card.organisation].filter((v) => v.trim()).join(", "),
    card.email,
    ...(card.phone ? [formatPhone(card.phone)] : []),
    displayWebsite(card.website),
  ];
  return lines.filter((l) => l.trim()).join("\n");
}

/**
 * HTML signature. Inline styles only and a table for layout, because that is
 * the only thing Outlook renders predictably.
 */
export function signatureHtml(card: BusinessCard, logoUrl: string): string {
  const phoneRow = card.phone
    ? `<div style="margin:0;font-size:13px;color:#1A1A1A;">${formatPhone(card.phone)}</div>`
    : "";
  return [
    `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Helvetica,Arial,sans-serif;">`,
    `<tr>`,
    `<td style="padding-right:14px;vertical-align:top;">`,
    `<img src="${logoUrl}" alt="The Kenroe Collective" width="132" style="display:block;border:0;" />`,
    `</td>`,
    `<td style="border-left:2px solid #4E211E;padding-left:14px;vertical-align:top;">`,
    `<div style="margin:0;font-size:15px;font-weight:bold;color:#4E211E;">${card.full_name}</div>`,
    `<div style="margin:0 0 6px;font-size:13px;color:#1A1A1A;">${card.role}, ${card.organisation}</div>`,
    `<div style="margin:0;font-size:13px;"><a href="mailto:${card.email}" style="color:#4E211E;text-decoration:none;">${card.email}</a></div>`,
    phoneRow,
    `<div style="margin:0;font-size:13px;"><a href="${card.website}" style="color:#4E211E;text-decoration:none;">${displayWebsite(card.website)}</a></div>`,
    `</td>`,
    `</tr>`,
    `</table>`,
  ].join("");
}
