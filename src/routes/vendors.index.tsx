import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SkeletonCardGrid } from "@/components/skeletons";
import { useEffect, useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { listActiveAds, listVendors, logAdEvent, VENDOR_CATEGORIES } from "@/lib/vendors.functions";
import { VendorDiscovery } from "@/components/vendor-discovery";
import { useAuthReady } from "@/hooks/use-auth-ready";
import { EmptyState } from "@/components/empty-state";
import { LoadErrorState } from "@/components/load-error-state";
import { Store } from "lucide-react";
import { VerifiedBadge } from "@/components/vendor-verified-badge";
import { FocalImage } from "@/components/image-focal-control";

export const Route = createFileRoute("/vendors/")({
  head: () => ({
    meta: [
      { title: "Vendor Marketplace — The Kenroe Collective" },
      // The directory itself is members-only, so the description sells access
      // rather than claiming a crawler can see listings it never will.
      { name: "description", content: "The Kenroe Collective vendor marketplace is members-only. Create a free account to browse vetted venues, caterers, photographers and planners — and request quotes in minutes." },
      { property: "og:title", content: "Vendor Marketplace — The Kenroe Collective" },
      { property: "og:description", content: "Members-only marketplace of vetted venues, caterers, photographers and planners. Sign in to browse and request quotes." },
      { property: "og:url", content: "https://thekenroecollective.com/vendors" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/vendors" }],
  }),
  component: VendorsPage,
});

type Vendor = {
  id: string;
  slug: string;
  name: string;
  category: string;
  city: string | null;
  region: string | null;
  country: string | null;
  bio: string | null;
  hero_image: string | null;
  logo_url: string | null;

  price_range: string | null;
  status?: string;
};

type Ad = {
  id: string;
  headline: string;
  blurb: string | null;
  cta_url: string | null;
  hero_image: string | null;
  region: string | null;
  vendor_id: string;
};

function VendorsPage() {
  const { ready, user } = useAuthReady();
  const navigate = useNavigate();
  const [category, setCategory] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Members-only marketplace: the full vendor list is a competitive asset,
  // so anonymous visitors get a sign-in prompt instead of real listings.
  // The server functions enforce this too — the gate is not just cosmetic.
  const gated = ready && !user;

  useEffect(() => {
    if (!ready || !user) {
      setVendors([]);
      setAds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let alive = true;
    const timer = window.setTimeout(() => {
      Promise.all([
        listVendors({ data: { category: category || undefined, region: region || undefined, q: q || undefined } }),
        listActiveAds({ data: { region: region || undefined } }),
      ])
        .then(([v, a]) => {
          if (!alive) return;
          setVendors((v.vendors as Vendor[]) ?? []);
          setAds((a.ads as Ad[]) ?? []);
          setFailed(false);
        })
        .catch(() => {
          if (!alive) return;
          setVendors([]);
          setAds([]);
          // A failed search must not read as "no vendors match your filters".
          setFailed(true);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [category, region, q, ready, user, attempt]);

  useEffect(() => {
    ads.forEach((ad) => {
      logAdEvent({ data: { placementId: ad.id, kind: "impression" } }).catch(() => {});
    });
  }, [ads]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <section className="py-20">
          <div className="mx-auto max-w-5xl px-6">
            <SkeletonCardGrid cards={6} />
          </div>
        </section>
        <SiteFooter />
      </div>
    );
  }

  if (gated) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-6">
            <p className="text-[10px] uppercase tracking-widest text-velvet">Vendors & Registry</p>
            <h1 className="mt-2 font-serif text-4xl">Sign in to browse vendors</h1>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              Our marketplace of vetted venues, caterers, photographers, planners, and registry
              partners is reserved for members. Create a free account to browse listings, search
              local businesses, and request quotes in one click.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate({ to: "/auth", search: { redirect: undefined } })}
                className="rounded-full bg-velvet px-6 py-2.5 text-sm font-medium text-white shadow-sm"
              >
                Sign in
              </button>
              <Link
                to="/signup" search={{ plan: "host", from: undefined, invite: undefined, email: undefined }}
                className="rounded-full bg-card px-6 py-2.5 text-sm font-medium ring-1 ring-ink/10"
              >
                Create a free account
              </Link>
            </div>
            <div className="mt-10 rounded-2xl bg-card p-6 ring-1 ring-ink/5">
              <p className="text-sm">
                <span className="font-medium">Are you a vendor?</span>{" "}
                <Link to="/vendor-hub" search={{ tab: "profile" }} className="text-velvet underline">
                  Create your profile
                </Link>{" "}
                — free listing, paid placements available.
              </p>
            </div>
          </div>
        </section>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <VendorDiscovery />
      <section className="border-b border-ink/5 py-14">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-[10px] uppercase tracking-widest text-velvet">Vendors & Registry</p>
          <h1 className="mt-2 font-serif text-4xl">Find the right people — and the perfect registry — for your celebration.</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Browse vetted venues, caterers, photographers, planners, and registry partners. Request a quote in one click.
          </p>
          <p className="mt-3 max-w-xl text-xs text-muted-foreground">
            <strong className="text-ink">Our vetting process:</strong> every vendor submits business details, insurance, and prior work samples. Our team reviews each profile, verifies identity and credentials, and confirms references before the listing goes live. We re-review profiles annually and act on any guest report within 48 hours.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-full bg-card px-4 py-2 text-sm ring-1 ring-ink/10"
            >
              <option value="">All categories</option>
              {VENDOR_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Region (e.g. Hudson Valley)"
              className="rounded-full bg-card px-4 py-2 text-sm ring-1 ring-ink/10"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name"
              className="rounded-full bg-card px-4 py-2 text-sm ring-1 ring-ink/10"
            />
          </div>
        </div>
      </section>

      {ads.length > 0 && (
        <section className="border-b border-ink/5 py-8">
          <div className="mx-auto max-w-5xl px-6">
            <p className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">Featured</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {ads.slice(0, 4).map((a) => (
                <a
                  key={a.id}
                  href={a.cta_url || "#"}
                  target={a.cta_url ? "_blank" : undefined}
                  rel="noreferrer"
                  onClick={() => logAdEvent({ data: { placementId: a.id, kind: "click" } }).catch(() => {})}
                  className="group flex gap-4 overflow-hidden rounded-2xl bg-card p-4 ring-1 ring-ink/5 transition hover:shadow-md"
                >
                  {a.hero_image && (
                    <FocalImage url={a.hero_image} alt={a.headline || "Sponsored"} className="size-20 rounded-xl" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-velvet">Sponsored</p>
                    <p className="mt-1 truncate font-medium">{a.headline}</p>
                    {a.blurb && <p className="line-clamp-2 text-xs text-muted-foreground">{a.blurb}</p>}
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-10">
        <div className="mx-auto max-w-5xl px-6">
          {loading ? (
            <SkeletonCardGrid cards={6} />
          ) : failed ? (
            <LoadErrorState
              title="We couldn't load the directory"
              description="Check your connection and try again. Your filters are kept."
              onRetry={() => setAttempt((n) => n + 1)}
            />
          ) : vendors.length === 0 ? (
            <EmptyState
              icon={Store}
              title={!!(category || region || q) ? "No vendors match your filters" : "The directory is just opening"}
              description={
                !!(category || region || q)
                  ? "Try a broader search, or clear the filters to see everyone listed."
                  : "We are onboarding our founding vendors now. Claim a free profile and be one of the first businesses hosts see when they plan an event, or send a quote request and we will bring vendors to you."
              }
              cta={!!(category || region || q)
                ? { label: "Clear filters", onClick: () => { setRegion(""); setCategory(""); setQ(""); } }
                : { label: "List your business, free →", to: "/vendor-hub" }}
              secondary={{ label: "Request quotes from vendors", to: "/vendor-hub" }}
              tips={[
                "Founding profiles are free, with paid featured placement available.",
                "Every profile is reviewed before it goes live, so hosts only see verified businesses.",
                "Not sure where to start? Ask our concierge — bottom-right corner.",
              ]}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vendors.map((v) => (
                <Link
                  key={v.id}
                  to="/vendors/$slug"
                  params={{ slug: v.slug }}
                  className="group overflow-hidden rounded-2xl bg-card ring-1 ring-ink/5 transition hover:shadow-lg"
                >
                  {v.logo_url ? (
                    <div className="grid aspect-[5/3] place-items-center bg-secondary p-6">
                      <img
                        src={v.logo_url}
                        alt={`${v.name} logo`}
                        loading="lazy"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : (
                    /* Older listings only have a photo. Keep showing it rather
                       than a blank tile until they upload a logo. */
                    <div className="grid aspect-[5/3] place-items-center bg-secondary">
                      {v.hero_image ? (
                        <FocalImage url={v.hero_image} alt={v.name} loading="lazy" className="size-full" />
                      ) : (
                        <span className="font-serif text-2xl text-ink/30">{v.name.slice(0, 1)}</span>
                      )}
                    </div>
                  )}

                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-wider text-velvet">{v.category}</p>
                      {v.status === "verified" && <VerifiedBadge />}
                    </div>
                    <p className="mt-1 font-serif text-xl group-hover:underline">{v.name}</p>
                    {(v.city || v.region) && (
                      <p className="text-xs text-muted-foreground">
                        {[v.city, v.region].filter(Boolean).join(", ")}
                      </p>
                    )}
                    {v.bio && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{v.bio}</p>}
                    {v.price_range && (
                      <p className="mt-2 text-[11px] font-medium text-ink/70">{v.price_range}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-10 rounded-2xl bg-card p-6 ring-1 ring-ink/5">
            <p className="text-sm">
              <span className="font-medium">Are you a vendor?</span>{" "}
              <Link to="/vendor-hub" search={{ tab: "profile" }} className="text-velvet underline">Create your profile</Link> — free profile, paid placements available.
            </p>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
