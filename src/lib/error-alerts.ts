// Which faults are worth interrupting Christopher for, and which can wait for
// the morning summary.
//
// One rule decides both, and it lives here (pure, unit tested) so the worker
// cannot drift from what we told him it would do:
//
//  - PAGE (email + text, immediately): the same fault, in production, hitting
//    several visits inside one hour. That is a broken path, not a blip.
//  - DIGEST (one email a day, no text): everything else, so nothing is lost but
//    nothing wakes him either.
//
// A dropped connection is never a page. One person losing signal on a train is
// not a fault in the product, and those reports are the noisiest thing in the
// log.

export interface ErrorRowLike {
  fingerprint: string;
  error_name: string;
  message: string;
  route?: string | null;
  source?: string | null;
  user_id?: string | null;
  created_at?: string | null;
}

export interface ErrorGroup {
  fingerprint: string;
  count: number;
  /** Distinct signed-in people affected. Anonymous visits count as one each. */
  people: number;
  name: string;
  message: string;
  route: string;
  source: string;
}

/** Same fault, this many times in the hour, and it is a page. */
export const PAGE_MIN_OCCURRENCES = 5;
/** Or this many different signed-in people, however few the total. */
export const PAGE_MIN_PEOPLE = 3;

const CONNECTION_NOISE =
  /failed to fetch|load failed|networkerror|network request failed|the network connection was lost|aborted/i;

/** A lost connection is a retry, not a fault. Never pages, never texts. */
export function isConnectionNoise(row: {
  message: string;
  error_name?: string | null;
  name?: string | null;
}): boolean {
  return CONNECTION_NOISE.test(`${row.error_name ?? row.name ?? ""} ${row.message}`);
}

/** Collapse raw rows into one entry per distinct fault. */
export function groupErrors(rows: ErrorRowLike[]): ErrorGroup[] {
  const map = new Map<string, ErrorGroup & { userIds: Set<string>; anon: number }>();
  for (const row of rows) {
    const key = row.fingerprint || `${row.error_name}:${row.message}`;
    let g = map.get(key);
    if (!g) {
      g = {
        fingerprint: key,
        count: 0,
        people: 0,
        name: row.error_name || "Error",
        message: row.message || "",
        route: row.route || "",
        source: row.source || "client",
        userIds: new Set<string>(),
        anon: 0,
      };
      map.set(key, g);
    }
    g.count += 1;
    if (row.user_id) g.userIds.add(row.user_id);
    else g.anon += 1;
  }
  return [...map.values()]
    .map(({ userIds, anon, ...g }) => ({ ...g, people: userIds.size + anon }))
    .sort((a, b) => b.count - a.count);
}

/** The faults that justify a text message right now. */
export function selectPageWorthy(groups: ErrorGroup[]): ErrorGroup[] {
  return groups.filter(
    (g) =>
      !isConnectionNoise(g) &&
      (g.count >= PAGE_MIN_OCCURRENCES || g.people >= PAGE_MIN_PEOPLE),
  );
}

function line(g: ErrorGroup): string {
  const where = g.route ? ` on ${g.route}` : "";
  return `${g.count} time${g.count === 1 ? "" : "s"}${where}: ${g.message.slice(0, 160)}`;
}

/** The immediate alert for one broken path. */
export function pageAlert(g: ErrorGroup): { title: string; lines: string[]; sms: string } {
  const where = g.route ? ` on ${g.route}` : "";
  return {
    title: `Something is failing repeatedly${where}`,
    lines: [
      `${g.count} report${g.count === 1 ? "" : "s"} in the last hour, affecting about ${g.people} visit${g.people === 1 ? "" : "s"}.`,
      `Message: ${g.message.slice(0, 300)}`,
      g.route ? `Page: ${g.route}` : "Page: not recorded",
      "Open Owner console, Problems to see the full report.",
    ],
    sms: `${g.count} failures in the last hour${where}. Check Owner console, Problems.`,
  };
}

/**
 * The once-a-day summary. Email only.
 *
 * It always says something. A quiet day used to return nothing at all, which is
 * indistinguishable from the job never running, and that is exactly how this
 * summary went unnoticed for weeks. An all-clear is the proof the job ran.
 */
export function digestAlert(
  groups: ErrorGroup[],
  dayLabel: string,
): { title: string; lines: string[] } {
  if (!groups.length) {
    return {
      title: "Yesterday's problem summary: all clear",
      lines: [
        `${dayLabel}: no faults reported by anyone using the live site.`,
        "This note is sent every day so you can tell a quiet day from a broken alarm.",
      ],
    };
  }
  const total = groups.reduce((n, g) => n + g.count, 0);
  const top = groups.slice(0, 8);
  return {
    title: `Yesterday's problem summary: ${total} report${total === 1 ? "" : "s"}`,
    lines: [
      `${dayLabel}: ${total} report${total === 1 ? "" : "s"} across ${groups.length} distinct problem${groups.length === 1 ? "" : "s"}.`,
      ...top.map(line),
      groups.length > top.length ? `And ${groups.length - top.length} more.` : "",
      "Nothing here was urgent enough to text you about.",
    ].filter(Boolean),
  };
}
