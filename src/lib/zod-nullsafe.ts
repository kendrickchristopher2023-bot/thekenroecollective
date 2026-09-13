/**
 * "Absent means absent."
 *
 * Browsers and stored briefs send three different shapes for "nothing here":
 * the key is missing, the key is `undefined`, or the key is `null`. A schema
 * field written as `.default("")` accepts the first two and rejects the third,
 * so a saved brief that stored `lockedLyrics: null` made every later compose
 * fail validation before any work started.
 *
 * `nullSafe` removes that whole class of bug: nulls are dropped before parsing,
 * so a field's default applies to all three spellings of absent, and a field
 * that is genuinely nullable is unaffected because it is optional too.
 */

import { z } from "zod";

function strip(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => strip(v, depth + 1));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null) continue;
      out[k] = strip(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Drop every null inside a payload so schema defaults can do their job. A
 * top-level null is left alone, so a genuinely missing payload still fails
 * loudly instead of quietly becoming an empty object.
 */
export function dropNulls<T>(input: T): T {
  return strip(input) as T;
}

/** Wrap a schema so nulls are read as absent rather than as a wrong type. */
export function nullSafe<S extends z.ZodTypeAny>(schema: S) {
  return z.preprocess((input) => dropNulls(input), schema);
}

