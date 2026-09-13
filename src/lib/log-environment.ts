/**
 * Which environment a report came from, decided by the hostname that served the
 * page rather than by a build flag.
 *
 * Why the hostname: the development preview is itself a production build, so
 * NODE_ENV said "production" for it and my own preview sessions were written
 * into the live problem log. Fourteen of the eighteen reports in the largest
 * group in the log turned out to be the preview, not customers, which is
 * exactly the phantom this prevents.
 *
 * The demo site is deliberately treated as real: customers are shown it, so a
 * fault there is a fault worth knowing about.
 */
export type LogEnvironment = "production" | "preview" | "development";

export function classifyLogEnvironment(host: string | null | undefined): LogEnvironment {
  const h = (host ?? "").toLowerCase().split(":")[0]!.trim();
  if (!h) return "production";
  if (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "[::1]" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local")
  ) {
    return "development";
  }
  // Lovable preview hostnames: id-preview--<id>.lovable.app and
  // project--<id>-dev.lovable.app.
  if (h.includes("id-preview--") || /-dev\.lovable\.app$/.test(h) || /^preview--/.test(h)) {
    return "preview";
  }
  return "production";
}

/** True when a report must NOT be written to the live problem log. */
export function isLoggableEnvironment(host: string | null | undefined): boolean {
  return classifyLogEnvironment(host) === "production";
}
