import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { getMyVendor, listMyRfqs, upsertMyVendor, VENDOR_CATEGORIES } from "@/lib/vendors.functions";
import { AD_TIERS, type AdTier, cancelMyAd, createAdCheckout, listMyAds } from "@/lib/ads.functions";
import { confirmDialog } from "@/lib/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { SkeletonCardGrid, SkeletonPanel } from "@/components/skeletons";
import { Send, Inbox } from "lucide-react";
import { ImageUploadField } from "@/components/image-upload-field";
import { FocalImage } from "@/components/image-focal-control";
import { formatStampDate } from "@/lib/datetime";

type VendorHubTab = "profile" | "sent" | "received" | "ads";
export const VENDOR_HUB_TABS: VendorHubTab[] = ["profile", "received", "sent", "ads"];

export const Route = createFileRoute("/_authenticated/vendor-hub")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" && VENDOR_HUB_TABS.includes(search.tab as VendorHubTab)
      ? (search.tab as VendorHubTab)
      : undefined,
  }),

  head: () => ({
    meta: [{ title: "Vendor hub — The Kenroe Collective" }],
  }),
  component: VendorHub,
});

function VendorHub() {
  const { tab: tabParam } = Route.useSearch();
  const tab: VendorHubTab = tabParam ?? "profile";
  const navigate = useNavigate();


  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="border-b border-ink/5 py-10">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-[10px] uppercase tracking-widest text-velvet">Vendor hub</p>
          <h1 className="mt-2 font-serif text-4xl">Manage your business</h1>
          <div className="mt-6 flex flex-wrap gap-2">
            {VENDOR_HUB_TABS.map((t) => (
              <button
                key={t}
                onClick={() => navigate({ to: "/vendor-hub", search: { tab: t }, replace: true })}
                className={`rounded-full px-4 py-1.5 text-xs font-medium ${
                  tab === t ? "bg-ink text-white" : "bg-secondary hover:bg-secondary/70"
                }`}
              >
                {t === "profile"
                  ? "My profile"
                  : t === "received"
                  ? "Quote requests"
                  : t === "sent"
                  ? "My requests"
                  : "Ads & promotion"}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="py-10">
        <div className="mx-auto max-w-5xl px-6">
          {tab === "profile" && <ProfileTab />}
          {tab === "sent" && <RfqList kind="sent" />}
          {tab === "received" && <RfqList kind="received" />}
          {tab === "ads" && <AdsTab />}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

function AdsTab() {
  const [ads, setAds] = useState<any[] | null>(null);
  const [vendor, setVendor] = useState<any | null | undefined>(undefined);
  const [tier, setTier] = useState<AdTier | null>(null);
  const [step, setStep] = useState<"choose" | "details" | "pay">("choose");
  const [form, setForm] = useState({
    headline: "",
    blurb: "",
    cta_url: "",
    hero_image: "",
    region: "",
  });

  function reload() {
    listMyAds().then((r) => setAds(r.ads));
    getMyVendor().then((r) => setVendor(r.vendor ?? null));
  }
  useEffect(() => {
    reload();
  }, []);

  async function onCancelAd(adId: string) {
    if (!(await confirmDialog({ title: "Cancel this ad at the end of the billing period?" }))) return;
    await cancelMyAd({ data: { adId, environment: getStripeEnvironment() } });
    reload();
  }

  function reset() {
    setStep("choose");
    setTier(null);
    setForm({ headline: "", blurb: "", cta_url: "", hero_image: "", region: "" });
    reload();
  }

  const canBuy = vendor?.status === "verified";
  const gateMessage =
    vendor === undefined
      ? null
      : vendor === null
      ? "Create your public profile first — ad purchases unlock once an owner approves it."
      : vendor.status === "pending"
      ? "Your profile is awaiting owner approval. You'll be emailed once it's approved, then you can purchase an ad."
      : vendor.status === "reviewing"
      ? "Your profile is being reviewed. Ad purchases unlock once approved."
      : vendor.status === "rejected"
      ? "Your profile wasn't approved. Contact support if you believe this is a mistake."
      : vendor.status === "paused"
      ? "Your profile is paused. Contact support to reactivate before purchasing an ad."
      : null;

  if (step === "details" && tier) {
    const tierCfg = AD_TIERS[tier];
    return (
      <div className="grid gap-6 sm:grid-cols-[1fr_320px]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setStep("pay");
          }}
          className="space-y-3 rounded-2xl bg-card p-6 ring-1 ring-ink/5"
        >
          <h2 className="font-serif text-2xl">{tierCfg.name}</h2>
          <p className="text-sm text-muted-foreground">{tierCfg.blurb}</p>
          <p className="text-sm font-medium text-velvet">{tierCfg.priceLabel}</p>
          <Field label="Headline">
            <input
              required
              maxLength={120}
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
              className="input"
              placeholder="e.g. Boutique floral design in Brooklyn"
            />
          </Field>
          <Field label="Short blurb">
            <textarea
              rows={3}
              maxLength={400}
              value={form.blurb}
              onChange={(e) => setForm({ ...form, blurb: e.target.value })}
              className="input"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Click-through URL">
              <input
                value={form.cta_url}
                onChange={(e) => setForm({ ...form, cta_url: e.target.value })}
                className="input"
                placeholder="https://"
              />
            </Field>
            <Field label="Region (optional)">
              <input
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                className="input"
                placeholder="e.g. New York"
              />
            </Field>
          </div>
          <Field label="Hero image">
            <ImageUploadField
              value={form.hero_image}
              onChange={(url) => setForm({ ...form, hero_image: url })}
              source="rfq"
              altText={form.headline ? `${form.headline} ad image` : "Vendor ad image"}
              aspect="aspect-video"
              buttonLabel="Upload hero image"
              hint="Wide, 1600 × 900 or larger (16:9)."
            />
          </Field>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={reset} className="rounded-full bg-secondary px-4 py-2 text-sm">
              Back
            </button>
            <button className="rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">
              Continue to payment
            </button>
          </div>
          <style>{`.input{width:100%;border-radius:0.5rem;background:hsl(var(--secondary));padding:0.5rem 0.75rem;font-size:0.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px hsl(var(--velvet)/.3)}`}</style>
        </form>
        <aside className="rounded-2xl bg-card p-5 ring-1 ring-ink/5 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-ink">Preview</p>
          {form.hero_image && (
            <FocalImage url={form.hero_image} alt={form.headline ? `${form.headline} preview` : "Vendor hero preview"} className="aspect-video w-full rounded-lg" />
          )}
          <p className="font-serif text-lg text-ink">{form.headline || "Your headline"}</p>
          <p>{form.blurb || "Your short description appears here."}</p>
          <p className="text-[10px] uppercase tracking-wider">Billed monthly. Cancel any time.</p>
        </aside>
      </div>
    );
  }

  if (step === "pay" && tier) {
    return (
      <div className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">
        <p className="mb-4 text-sm text-muted-foreground">
          Complete payment to submit your ad for review. After approval it goes live.
        </p>
        <AdCheckout tier={tier} form={form} onDone={reset} />
        <button onClick={reset} className="mt-4 text-xs text-muted-foreground underline">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-2xl">Promote your business</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reach hosts planning events. Cancel any time from this page.
        </p>
        {gateMessage && (
          <div className="mt-4 rounded-2xl bg-secondary/60 p-4 ring-1 ring-ink/5 text-sm">
            <p className="text-ink">{gateMessage}</p>
            {vendor === null && (
              <Link
                to="/vendor-hub"
                search={{ tab: "profile" }}
                className="mt-2 inline-block text-xs text-velvet underline"
              >
                Go to profile →
              </Link>
            )}
          </div>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(Object.values(AD_TIERS) as Array<typeof AD_TIERS[AdTier]>).map((t) => (
            <div key={t.id} className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">
              <p className="text-[10px] uppercase tracking-widest text-velvet">{t.name}</p>
              <p className="mt-2 font-serif text-3xl">{t.priceLabel}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t.blurb}</p>
              <button
                disabled={!canBuy}
                title={canBuy ? undefined : "Complete and get your profile approved first"}
                onClick={() => {
                  setTier(t.id as AdTier);
                  setStep("details");
                }}
                className="mt-4 rounded-full bg-ink px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Buy {t.name}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-serif text-xl">Your ads</h3>
        {!ads && <div className="mt-2"><SkeletonCardGrid cards={3} /></div>}
        {ads && ads.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">You haven't purchased any ads yet.</p>
        )}
        {ads && ads.length > 0 && (
          <ul className="mt-3 space-y-2">
            {ads.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-4 rounded-xl bg-card p-4 ring-1 ring-ink/5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.headline}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {AD_TIERS[a.tier as AdTier]?.name ?? a.tier} · {a.status}
                    {a.region && ` · ${a.region}`}
                  </p>
                </div>
                {a.status === "active" && a.stripe_subscription_id && (
                  <button
                    onClick={() => onCancelAd(a.id)}
                    className="rounded-full bg-secondary px-3 py-1 text-xs hover:bg-secondary/70"
                  >
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AdCheckout({
  tier,
  form,
  onDone,
}: {
  tier: AdTier;
  form: { headline: string; blurb: string; cta_url: string; hero_image: string; region: string };
  onDone: () => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    createAdCheckout({
      data: {
        tier,
        headline: form.headline,
        blurb: form.blurb || null,
        cta_url: form.cta_url || null,
        hero_image: form.hero_image || null,
        region: form.region || null,
        returnUrl: `${window.location.origin}/vendor-hub?ad=success`,
        environment: getStripeEnvironment(),
      },
    }).then((res) => {
      if (cancelled) return;
      if ("error" in res) setError(res.error);
      else setClientSecret(res.clientSecret);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!clientSecret) return <p className="text-sm text-muted-foreground">Preparing secure checkout…</p>;
  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider
        key={clientSecret}
        stripe={getStripe()}
        options={{ clientSecret, onComplete: onDone }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}


function ProfileTab() {
  const [vendor, setVendor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    name: "",
    category: "Venue",
    city: "",
    region: "",
    country: "",
    bio: "",
    website: "",
    phone: "",
    email: "",
    hero_image: "",
    logo_url: "",
    address: "",
    show_phone: false,
    show_address: false,
    gallery: [] as string[],
    price_range: "",
  });

  useEffect(() => {
    getMyVendor().then((r) => {
      if (r.vendor) {
        const v = r.vendor as any;
        setVendor(v);
        const gallery: string[] = Array.isArray(v.gallery) ? v.gallery : [];
        setForm({
          name: v.name ?? "",
          category: v.category ?? "Venue",
          city: v.city ?? "",
          region: v.region ?? "",
          country: v.country ?? "",
          bio: v.bio ?? "",
          website: v.website ?? "",
          phone: v.phone ?? "",
          email: v.email ?? "",
          hero_image: v.hero_image ?? "",
          logo_url: v.logo_url ?? "",
          address: v.address ?? "",
          show_phone: Boolean(v.show_phone),
          show_address: Boolean(v.show_address),
          gallery,
          price_range: v.price_range ?? "",
        });
      }
      setLoading(false);
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const gallery = form.gallery.filter((u) => /^https?:\/\//i.test(u)).slice(0, 8);
      const res = await upsertMyVendor({ data: { ...form, gallery } });
      if ("error" in res) {
        setMsg(res.error ?? "Failed to save. Please try again.");
      } else {
        setMsg(
          !vendor
            ? "Profile created — awaiting owner approval. You'll get an email once approved."
            : (res as { needsReview?: boolean }).needsReview
              ? "Saved. Because your public details changed, your listing is back in review and will return once approved."
              : "Saved.",
        );
        const fresh = await getMyVendor();
        setVendor(fresh.vendor);
      }
    } catch (err: any) {
      setMsg(err?.message ?? "Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SkeletonPanel />;
  const statusMessage =
    vendor?.status === "pending"
      ? "Your profile is waiting for owner review."
      : vendor?.status === "reviewing"
      ? "Your profile is actively being reviewed. Advertising checkout unlocks after approval."
      : vendor?.status === "rejected"
      ? "Your application was not approved. Contact support if you believe this is a mistake."
      : vendor?.status === "paused"
      ? "Your profile is paused. Contact support to reactivate before purchasing ads."
      : null;

  return (
    <div className="grid gap-6 sm:grid-cols-[1fr_280px]">
      <form onSubmit={save} className="space-y-3 rounded-2xl bg-card p-6 ring-1 ring-ink/5">
        <h2 className="font-serif text-2xl">Public profile</h2>
        <Field label="Business name">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="Category">
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="input"
          >
            {VENDOR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="City">
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="input" />
          </Field>
          <Field label="Region">
            <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="input" />
          </Field>
          <Field label="Country">
            <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="input" />
          </Field>
        </div>
        <Field label="Business description *">
          <textarea
            rows={5}
            maxLength={2000}
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            className="input"
            placeholder="Tell hosts what you do, who you work with, and what makes your service different."
          />
        </Field>
        <p className="-mt-2 text-[11px] text-muted-foreground">{form.bio.length}/2000 characters</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Website">
            <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="input" placeholder="https://" />
          </Field>
          <Field label="Phone">
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
          </Field>
          <Field label="Price range">
            <input value={form.price_range} onChange={(e) => setForm({ ...form, price_range: e.target.value })} className="input" placeholder="$$ — $$$" />
          </Field>
        </div>
        {/* Logo is the only image we collect. hero_image / gallery values on
            existing rows are preserved untouched, just no longer shown. */}
        <Field label="Logo">
          <div className="max-w-[240px]">
            <ImageUploadField
              value={form.logo_url}
              onChange={(url) => setForm((f) => ({ ...f, logo_url: url }))}
              source="rfq"
              altText={form.name ? `${form.name} logo` : "Vendor logo"}
              aspect="aspect-square"
              buttonLabel="Upload logo"
              hint="Square, 512 × 512 or larger. This is what hosts see on your directory card."
            />
          </div>
        </Field>

        <Field label="Street address (optional)">
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input" placeholder="12 Market St, Kingston NY" />
        </Field>

        {/* Contact PII is private by default. These two toggles are the only
            thing that puts a phone number or address on the public listing. */}
        <div className="rounded-xl bg-paper/60 p-3 ring-1 ring-ink/5">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">What visitors can see</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your phone, address and email stay private unless you turn them on here. Hosts who send
            you a quote request can always reach you through the message thread.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.show_phone}
              onChange={(e) => setForm({ ...form, show_phone: e.target.checked })}
            />
            Show my phone number on my public profile
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.show_address}
              onChange={(e) => setForm({ ...form, show_address: e.target.checked })}
            />
            Show my street address on my public profile
          </label>
        </div>
        {msg && <p className="text-sm text-velvet">{msg}</p>}
        <button disabled={saving} className="rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {saving ? "Saving…" : vendor ? "Save changes" : "Create profile"}
        </button>
        <style>{`.input{width:100%;border-radius:0.5rem;background:hsl(var(--secondary));padding:0.5rem 0.75rem;font-size:0.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px hsl(var(--velvet)/.3)}`}</style>
      </form>

      <aside className="space-y-3">
        <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Status</p>
          <p className="mt-1 text-lg font-medium capitalize">{vendor?.status ?? "Not created"}</p>
          {statusMessage && <p className="mt-2 text-xs text-muted-foreground">{statusMessage}</p>}
          {vendor && vendor.status === "verified" && (
            <Link to="/vendors/$slug" params={{ slug: vendor.slug }} className="mt-3 inline-block text-xs text-velvet underline">
              View public page →
            </Link>
          )}
        </div>

        {/* Required-field clarity: hosts see half-finished listings otherwise. */}
        <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Needed to go live</p>
          <ul className="mt-2 space-y-1 text-xs">
            {[
              { label: "Business name", done: Boolean(form.name.trim()) },
              { label: "City or region", done: Boolean(form.city.trim() || form.region.trim()) },
              { label: "Business description", done: form.bio.trim().length >= 40 },
              { label: "Logo", done: Boolean(form.logo_url) },
            ].map((item) => (
              <li key={item.label} className={item.done ? "text-ink" : "text-muted-foreground"}>
                {item.done ? "✓" : "○"} {item.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Price range is optional but makes a listing far more convincing.
          </p>

        </div>

        {/* Live preview of the directory card a host sees. */}
        <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">How hosts see you</p>
          <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-ink/10">
            <div className="grid aspect-[5/3] w-full place-items-center bg-secondary p-6">
              {form.logo_url ? (
                <img src={form.logo_url} alt={`${form.name || "Vendor"} logo preview`} className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-[11px] text-muted-foreground">No logo yet</span>
              )}
            </div>
            <div className="space-y-1 p-3">
              <p className="font-medium">{form.name || "Your business name"}</p>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                {form.category}
                {form.city || form.region ? ` · ${[form.city, form.region].filter(Boolean).join(", ")}` : ""}
              </p>
              <p className="line-clamp-3 text-xs text-muted-foreground">
                {form.bio || "Your business description appears here."}
              </p>
              {form.price_range && <p className="text-xs">{form.price_range}</p>}
              {/^https?:\/\//i.test(form.website) && (
                <span className="mt-2 inline-block rounded-full bg-velvet px-3 py-1 text-[11px] text-white">Visit website</span>
              )}
            </div>
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground">
            Phone and address only appear here if you switch them on.
          </p>
        </div>
      </aside>

    </div>
  );
}

function RfqList({ kind }: { kind: "sent" | "received" }) {
  const [data, setData] = useState<{ sent: any[]; received: any[] } | null>(null);

  useEffect(() => {
    listMyRfqs().then(setData).catch(() => setData({ sent: [], received: [] }));
  }, []);

  if (!data) return <SkeletonPanel />;
  const list = kind === "sent" ? data.sent : data.received;
  if (list.length === 0) {
    return (
      <EmptyState
        icon={kind === "sent" ? Send : Inbox}
        title={kind === "sent" ? "No quote requests yet" : "No quote requests yet"}
        description={
          kind === "sent"
            ? "Create a request and invite vendors to bid on your event."
            : "Verified vendor profiles can be discovered on /vendors."
        }
        cta={
          kind === "sent"
            ? { label: "Browse vendors →", to: "/vendors" }
            : undefined
        }
        secondary={
          kind === "received"
            ? { label: "Create a vendor profile", to: "/vendor-hub" }
            : undefined
        }
      />
    );
  }
  // Each request opens the full RFQ thread (/rfq/$rfqId), which supports
  // bid amounts, side-by-side comparison, and awarding — not a duplicate
  // inline thread here.
  return (
    <ul className="space-y-2">
      {list.map((r) => (
        <li key={r.id}>
          <Link
            to="/rfq/$rfqId"
            params={{ rfqId: r.id }}
            search={{ from: kind }}
            className="block rounded-xl p-3 ring-1 ring-ink/5 transition bg-card hover:bg-secondary/40"
          >
            <p className="text-sm font-medium">{r.subject}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {r.status} · {formatStampDate((r.created_at))}
              {r.vendors ? ` · ${r.vendors.name}` : ""}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
