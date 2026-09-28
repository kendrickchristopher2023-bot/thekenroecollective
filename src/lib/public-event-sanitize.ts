/**
 * Public invitation payload sanitizer.
 *
 * The public event RPCs (`get_public_event_by_id` / `_by_slug`) return the
 * whole `events.data` blob. That blob is the host's working copy: it carries
 * every guest's email, phone, home address, dietary notes, accessibility
 * notes, shirt size and payment record, plus each host's personal email and
 * mobile number and the host-only thank-you drafts and check-in log.
 *
 * Invitation links are forwarded by text, posted in group chats and shared on
 * social ("Anyone with the link can RSVP"), so anything left in this payload
 * is effectively public. Everything a guest actually needs to read an
 * invitation is kept; everything else is dropped before the response leaves
 * the server.
 *
 * Two deliberate exceptions:
 *  - A host who ticks "show my contact details" opts in, so that host's email
 *    and phone survive. A host who has not ticked it never leaves the server.
 *  - The one guest who identified themselves (personal `?g=` link, or a unique
 *    self-lookup) gets their OWN record back in full, so the RSVP form can
 *    pre-fill. Nobody else's record is ever complete.
 */

/** Guest fields that are safe on a shared, forwardable link. */
const PUBLIC_GUEST_FIELDS = [
  "id",
  "name",
  "status",
  "adults",
  "children",
  "pets",
  "category",
] as const;

/**
 * Event-level keys that are host operational data, never guest-facing.
 * `checkIns` deliberately stays: the public check-in screen reads it, and it
 * holds guest names and times rather than contact details.
 */
const HOST_ONLY_EVENT_FIELDS = [
  "thankYouCards",
  "thankYouDraft",
  "affiliateClicks",
  "reminderPresetIds",
  "reminderTimes",
  "rsvpReminderOffsetDays",
  "reminderLog",
  // Ownership marker: the host's auth user id has no business on a public link.
  "_ownerUserId",
  // Demo marker: local bookkeeping, never part of a public invitation.
  "_isDemo",
] as const;

/**
 * `shareToken` is a capability, not content: it unlocks the door-staff
 * check-in screen, QR cards and run-of-show, and authorizes check-in writes.
 * It used to ride along in every invitation payload, so any guest holding a
 * forwarded link held staff access. It is now returned only to a caller who
 * already presented the matching token in the URL (`?t=`).
 */
const SHARE_TOKEN_FIELD = "shareToken";


type Row = Record<string, unknown>;

function isRow(v: unknown): v is Row {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Named plus-ones: keep the name (it appears on the invitation) and nothing else. */
function publicPlusOnes(value: unknown, withNames: boolean): unknown {
  if (!Array.isArray(value)) return undefined;
  return value.map((p) => {
    if (!isRow(p)) return {};
    const out: Row = {};
    if (withNames && typeof p.name === "string") out.name = p.name;
    if (typeof p.isChild === "boolean") out.isChild = p.isChild;
    return out;
  });
}

/**
 * Strip one guest row down to the shared-link-safe shape.
 *
 * `withNames` is false on an ordinary forwardable invitation link. A card, text
 * or social post carrying the link would otherwise hand a stranger the whole
 * family: 200+ names paired with who accepted and who declined. Names survive
 * only for door staff holding the matching `?t=` token, or when the host has
 * deliberately opened the guest list.
 */
export function publicGuest(guest: unknown, withNames = false): Row {
  if (!isRow(guest)) return {};
  const out: Row = {};
  for (const key of PUBLIC_GUEST_FIELDS) {
    if (guest[key] !== undefined) out[key] = guest[key];
  }
  if (!withNames) delete out.name;
  const plus = publicPlusOnes(guest.plusOnes, withNames);
  if (plus !== undefined) out.plusOnes = plus;
  return out;
}


/** Strip one host row: contact details only when that host opted in. */
export function publicHost(host: unknown): Row {
  if (!isRow(host)) return {};
  const { email, phone, ...rest } = host;
  const out: Row = { ...rest };
  if (host.showContact === true) {
    if (email !== undefined) out.email = email;
    if (phone !== undefined) out.phone = phone;
  }
  return out;
}

/**
 * Sanitize a raw public event blob.
 *
 * @param raw        the blob from the SECURITY DEFINER RPC
 * @param guestId    the guest who proved who they are, if any; their own row is
 *                   returned in full so the RSVP form can pre-fill
 * @param shareToken the `?t=` token the caller presented, if any; the event's
 *                   own share token survives only on an exact match
 */
export function sanitizePublicEvent(
  raw: unknown,
  guestId?: string | null,
  shareToken?: string | null,
): Row | null {
  if (!isRow(raw)) return null;
  const out: Row = { ...raw };

  // The database adds this trusted marker outside the host-authored blob.
  // Keep it as internal presentation state so invitations can disclose that
  // they are demos without exposing a mutable host field.
  delete out.isDemoInvitation;

  for (const key of HOST_ONLY_EVENT_FIELDS) delete out[key];
  if (raw.isDemoInvitation === true) out._isDemo = true;

  const realToken = raw[SHARE_TOKEN_FIELD];
  const tokenProven =
    typeof realToken === "string" &&
    realToken.length > 0 &&
    typeof shareToken === "string" &&
    shareToken === realToken;
  if (!tokenProven) delete out[SHARE_TOKEN_FIELD];

  if (Array.isArray(raw.hosts)) out.hosts = raw.hosts.map(publicHost);

  // Door staff (matching `?t=`) need names to check people in, and a host who
  // ticked "open guest list" chose to publish them. Nobody else gets them.
  const namesAllowed = tokenProven || raw.openGuestList === true;

  if (Array.isArray(raw.guests)) {
    out.guests = raw.guests.map((g) => {
      const identified =
        !!guestId && isRow(g) && typeof g.id === "string" && g.id === guestId;
      return identified ? g : publicGuest(g, namesAllowed);
    });
  }


  return out;
}


/** The full record of one guest, for a caller that has identified as them. */
export function findGuestRecord(raw: unknown, guestId: string): Row | null {
  if (!isRow(raw) || !Array.isArray(raw.guests)) return null;
  const hit = raw.guests.find((g) => isRow(g) && g.id === guestId);
  return isRow(hit) ? hit : null;
}

