import { toUserMessage } from "@/lib/user-error";
import { LoadErrorState } from "@/components/load-error-state";
import { SkeletonPanel } from "@/components/skeletons";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { supabase } from "@/integrations/supabase/client";
import {
  createRfq,
  createVendorReview,
  getVendorBySlug,
  rfqCategoryForVendor,
  RFQ_CATEGORY_CHOICES,
  type RfqCategoryChoice,
} from "@/lib/vendors.functions";

import { useAuthReady } from "@/hooks/use-auth-ready";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { VerifiedBadge } from "@/components/vendor-verified-badge";
import { FocalImage } from "@/components/image-focal-control";
import { formatStampDate } from "@/lib/datetime";

export const Route = createFileRoute("/vendors/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Vendor — The Kenroe Collective` },
      { name: "description", content: "Members-only vendor profile on The Kenroe Collective — sign in to view details, reviews, and request a quote." },
      { name: "robots", content: "noindex,follow" },
      { property: "og:title", content: `Vendor profile` },
      { property: "og:url", content: `https://thekenroecollective.com/vendors/${params.slug}` },
    ],
    links: [{ rel: "canonical", href: `https://thekenroecollective.com/vendors/${params.slug}` }],
  }),
  component: VendorDetail,
});

function VendorDetail() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [vendor, setVendor] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [authed, setAuthed] = useState(false);
  const [showRfq, setShowRfq] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const { ready, user } = useAuthReady();

  useEffect(() => {
    if (!ready) return;
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    // Vendor profiles are members-only, matching the gated directory.
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    getVendorBySlug({ data: { slug } })
      .then((r) => {
        setVendor(r.vendor);
        setReviews(r.reviews ?? []);
      })
      // "Vendor not found" and "the request failed" are different answers,
      // so they get different screens.
      .catch(() => {
        setVendor(null);
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, [slug, ready, user, attempt]);



  if (loading || !ready) {
    return (
      <Shell>
        <SkeletonPanel />
      </Shell>
    );
  }
  if (!user) {
    return (
      <Shell>
        <p className="text-[10px] uppercase tracking-widest text-velvet">Vendors & Registry</p>
        <h1 className="mt-2 font-serif text-3xl">Sign in to view this vendor</h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Vendor profiles, reviews, and quote requests are reserved for members. Create a free
          account to continue.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate({ to: "/auth", search: { redirect: undefined } })}
            className="rounded-full bg-velvet px-6 py-2.5 text-sm font-medium text-white shadow-sm"
          >
            Sign in
          </button>
          <Link to="/signup" search={{ plan: "host", from: undefined, invite: undefined, email: undefined }} className="rounded-full bg-card px-6 py-2.5 text-sm font-medium ring-1 ring-ink/10">
            Create a free account
          </Link>
        </div>
      </Shell>
    );
  }
  if (failed) {
    return (
      <Shell>
        <LoadErrorState
          title="We couldn't load this vendor"
          description="Check your connection and try again."
          onRetry={() => setAttempt((n) => n + 1)}
          back={{ label: "Back to marketplace", to: "/vendors" }}
        />
      </Shell>
    );
  }
  if (!vendor) {
    return (
      <Shell>
        <h1 className="font-serif text-3xl">This vendor is no longer listed</h1>
        <p className="mt-2 text-base text-muted-foreground">
          The profile may have been removed, or the link may be out of date. Browse the marketplace
          to find a similar business.
        </p>
        <Link to="/vendors" className="mt-4 inline-block text-sm text-velvet underline">
          ← Back to marketplace
        </Link>
      </Shell>
    );
  }

  const avg =
    reviews.length === 0
      ? 0
      : reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="border-b border-ink/5">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <Link to="/vendors" className="text-xs text-muted-foreground hover:text-ink">
            ← All vendors
          </Link>
          <div className="mt-4 grid gap-8 sm:grid-cols-[1fr_280px]">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-velvet">{vendor.category}</p>
              <h1 className="mt-2 flex flex-wrap items-center gap-2 font-serif text-4xl">
                {vendor.name}
                {vendor.status === "verified" && <VerifiedBadge />}
              </h1>
              {(vendor.city || vendor.region) && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {[vendor.city, vendor.region, vendor.country].filter(Boolean).join(", ")}
                </p>
              )}
              {reviews.length > 0 && (
                <p className="mt-3 text-sm">
                  <span className="font-medium">{avg.toFixed(1)} ★</span>{" "}
                  <span className="text-muted-foreground">· {reviews.length} reviews</span>
                </p>
              )}
              {vendor.bio && <p className="mt-6 max-w-prose whitespace-pre-wrap text-sm">{vendor.bio}</p>}
              {/* Contact details only appear when the vendor opted in; the
                  public view masks them otherwise. */}
              {(vendor.public_phone || vendor.public_address) && (
                <dl className="mt-6 space-y-1 text-sm">
                  {vendor.public_phone && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Phone</dt>
                      <dd>
                        <a href={`tel:${String(vendor.public_phone).replace(/[^\d+]/g, "")}`} className="text-velvet underline">
                          {vendor.public_phone}
                        </a>
                      </dd>
                    </div>
                  )}
                  {vendor.public_address && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Address</dt>
                      <dd>{vendor.public_address}</dd>
                    </div>
                  )}
                </dl>
              )}
              {vendor.website && (
                <a
                  href={vendor.website}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
                >
                  Visit website
                  <span aria-hidden="true">↗</span>
                </a>
              )}
              {vendor.price_range && (
                <p className="mt-4 text-xs font-medium text-ink/70">{vendor.price_range}</p>
              )}
            </div>
            <div className="space-y-3">
              {vendor.hero_image && (
                <div className="relative">
                  <FocalImage url={vendor.hero_image} alt={vendor.name} className="aspect-[5/4] w-full rounded-2xl ring-1 ring-ink/5" />
                  {vendor.logo_url && (
                    <img
                      src={vendor.logo_url}
                      alt={`${vendor.name} logo`}
                      className="absolute -bottom-4 left-4 size-16 rounded-xl bg-paper object-contain p-1.5 shadow-md ring-1 ring-ink/10"
                    />
                  )}
                </div>
              )}
              {!vendor.hero_image && vendor.logo_url && (
                <img src={vendor.logo_url} alt={`${vendor.name} logo`} className="size-24 rounded-xl bg-card object-contain p-2 ring-1 ring-ink/10" />
              )}
              <button
                onClick={() => (authed ? setShowRfq(true) : navigate({ to: "/auth", search: { redirect: undefined } }))}
                className={`w-full rounded-full bg-velvet px-5 py-3 text-sm font-medium text-white hover:opacity-90 ${vendor.hero_image && vendor.logo_url ? "mt-6" : ""}`}
              >
                Request a quote
              </button>
            </div>
          </div>
        </div>
      </section>

      {Array.isArray(vendor.gallery) && vendor.gallery.length > 0 && (
        <section className="border-b border-ink/5 py-10">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="font-serif text-2xl">Their work</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {vendor.gallery.slice(0, 8).map((src: string, i: number) => (
                <FocalImage
                  key={src + i}
                  url={src}
                  alt={`${vendor.name} portfolio image ${i + 1}`}
                  loading="lazy"
                  className="aspect-square w-full rounded-2xl ring-1 ring-ink/5"
                />
              ))}
            </div>
          </div>
        </section>
      )}



      <section className="py-10">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-2xl">Reviews</h2>
            {authed && (
              <button
                onClick={() => setShowReview(true)}
                className="rounded-full bg-secondary px-3 py-1.5 text-xs hover:bg-secondary/70"
              >
                Leave a review
              </button>
            )}
          </div>
          {reviews.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No reviews yet.</p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
                  <p className="text-sm font-medium">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p>
                  {r.body && <p className="mt-1 text-sm">{r.body}</p>}
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {formatStampDate((r.created_at))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {showRfq && <RfqModal vendor={vendor} onClose={() => setShowRfq(false)} />}
      {showReview && <ReviewModal vendor={vendor} onClose={() => setShowReview(false)} />}

      <SiteFooter />
    </div>
  );
}

