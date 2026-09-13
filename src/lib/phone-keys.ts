/**
 * One place that decides how a phone number is matched against the consent and
 * opt-out records.
 *
 * The consent table was written by several different paths over time, so the
 * same US number exists both as 10 digits and as 11 digits with the leading
 * country code (for example 4043580626 and 14043580626). A digits-only compare
 * therefore missed opt-outs: a guest who replied STOP against one form could
 * still be texted through the other. Every lookup now compares all plausible
 * forms, and every new record is written in one canonical form.
 */

/** Digits only, with a leading US country code removed. */
export function canonicalPhone(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/** Every stored form the same number could appear as. */
export function phoneKeys(raw: string): string[] {
  const canon = canonicalPhone(raw);
  if (!canon) return [];
  const keys = new Set<string>([canon]);
  if (canon.length === 10) keys.add(`1${canon}`);
  return Array.from(keys);
}
