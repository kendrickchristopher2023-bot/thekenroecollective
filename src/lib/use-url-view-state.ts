// Keep in-page view state (which step, tab, page, or open record) in the URL so
// a real browser refresh restores exactly where the user was instead of
// dropping them on the first step.
//
// Router search params are typed per route, so these helpers read and write the
// raw location search. Every write uses `replace: true` — a tab switch should
// not stack history entries the back button has to chew through.
import { useCallback, useMemo } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";

function currentSearch(search: unknown): Record<string, unknown> {
  return search && typeof search === "object" ? { ...(search as Record<string, unknown>) } : {};
}

/** Read one string search param, narrowed to `allowed` when provided. */
export function useUrlParam(key: string, allowed?: readonly string[]): string | undefined {
  const search = useRouterState({ select: (s) => s.location.search });
  return useMemo(() => {
    const raw = currentSearch(search)[key];
    if (typeof raw !== "string" || raw === "") return undefined;
    if (allowed && !allowed.includes(raw)) return undefined;
    return raw;
    // `allowed` is a literal tuple at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, key]);
}

/** Setter that merges keys into the current URL search. Empty values are removed. */
export function useSetUrlParams(): (patch: Record<string, string | undefined | null>) => void {
  const router = useRouter();
  return useCallback(
    (patch) => {
      const next = currentSearch(router.state.location.search);
      let changed = false;
      for (const [k, v] of Object.entries(patch)) {
        const value = v == null || v === "" ? undefined : String(v);
        if (next[k] === value) continue;
        if (value === undefined) delete next[k];
        else next[k] = value;
        changed = true;
      }
      if (!changed) return;
      void router.navigate({ to: router.state.location.pathname, search: next as never, replace: true });
    },
    [router],
  );
}

/**
 * URL-backed view state with a default: `[value, setValue]`, where the value
 * lives in `?key=` and survives a hard refresh.
 */
export function useUrlViewState<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): [T, (next: T) => void] {
  const raw = useUrlParam(key, allowed as readonly string[]);
  const setParams = useSetUrlParams();
  const value = (raw as T | undefined) ?? fallback;
  const set = useCallback(
    (next: T) => setParams({ [key]: next === fallback ? undefined : next }),
    [setParams, key, fallback],
  );
  return [value, set];
}
