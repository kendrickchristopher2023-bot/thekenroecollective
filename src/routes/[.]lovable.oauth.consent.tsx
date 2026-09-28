import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Beta @supabase/supabase-js oauth namespace — declare the three methods we call
// so TypeScript doesn't complain while the API stabilizes.
type OAuthAuthorizationDetails = {
  client?: { name?: string; redirect_uri?: string } | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};
type OAuthResult<T> = { data: T | null; error: { message: string } | null };
type SupabaseOAuth = {
  getAuthorizationDetails(id: string): Promise<OAuthResult<OAuthAuthorizationDetails>>;
  approveAuthorization(id: string): Promise<OAuthResult<OAuthAuthorizationDetails>>;
  denyAuthorization(id: string): Promise<OAuthResult<OAuthAuthorizationDetails>>;
};
const getOauth = () => (supabase.auth as unknown as { oauth: SupabaseOAuth }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase client reads its session from localStorage,
  // which is absent during SSR — without this, a signed-in user would bounce
  // through the auth page on every load.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { redirect: next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId =
      new URLSearchParams(location.search).get("authorization_id") ?? "";
    const { data, error } = await getOauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <section className="mx-auto max-w-md p-8">
      <h1 className="font-serif text-2xl">Authorization error</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        We couldn't load this authorization request: {String((error as Error)?.message ?? error)}
      </p>
    </section>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const call = approve
      ? getOauth().approveAuthorization(authorization_id)
      : getOauth().denyAuthorization(authorization_id);
    const { data, error } = await call;
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";

  return (
    <section className="mx-auto max-w-md p-8">
      <h1 className="font-serif text-2xl">Connect {clientName} to your account</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        This lets {clientName} use The Kenroe Collective as you — reading your events and
        acting on your behalf through this app's enabled tools. This does not bypass the
        app's permissions or backend policies.
      </p>
      {details?.client?.redirect_uri && (
        <p className="mt-2 text-xs text-muted-foreground">
          Redirect: <code>{details.client.redirect_uri}</code>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(true)}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(false)}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
        >
          Cancel connection
        </button>
      </div>
    </section>
  );
}
