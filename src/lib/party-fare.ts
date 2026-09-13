// One contract for attendance fare, shared by every mirror of the math.
//
// The host store, the reconciliation report, the payment reminder worker and the
// payment messaging helper all used to compute "what does this party owe" on
// their own. They drifted: the reconciliation report billed every head at the
// adult rate and ignored `paymentAmountChild`, so a family with kids could be
// shown as owing more than the invite page ever asked them for.
//
// Pure and dependency-free on purpose so it can run in the browser, in a server
// function, and inside the cron worker off the raw stored event JSON.

type AnyRec = Record<string, any>;

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Plus-ones the guest actually named. Blank rows are not heads. */
export function namedPlusOneCount(g: AnyRec | null | undefined): number {
  return Array.isArray(g?.plusOnes)
    ? g!.plusOnes.filter((p: AnyRec) => String(p?.name ?? "").trim().length > 0).length
    : 0;
}

/** Named plus-ones flagged as children (billed at the child rate). */
export function namedChildPlusOneCount(g: AnyRec | null | undefined): number {
  return Array.isArray(g?.plusOnes)
    ? g!.plusOnes.filter(
        (p: AnyRec) => String(p?.name ?? "").trim().length > 0 && !!p?.isChild,
      ).length
    : 0;
}

/** Adults we bill: the guest's own adult count plus named plus-ones who are not children. */
export function billableAdultCount(g: AnyRec | null | undefined): number {
  return Math.max(0, num(g?.adults, 1)) + namedPlusOneCount(g) - namedChildPlusOneCount(g);
}

/**
 * Attendance fare from raw counts: adults at the adult rate, children at the
 * child rate (falling back to the adult rate when the host never set one).
 * A per-guest override replaces the adult rate only, never the child rate
 * derivation, and a party with nobody attending owes nothing.
 */
export function fareFromCounts(
  data: AnyRec,
  adults: number,
  children: number,
  adultOverride?: number,
): number {
  const perAdult = adultOverride ?? num(data?.paymentAmount);
  const childRaw = data?.paymentAmountChild;
  const perChild =
    childRaw === undefined || childRaw === null || childRaw === "" ? perAdult : num(childRaw);
  const a = Math.max(0, num(adults));
  const c = Math.max(0, num(children));
  if (a + c === 0) return 0;
  return perAdult * a + perChild * c;
}

/** Attendance fare for one guest party. Child plus-ones are billed at the child rate. */
export function attendanceFare(data: AnyRec, g: AnyRec): number {
  return fareFromCounts(
    data,
    billableAdultCount(g),
    num(g?.children) + namedChildPlusOneCount(g),
    g?.payment?.amount,
  );
}
