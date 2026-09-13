// Recovery for stale lazy-loaded chunks.
//
// After a new build is deployed, an already-open tab still points at the old
// asset hashes. Any `await import(...)` then fails with
// "Failed to fetch dynamically imported module: .../assets/<name>-<hash>.js".
// This is not a code bug: the file genuinely no longer exists. The only real
// fix is to reload so the tab picks up the new manifest, so we do that once
// (guarded by sessionStorage to avoid a reload loop).

const RELOAD_FLAG = "kc:chunk-reload";

export function isStaleChunkError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? "");
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Unable to preload CSS/i.test(msg)
  );
}

function reloadOnce(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return false;
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    /* private mode: fall through and reload anyway */
  }
  window.location.reload();
  return true;
}

/** Clear the guard after a successful load so a later deploy can recover too. */
export function clearChunkReloadGuard() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* ignore */
  }
}

/**
 * Run a dynamic import with one retry, then a single page reload if the chunk
 * is genuinely gone (new deploy). Throws a human-readable error if recovery
 * has already been attempted.
 */
export async function importChunk<T>(loader: () => Promise<T>): Promise<T> {
  try {
    const mod = await loader();
    clearChunkReloadGuard();
    return mod;
  } catch (err) {
    if (!isStaleChunkError(err)) throw err;
    // One immediate retry covers transient network blips.
    try {
      const mod = await loader();
      clearChunkReloadGuard();
      return mod;
    } catch (err2) {
      if (!isStaleChunkError(err2)) throw err2;
      if (reloadOnce()) {
        // Keep the caller pending while the page navigates away.
        await new Promise(() => {});
      }
      throw new Error(
        "This page was updated in the background. Please refresh and try again.",
      );
    }
  }
}

/** Global net for stale-chunk failures raised outside importChunk. */
export function installChunkErrorRecovery() {
  if (typeof window === "undefined") return;
  const handler = (err: unknown) => {
    if (isStaleChunkError(err)) reloadOnce();
  };
  window.addEventListener("error", (e) => handler(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => handler(e.reason));
}
