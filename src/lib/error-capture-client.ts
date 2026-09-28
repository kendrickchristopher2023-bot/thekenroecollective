// Client-side capture that feeds the owner-only error monitor.
// Dedupes identical errors for 60s per session so an error loop can't flood
// the log, and never throws (monitoring must not break the app).
import { logAppError } from "@/lib/error-monitoring.functions";
import { looksExpected } from "@/lib/expected-outcome";
import { classifyLogEnvironment } from "@/lib/log-environment";


const recent = new Map<string, number>();
const WINDOW_MS = 60_000;

/**
 * Browser quirks that are not application bugs and cannot be fixed in app code.
 * They are dropped before logging so the Error Monitoring report stays a list of
 * real problems. Nothing user-facing is suppressed: these never affect what a
 * visitor sees.
 *
 * - "ResizeObserver loop completed with undelivered notifications": Chrome fires
 *   this whenever an observed element resizes twice in one frame. Benign.
 */
const IGNORED_PATTERNS: RegExp[] = [
  /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/i,
  // A bare "Script error." is what a browser reports for a failure inside a
  // script it will not describe (an extension, a translation tool, a blocked
  // third party). It carries no message, no file and no line, so it can never
  // be acted on.
  /^script error\.?$/i,
  // The page is simply from a previous release; the visitor is offered a
  // refresh, so it is not a fault in the app.
  /invalid server function id/i,
  // Nobody was signed in. The answer is to ask them to sign in.
  /no authorization header provided|missing authorization header/i,
];

export function isIgnorable(message: string): boolean {
  return IGNORED_PATTERNS.some((re) => re.test(message));
}


function shouldSend(key: string): boolean {
  const now = Date.now();
  for (const [k, at] of recent) if (now - at > WINDOW_MS) recent.delete(k);
  if (recent.has(key)) return false;
  recent.set(key, now);
  return true;
}

/**
 * A browser cancels every request in flight when the page is left, reloaded or
 * closed, and the cancellation arrives in JavaScript as a bare
 * "Failed to fetch". Those were being written to the log as faults, which is
 * why the biggest group in the monitor was a transport error spread evenly
 * across unrelated pages: it was people navigating away mid-request, not a
 * broken page. Real offline or server-side transport failures still log,
 * because the page is not going away when they happen.
 */
let leavingPage = false;
if (typeof window !== "undefined") {
  const leave = () => {
    leavingPage = true;
  };
  window.addEventListener("pagehide", leave);
  window.addEventListener("beforeunload", leave);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") leavingPage = true;
  });
}

export function isTransportAbort(message: string): boolean {
  return /^(typeerror: )?(failed to fetch|load failed|network(error| request failed))/i.test(
    message.trim(),
  );
}

let connectionNoticeAt = 0;

/**
 * A lost connection is told to the visitor in their own words, once every 15
 * seconds at most, instead of being filed as an application fault.
 */
export function notifyConnectionLost() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - connectionNoticeAt < 15_000) return;
  connectionNoticeAt = now;
  void import("sonner").then(({ toast }) => {
    toast.error("Check your connection and try again.");
  });
}

/** Only for tests: reset the "page is going away" latch. */
export function __resetLeavingPage() {
  leavingPage = false;
}

export function captureAppError(
  error: unknown,
  meta: { source?: string; route?: string } = {},
) {
  if (typeof window === "undefined") return;
  // Development and preview sessions are never written to the live problem log.
  if (classifyLogEnvironment(window.location.host) !== "production") return;
  try {
    const err = error instanceof Error ? error : undefined;
    const message = err?.message ?? String(error ?? "Unknown error");
    const errorName = err?.name ?? "Error";
    const stack = err?.stack ?? null;
    if (isIgnorable(message)) return;
    const source = meta.source ?? "client";
    // Never log the logger: when the monitor's own call fails it produces a
    // fresh error, which logged another, which is how a single hiccup became a
    // pile of identical rows.
    if (source.includes("error-monitoring") || source.includes("logAppError")) return;
    // A refused server call that carries an authored explanation is a designed
    // outcome, not a defect; keeping those out of the log is what makes the
    // monitor readable.
    if (source.startsWith("serverFn:") && looksExpected(message, errorName)) return;
    // A dropped connection is a connection problem, not a defect in the app:
    // the visitor is told to check their connection and the call is retried,
    // so it is not recorded as a fault. (leavingPage still matters for the
    // silent case where the browser cancelled the request on navigation.)
    if (isTransportAbort(message)) return;
    void leavingPage;
    const key = `${errorName}|${message.slice(0, 120)}`;
    if (!shouldSend(key)) return;




    void logAppError({
      data: {
        message,
        errorName,
        stack,
        route: meta.route ?? window.location.pathname,
        source,
        userAgent: navigator.userAgent,
      },
    } as any).catch(() => {
      /* monitoring is best-effort */
    });
  } catch {
    /* never break the app because of monitoring */
  }
}

let installed = false;
let staleBuildNotified = false;

/**
 * After a deploy, a tab left open still holds the previous build's chunk ids, so
 * the next action fails with "Invalid server function ID". The action itself is
 * fine, the page is just stale, so tell the visitor how to recover instead of
 * leaving them with a silent failure (this was hitting guest RSVP saves).
 */
export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    /Invalid server function ID/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

export function maybeNotifyStaleBuild(error: unknown) {
  if (!isStaleBuildError(error) || staleBuildNotified) return;
  staleBuildNotified = true;
  void import("sonner").then(({ toast }) => {
    toast.error("This page is out of date. Refresh to load the latest version, then try again.", {
      duration: Infinity,
      action: { label: "Refresh", onClick: () => window.location.reload() },
    });
  });
}

/** Installs window-level handlers once (called from the root route). */
export function installGlobalErrorCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) => {
    const err = (event as ErrorEvent).error ?? (event as ErrorEvent).message;
    maybeNotifyStaleBuild(err);
    captureAppError(err, { source: "window.onerror" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    maybeNotifyStaleBuild(reason);
    captureAppError(reason, { source: "unhandledrejection" });
  });
}

