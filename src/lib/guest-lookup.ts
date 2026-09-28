/**
 * Guest self-lookup for the public invite page.
 *
 * Invites get forwarded around by text and social, so most guests arrive
 * without a personal link and have to find themselves. Matching runs in tiers,
 * safest first, and only ever auto-opens an RSVP when the match is unique.
 * Ambiguous input returns masked candidates so the guest can pick themselves
 * without the invite leaking the guest list.
 */

export interface LookupGuest {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  /** Optional party context, used only to disambiguate identical rows. */
  adults?: number;
  children?: number;
  plusOnes?: unknown[];
}


export type LookupResult<G extends LookupGuest = LookupGuest> =
  | { kind: "empty" }
  | { kind: "match"; guest: G }
  | { kind: "candidates"; guests: G[] }
  | { kind: "too_many" }
  | { kind: "none" };

/** Lowercase, strip accents, collapse punctuation/whitespace. */
export function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string | null | undefined): string[] {
  return normalizeText(value).split(" ").filter(Boolean);
}

function digitsOf(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D+/g, "");
}

/** True when a and b differ by at most one insert, delete or substitution. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const diff = a.length - b.length;
  if (diff > 1 || diff < -1) return false;
  // Both same length: allow one substitution.
  if (diff === 0) {
    let subs = 0;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        subs += 1;
        if (subs > 1) return false;
      }
    }
    return subs === 1;
  }
  const longer = diff === 1 ? a : b;
  const shorter = diff === 1 ? b : a;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < longer.length && j < shorter.length) {
    if (longer[i] === shorter[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    i += 1;
  }
  return true;
}

/**
 * "Wren Alvarez" -> "Wren A." at level 1. Higher levels reveal more of the
 * surname (plus middle initials) so two guests who mask identically can still
 * be told apart. Never reveals a contact detail.
 */
export function maskNameAt(name: string | null | undefined, level = 1): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Guest";
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  const middles = parts.slice(1, -1).map((m) => `${m.charAt(0).toUpperCase()}.`);
  const shown = Math.max(1, Math.min(level, last.length));
  const lastLabel =
    shown >= last.length
      ? last
      : `${last.charAt(0).toUpperCase()}${last.slice(1, shown)}${shown === 1 ? "." : "…"}`;
  const mid = level >= 2 && middles.length ? ` ${middles.join(" ")}` : "";
  return `${first}${mid} ${lastLabel}`;
}

/** "Wren Alvarez" -> "Wren A." */
export function maskName(name: string | null | undefined): string {
  return maskNameAt(name, 1);
}


/**
 * Progressive email mask. Level 0 is the tightest ("w***n@gmail.com"); higher
 * levels reveal a few more characters of the local part so two guests on the
 * same domain can be told apart. The address is never shown in full unless it
 * is too short to mask meaningfully.
 */
function maskEmailAt(email: string | null | undefined, level = 0): string {
  const raw = String(email ?? "").trim();
  const at = raw.indexOf("@");
  if (at < 1) return "";
  const local = raw.slice(0, at);
  const domain = raw.slice(at);
  const head = level <= 0 ? 1 : level === 1 ? 3 : 4;
  const tail = level <= 0 ? 1 : level === 1 ? 2 : 3;
  if (local.length <= head + tail) return `${local.charAt(0)}***${domain}`;
  return `${local.slice(0, head)}***${local.slice(local.length - tail)}${domain}`;
}

/** "wren@gmail.com" -> "w***n@gmail.com" */
export function maskEmail(email: string | null | undefined): string {
  return maskEmailAt(email, 0);
}

/** "+1 (415) 555-1234" -> "(***) ***-1234" */
export function maskPhone(phone: string | null | undefined): string {
  const d = digitsOf(phone);
  if (d.length < 4) return "";
  return `(***) ***-${d.slice(-4)}`;
}

/** Masked one-liner shown in the "Is this you?" picker. Never a full address. */
export function guestHint(guest: LookupGuest): string {
  return maskEmail(guest.email) || maskPhone(guest.phone) || "";
}

function hintAt(guest: LookupGuest, level: number): string {
  const email = maskEmailAt(guest.email, level);
  const phone = maskPhone(guest.phone);
  if (level <= 0) return email || phone || "";
  return [email, phone].filter(Boolean).join(" · ");
}

/** "party of 4" when the guest brings others, otherwise "". */
function partyHint(guest: LookupGuest): string {
  const plus = Array.isArray(guest.plusOnes) ? guest.plusOnes.length : 0;
  const heads = (guest.adults ?? 1) + (guest.children ?? 0) + plus;
  return heads > 1 ? `party of ${heads}` : "";
}

export interface CandidateLabel {
  id: string;
  label: string;
  hint: string;
}

