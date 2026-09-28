/**
 * Expected outcomes are not errors.
 *
 * A gate ("this needs Atelier"), a designed limitation ("this piece was made
 * before we kept its arrangement") or a validation refusal is the system working
 * as intended. Recording those in the error monitor turns it into noise that
 * hides real problems, which is exactly what happened: a correct, well-written
 * message to a customer was sitting in the log as an OPEN error.
 *
 * Two mechanisms:
 *
 * 1. `expectedError(message)` marks a throw explicitly. The mark is a
 *    zero-width space, so even if some old screen prints `error.message`
 *    directly the customer sees nothing unusual.
 * 2. `looksExpected()` classifies un-marked throws by shape, so the hundreds of
 *    deliberate plain-language throws already in the codebase do not each need
 *    editing. Transport and authorisation failures are excluded, because those
 *    are the ones that really are broken.
 */
import { isPlainLanguage } from "@/lib/user-error";

export const EXPECTED_MARK = "\u200b";

export function expectedError(message: string): Error {
  const err = new Error(`${EXPECTED_MARK}${message}`);
  err.name = "ExpectedOutcome";
  return err;
}

export function isMarkedExpected(message: string): boolean {
  return message.startsWith(EXPECTED_MARK);
}

export function stripExpectedMark(message: string): string {
  return message.startsWith(EXPECTED_MARK) ? message.slice(EXPECTED_MARK.length) : message;
}

/**
 * Genuinely broken, even though the wording may read like a sentence. These
 * always stay in the monitor.
 */
const REAL_FAILURE: RegExp[] = [
  /failed to fetch|load failed|networkerror|network request failed/i,
  /unauthoriz|forbidden|not authenticated|no authorization header/i,
  /timed? ?out|aborted/i,
  /invalid server function id/i,
  /\b5\d\d\b/,
  /internal server error|service unavailable|bad gateway/i,
  /unexpected|undefined|null is not|is not a function/i,
];

/**
 * No sign-in at all, as opposed to a signed-in person being refused. This is a
 * visitor whose session has run out or who followed a host link while signed
 * out: the answer is to ask them to sign in, not to file a fault. A signed-in
 * caller who is refused still counts as a real failure.
 */
export function isMissingSessionError(message: string): boolean {
  return /no authorization header provided|missing authorization header|jwt expired|invalid (jwt|refresh token)/i.test(
    (message ?? "").trim(),
  );
}

/** True when this looks like a designed outcome rather than a defect. */
export function looksExpected(message: string, errorName?: string | null): boolean {
  const raw = (message ?? "").trim();
  if (!raw) return false;
  if (isMarkedExpected(raw)) return true;
  if (isMissingSessionError(raw)) return true;
  if (errorName === "ExpectedOutcome") return true;
  if (REAL_FAILURE.some((re) => re.test(raw))) return false;
  // Authored sentences only: anything machine-shaped fails isPlainLanguage.
  return isPlainLanguage(stripExpectedMark(raw));
}
