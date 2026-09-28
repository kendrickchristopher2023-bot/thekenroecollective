import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteNav } from "@/components/site-nav";

export const Route = createFileRoute("/claim/$token")({
  head: () => ({ meta: [{ title: "Claim your vendor invite — The Kenroe Collective" }] }),
  component: ClaimPage,
});

function ClaimPage() {
  const { token } = Route.useParams();
  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="py-16">
        <div className="mx-auto max-w-xl px-6 text-center">
          <p className="text-[10px] uppercase tracking-widest text-velvet">Vendor invitation</p>
          <h1 className="mt-2 font-serif text-4xl">You've been invited to bid</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            A The Kenroe Collective client invited your business to submit a bid on their event request.
            Create a free vendor profile to respond — it takes about 2 minutes.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link to="/auth" search={{ invite: token } as any}
              className="rounded-full bg-velvet px-5 py-2 text-sm font-medium text-white hover:opacity-90">
              Create vendor account
            </Link>
            <Link to="/vendor-hub" search={{ tab: undefined }}
              className="rounded-full bg-secondary px-5 py-2 text-sm font-medium hover:bg-secondary/70">
              I already have an account
            </Link>
          </div>
          <p className="mt-6 text-[11px] text-muted-foreground">Invite code: <code className="rounded bg-secondary px-1.5 py-0.5">{token}</code></p>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
