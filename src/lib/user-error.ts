/**
 * One gate between an internal failure and a person reading a screen.
 *
 * Nothing raw ever reaches a customer: not a Zod validation object, not a
 * Postgres message naming a table, not an upstream provider's JSON body, not a
 * stack trace. Those are logged where they are useful and replaced on screen by
 * a sentence that says what went wrong and what to do next.
 *
 * Messages we wrote deliberately for people ("That piece can't be found in
 * your library.") pass through untouched, because they already do that job.
 */

/** Anything that smells like machine output rather than a sentence. */
const MACHINE_MARKERS: RegExp[] = [
  /"code"\s*:/i,
  /"path"\s*:\s*\[/i,
  /invalid_type|invalid_literal|invalid_enum_value|unrecognized_keys|too_(small|big)/i,
  /^\s*[[{]/,
  /\bZodError\b/i,
  /permission denied for (table|schema|relation)/i,
  /row-level security/i,
  /violates (foreign key|check|unique|not-null)/i,
  /\bpostgrest\b|\bpgrst\d+\b/i,
  /Expected \d+ parts in JWT/i,
  /\bat [A-Za-z$_][\w$.]* \(/, // stack frame
  /\bTypeError\b|\bReferenceError\b|\bSyntaxError\b/,
  /undefined is not|cannot read propert/i,
  /\bfetch failed\b|\bECONNRESET\b|\bENOTFOUND\b/i,
  /xi-api-key|api[_-]?key/i,
  /<!doctype html|<html/i,
  /\bstatus\s*(code)?\s*[:=]\s*\d{3}\b/i,
];

const GENERIC =
  "Something went wrong on our side. Nothing was charged. Please try again, and contact us if it keeps happening.";

function rawMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const obj = e as { message?: unknown; error?: unknown; body?: unknown };
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
    if (typeof obj.body === "string") return obj.body;
    try {
      return JSON.stringify(e);
    } catch {
      return "";
    }
  }
  return "";
}

/** True when this text is safe to show a customer as-is. */
export function isPlainLanguage(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 300) return false;
  if (MACHINE_MARKERS.some((re) => re.test(t))) return false;
  // A sentence has spaces and no code punctuation soup.
  if (!/\s/.test(t)) return false;
  return true;
}

/**
 * The message to show a person.
 *
 * @param e        whatever was thrown or returned
 * @param fallback what to say when the failure is not something we can explain
 */
export function toUserMessage(e: unknown, fallback: string = GENERIC): string {
  // Deliberate "expected outcome" throws carry an invisible marker so the
  // monitor can skip them; it must never reach a screen.
  const raw = rawMessage(e).replace(/\u200b/g, "");
  const text = raw.toLowerCase();


  // Log the real thing. This is the only place the detail is kept.
  if (raw) {
    // eslint-disable-next-line no-console
    console.error("[error]", raw.slice(0, 2000));
  }

  if (isPlainLanguage(raw)) return raw;

  if (/"code"\s*:|invalid_type|zoderror|too_small|too_big|invalid_enum/i.test(raw)) {
    return "Some of the details in that form weren't accepted. Please check the fields you changed and try again. If everything looks right, reload the page and start the step again.";
  }
  if (/permission denied|row-level security|42501/.test(text)) {
    return "We couldn't complete that because of a permissions problem on our side. Nothing was lost, please try again in a moment or contact us.";
  }
  if (/duplicate key|already exists|23505/.test(text)) {
    return "That already exists, so nothing new was created.";
  }
  if (/violates foreign key|23503/.test(text)) {
    return "Something this depends on is missing. Please refresh the page and try again.";
  }
  if (/violates check constraint|23514|not-null/.test(text)) {
    return "Some of the details entered aren't valid. Please review the form and try again.";
  }
  if (/timeout|timed out|fetch failed|network|econnreset|enotfound|502|503|504/.test(text)) {
    return "The connection dropped before we could finish. Please try again.";
  }
  if (/rate limit|429|quota/.test(text)) {
    return "That service is busy right now. Please wait a moment and try again.";
  }
  if (/unauthorized|401|not signed in|jwt/.test(text)) {
    return "Your session expired. Please sign in again and retry.";
  }
  return fallback;
}

/**
 * Validate a server function's input without leaking the validator's output.
 *
 * The parse detail is logged server-side, where it is genuinely useful, and the
 * caller gets one sentence. This is what stopped a Zod object rendering on the
 * composer screen.
 */
export function parseInput<T>(
  schema: { parse: (input: unknown) => T },
  input: unknown,
  label: string,
): T {
  try {
    return schema.parse(input);
  } catch (e) {
    const detail = (e as { issues?: unknown })?.issues ?? rawMessage(e);
    // eslint-disable-next-line no-console
    console.error(`[validation] ${label}`, JSON.stringify(detail).slice(0, 2000));
    throw new Error(
      "Some of the details sent with that request weren't accepted. Please reload the page and try that step again, and contact us if it keeps happening.",
    );
  }
}