/**
 * Builds distinguishable rows for the "Is this you?" picker. Reunions are full
 * of shared surnames, so four "Tanya M." rows are useless. This reveals the
 * smallest amount of extra detail that makes every row unique: more of the
 * surname first, then more of the masked contact, then party context. Full
 * emails and phone numbers are never exposed to an unauthenticated searcher.
 */
export function describeCandidates<G extends LookupGuest>(guests: readonly G[]): CandidateLabel[] {
  const maxLevel = Math.max(
    2,
    ...guests.map((g) => String(g.name ?? "").trim().split(/\s+/).pop()?.length ?? 1),
  );
  let rows: CandidateLabel[] = [];
  for (const hintLevel of [0, 1, 2]) {
    for (let level = 1; level <= maxLevel; level += 1) {
      rows = guests.map((g) => ({
        id: g.id,
        label: maskNameAt(g.name, level),
        hint: hintAt(g, hintLevel),
      }));
      const keys = new Set(rows.map((r) => `${r.label}|${r.hint}`));
      if (keys.size === rows.length) return rows;
    }
  }
  // Still colliding (identical names and contacts): add party context.
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(`${r.label}|${r.hint}`, (counts.get(`${r.label}|${r.hint}`) ?? 0) + 1);
  return rows.map((r, i) => {
    if ((counts.get(`${r.label}|${r.hint}`) ?? 0) < 2) return r;
    const extra = partyHint(guests[i]!);
    return { ...r, hint: [r.hint, extra].filter(Boolean).join(" · ") };
  });
}



const MAX_CANDIDATES = 5;

export function lookupGuest<G extends LookupGuest>(
  guests: readonly G[],
  rawInput: string,
): LookupResult<G> {
  const raw = String(rawInput ?? "").trim();
  if (!raw) return { kind: "empty" };

  const normalized = normalizeText(raw);
  const inputDigits = digitsOf(raw);
  const inputTokens = tokens(raw);
  const list = guests.filter((g) => g && (g.name || g.email || g.phone));

  // 1 + 2. Exact email, exact phone, exact full name.
  // Collect ALL exact hits: family members can share an email or phone, and
  // reunions routinely carry two guests with the identical full name. Picking
  // the first would let someone RSVP as the wrong person, so hand ties back to
  // the guest as candidates.
  const strongHits = list.filter((g) => {
    const email = normalizeText(g.email);
    const name = normalizeText(g.name);
    const phone = digitsOf(g.phone);
    if (email && email === normalized) return true;
    if (name && name === normalized) return true;
    if (
      inputDigits.length >= 4 &&
      phone &&
      (phone === inputDigits || phone.endsWith(inputDigits) || inputDigits.endsWith(phone))
    ) {
      return true;
    }
    return false;
  });
  if (strongHits.length === 1) return { kind: "match", guest: strongHits[0]! };
  if (strongHits.length > 1) {
    return strongHits.length <= MAX_CANDIDATES
      ? { kind: "candidates", guests: strongHits }
      : { kind: "too_many" };
  }


  const tiers: Array<(g: G) => boolean> = [
    // 3. Whole name token, e.g. "Wren" or "Alvarez".
    (g) => tokens(g.name).some((t) => inputTokens.every((it) => t === it)) && inputTokens.length === 1,
    // 3b. Every typed token matches a name token exactly, in any order.
    (g) => {
      const nameTokens = tokens(g.name);
      return inputTokens.length > 1 && inputTokens.every((it) => nameTokens.includes(it));
    },
    // 4. Prefix match on any name token, e.g. "Wre" -> "Wren", "Chris" -> "Christopher".
    (g) => {
      const nameTokens = tokens(g.name);
      if (!nameTokens.length || !inputTokens.length) return false;
      return inputTokens.every((it) => it.length >= 2 && nameTokens.some((t) => t.startsWith(it)));
    },
    // 4b. Email local-part prefix, for guests who half-remember their address.
    (g) => {
      const local = normalizeText(g.email).split("@")[0] || "";
      return normalized.length >= 3 && !!local && local.startsWith(normalized);
    },
    // 5. Typo tolerance: one character off on every typed token.
    (g) => {
      const nameTokens = tokens(g.name);
      if (!nameTokens.length || !inputTokens.length) return false;
      return inputTokens.every(
        (it) =>
          it.length >= 3 &&
          nameTokens.some((t) => withinOneEdit(t, it) || (t.length > it.length && withinOneEdit(t.slice(0, it.length), it))),
      );
    },
  ];

  for (const test of tiers) {
    const hits = list.filter(test);
    if (hits.length === 1) return { kind: "match", guest: hits[0]! };
    if (hits.length > 1) {
      return hits.length <= MAX_CANDIDATES
        ? { kind: "candidates", guests: hits }
        : { kind: "too_many" };
    }
  }

  return { kind: "none" };
}
