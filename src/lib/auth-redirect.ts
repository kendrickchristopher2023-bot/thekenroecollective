import { toUserMessage } from "@/lib/user-error";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

/**
 * Single place that answers: "did the user just arrive from a Supabase email
 * link / OAuth redirect, and is their session actually established?"
 *
 * Supabase links arrive in one of three shapes depending on flow type:
 *  - PKCE (current default): `?code=<code>` query param — must be exchanged.
 *  - Implicit (legacy):      `#access_token=...&refresh_token=...` hash.
 *  - Token-hash verify:      `?token_hash=...&type=recovery` query params.
 *
 * Every auth-callback page must call this instead of sniffing the URL itself,
 * otherwise it silently breaks whenever the client's flow type changes.
 */
export type AuthRedirectKind =
  | "pkce"
  | "implicit"
  | "token_hash"
  | "none";

export type AuthRedirectResult = {
  /** True when a usable session exists after processing the URL. */
  session: Session | null;
  /** What kind of auth redirect this page load looked like. */
  kind: AuthRedirectKind;
  /** Supabase's declared link type when present (recovery, signup, invite, email_change, magiclink). */
  type: string | null;
  /** Error message when the link could not be consumed. */
  error: string | null;
};

function detect(url: URL): { kind: AuthRedirectKind; type: string | null } {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const typeFromHash = hash.get("type");
  const typeFromQuery = url.searchParams.get("type");

  if (url.searchParams.get("code")) return { kind: "pkce", type: typeFromQuery };
  if (hash.get("access_token")) return { kind: "implicit", type: typeFromHash };
  if (url.searchParams.get("token_hash")) return { kind: "token_hash", type: typeFromQuery };
  return { kind: "none", type: typeFromQuery ?? typeFromHash };
}

/** Strip auth material out of the address bar so refreshes don't re-consume it. */
function cleanUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  ["code", "state", "token_hash", "type", "error", "error_code", "error_description"].forEach((k) =>
    url.searchParams.delete(k),
  );
  url.hash = "";
  window.history.replaceState({}, "", url.pathname + (url.search || "") );
}

export async function resolveAuthRedirect(
  opts: { clean?: boolean } = {},
): Promise<AuthRedirectResult> {
  if (typeof window === "undefined") {
    return { session: null, kind: "none", type: null, error: null };
  }

  const url = new URL(window.location.href);
  const { kind, type } = detect(url);

  const linkError =
    url.searchParams.get("error_description") ??
    url.searchParams.get("error") ??
    new URLSearchParams(url.hash.replace(/^#/, "")).get("error_description");

  // The SDK may already have consumed the URL (detectSessionInUrl defaults to
  // true), so always check for an existing session first.
  const existing = (await supabase.auth.getSession()).data.session ?? null;
  if (existing && kind !== "pkce") {
    if (opts.clean !== false && kind !== "none") cleanUrl();
    return { session: existing, kind, type, error: null };
  }

  let session: Session | null = existing;
  let error: string | null = linkError ?? null;

  try {
    if (kind === "pkce") {
      const code = url.searchParams.get("code")!;
      const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr) {
        // A concurrent SDK auto-exchange may have already consumed the code.
        session = (await supabase.auth.getSession()).data.session ?? null;
        if (!session) error = exErr.message;
      } else {
        session = data.session ?? null;
      }
    } else if (kind === "implicit") {
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const access_token = hash.get("access_token")!;
      const refresh_token = hash.get("refresh_token") ?? "";
      const { data, error: setErr } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (setErr) error = setErr.message;
      else session = data.session ?? null;
    } else if (kind === "token_hash") {
      const token_hash = url.searchParams.get("token_hash")!;
      const { data, error: vErr } = await supabase.auth.verifyOtp({
        token_hash,
        type: (type as any) ?? "email",
      });
      if (vErr) error = vErr.message;
      else session = data.session ?? null;
    }
  } catch (e) {
    error = toUserMessage(e, "Could not complete sign-in from this link.");
  }

  if (!session) {
    session = (await supabase.auth.getSession()).data.session ?? null;
  }

  if (session && opts.clean !== false && kind !== "none") cleanUrl();

  return { session, kind, type, error: session ? null : error };
}

/**
 * True when this page load carries auth material in the URL — useful for
 * deciding whether to wait for a session before rendering a gated form.
 */
export function hasAuthRedirectParams(): boolean {
  if (typeof window === "undefined") return false;
  return detect(new URL(window.location.href)).kind !== "none";
}
