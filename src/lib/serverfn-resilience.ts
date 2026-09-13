import { createMiddleware } from "@tanstack/react-start";

import {
  captureAppError,
  isTransportAbort,
  maybeNotifyStaleBuild,
  notifyConnectionLost,
} from "@/lib/error-capture-client";
import { shortServerFnName } from "@/lib/serverfn-name";
import { toUserMessage } from "@/lib/user-error";

/**
 * Keep authored sentences (including expected-outcome throws) exactly as they
 * are; replace machine output with one readable sentence. The Error identity is
 * preserved where nothing needed changing so existing message checks still work.
 */
function sanitizeForDisplay(error: unknown): unknown {
  if (error == null || typeof error !== "object") return error;
  const err = error as Error & { statusCode?: number };
  if (typeof err.message !== "string" || !err.message) return error;
  const safe = toUserMessage(err);
  if (safe === err.message) return error;
  const replacement = new Error(safe);
  replacement.name = err.name;
  if (err.stack) replacement.stack = err.stack;
  return replacement;
}




/**
 * A tab left open across a deploy still holds the previous build's chunk ids.
 * The next server call then fails with "Invalid server function ID" (or a
 * chunk-load failure), which surfaced as a silent no-op: the guest tapped
 * RSVP, or a host submitted a vendor quote request, and nothing happened.
 * maybeNotifyStaleBuild() tells them the page is out of date and offers a
 * one-tap refresh.
 */

/**
 * Client-side middleware applied to every server function call. It never
 * changes behaviour on success and always rethrows, so callers keep their own
 * error handling; it only guarantees that a failed RPC is (a) attributed to the
 * function that failed rather than to whatever page the visitor was on, and
 * (b) visible to the visitor when the cause is a stale bundle.
 */
export const serverFnResilience = createMiddleware({ type: "function" }).client(
  async (options) => {
    const { next } = options;
    // TanStack exposes the failing call as serverFnMeta.id (plus the source
    // filename). The old code read a non-existent `functionId`, which is why
    // every logged failure read "serverFn:unknown" and was unactionable.
    const meta = options as unknown as {
      serverFnMeta?: { id?: string };
      filename?: string;
      functionId?: string;
    };
    const name = shortServerFnName(
      meta.serverFnMeta?.id ?? meta.functionId ?? meta.filename ?? "",
    );

    try {
      return await next();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      // A dropped connection deserves one quiet second attempt: a tap that
      // landed on a flaky moment used to look like a silent failure.
      if (isTransportAbort(message)) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 700));
          return await next();
        } catch (retryError) {
          notifyConnectionLost();
          throw retryError;
        }
      }
      maybeNotifyStaleBuild(error);
      captureAppError(error, { source: `serverFn:${name}` });
      // Last gate before a screen: the raw detail has just been logged for the
      // owner, so anything machine-shaped is replaced by one sentence. Authored
      // plain-language refusals pass through untouched.
      throw sanitizeForDisplay(error);
    }
  },

);