function RfqModal({ vendor, onClose }: { vendor: any; onClose: () => void }) {
  const [subject, setSubject] = useState(`Quote request — ${vendor.name}`);
  const [category, setCategory] = useState<RfqCategoryChoice>(
    rfqCategoryForVendor(vendor?.category),
  );
  const [location, setLocation] = useState<string>(
    [vendor?.city, vendor?.region].filter(Boolean).join(", "),
  );
  const [message, setMessage] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    // Check here rather than letting the server reject the shape, so the person
    // is told which field to fix instead of getting a generic sentence.
    if (subject.trim().length < 2) {
      setError("Please give the request a subject.");
      return;
    }
    if (message.trim().length < 10) {
      setError("Please tell them a little about your event, at least a sentence.");
      return;
    }
    setSending(true);
    try {
      const res = await createRfq({
        data: {
          vendorId: vendor.id,
          subject: subject.trim(),
          category,
          location: location.trim() || undefined,
          message: message.trim(),
          budgetMin: budgetMin ? Number(budgetMin) : undefined,
          budgetMax: budgetMax ? Number(budgetMax) : undefined,
          eventDate: eventDate || undefined,
          guestCount: guestCount ? Number(guestCount) : undefined,
        },
      });
      if ("error" in res) setError(toUserMessage(res.error, "Failed to send — please try again."));
      else setDone(true);
    } catch (err) {
      setError(toUserMessage(err, "Failed to send — please try again."));
    } finally {
      setSending(false);
    }
  }


  return (
    <Overlay onClose={onClose}>
      {done ? (
        <div className="text-center">
          <h3 className="font-serif text-2xl">Request sent.</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {vendor.name} will reply in your <Link to="/vendor-hub" search={{ tab: undefined }} className="text-velvet underline">vendor hub</Link>.
          </p>
          <button onClick={onClose} className="mt-4 rounded-full bg-ink px-5 py-2 text-sm text-white">
            Close
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <h3 className="font-serif text-2xl">Request a quote</h3>
          <Input label="Subject" value={subject} onChange={setSubject} required />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                What you need
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as RfqCategoryChoice)}
                className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
              >
                {RFQ_CATEGORY_CHOICES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <Input label="Where (city, state)" value={location} onChange={setLocation} />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Tell them about your event
            </label>
            <textarea
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Budget min ($)" value={budgetMin} onChange={setBudgetMin} type="number" />
            <Input label="Budget max ($)" value={budgetMax} onChange={setBudgetMax} type="number" />
            <Input label="Event date" value={eventDate} onChange={setEventDate} type="date" />
            <Input label="Guest count" value={guestCount} onChange={setGuestCount} type="number" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            disabled={sending}
            className="w-full rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send request"}
          </button>
        </form>
      )}
    </Overlay>
  );
}

function ReviewModal({ vendor, onClose }: { vendor: any; onClose: () => void }) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    const res = await createVendorReview({ data: { vendorId: vendor.id, rating, body: body || undefined } });
    setSending(false);
    if ("error" in res) setError(res.error ?? "Failed");
    else setDone(true);
  }
  return (
    <Overlay onClose={onClose}>
      {done ? (
        <div className="text-center">
          <h3 className="font-serif text-2xl">Thanks for reviewing.</h3>
          <button onClick={onClose} className="mt-4 rounded-full bg-ink px-5 py-2 text-sm text-white">
            Close
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <h3 className="font-serif text-2xl">Leave a review</h3>
          <p className="text-xs text-muted-foreground">
            Only verified customers (with an accepted RFQ) can submit a review.
          </p>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Rating
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={`text-2xl ${n <= rating ? "text-velvet" : "text-ink/20"}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Review (optional)
            </label>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button disabled={sending} className="w-full rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {sending ? "Submitting…" : "Submit review"}
          </button>
        </form>
      )}
    </Overlay>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
      />
    </div>
  );
}

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useDialogA11y(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="w-full max-w-md rounded-3xl bg-paper p-6 shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">{children}</section>
      <SiteFooter />
    </div>
  );
}
