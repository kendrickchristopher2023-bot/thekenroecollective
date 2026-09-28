import { useEffect, useState } from "react";
import { VENDOR_DISCOVERY_CATEGORIES, inviteDiscoveredVendorToBid } from "@/lib/vendor-discovery.functions";
import { listMyRfqs } from "@/lib/rfq.functions";
import { Link } from "@tanstack/react-router";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { Phone, Globe, Star, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Biz = {
  id: string;
  name: string;
  address: string | null;
  categoryLabel: string | null;
  mapsUrl: string | null;
  photoName: string | null;
  photoAuthor: { name: string; uri: string | null } | null;
};

type Details = {
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  openNow: boolean | null;
};

function photoUrl(photoName: string) {
  return `/api/public/vendor-discovery/photo?name=${encodeURIComponent(photoName)}`;
}

/** The discovery proxies are sign-in-only (they cost real money per call),
 *  so every request carries the caller's Supabase access token. */
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** <img> can't send an Authorization header, so fetch the bytes and render
 *  them from a blob URL. Browser HTTP caching still applies to the fetch. */
function PlacePhoto({ photoName, alt }: { photoName: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await fetch(photoUrl(photoName), { headers: await authHeaders() });
        if (!res.ok) return;
        const blob = await res.blob();
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        // A missing photo should never break the results grid.
      }
    })();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoName]);
  if (!src) return null;
  return <img src={src} alt={alt} loading="lazy" className="size-full object-cover" />;
}

export function VendorDiscovery() {
  const [cat, setCat] = useState<string>(VENDOR_DISCOVERY_CATEGORIES[0].query);
  const [location, setLocation] = useState("");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Biz[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inviteFor, setInviteFor] = useState<Biz | null>(null);

  // Contact info (phone/website/rating) is fetched per-business on demand —
  // see search.ts for why it isn't in the initial search results.
  const [details, setDetails] = useState<Record<string, Details | "loading" | "error">>({});

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!location.trim()) {
      setErr("Enter a location (city or ZIP)");
      return;
    }
    setErr(null);
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch("/api/public/vendor-discovery/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ categoryQuery: cat, location: location.trim(), term: term.trim() || undefined }),
      }).then((r) => r.json());
      if (res.error) setErr(res.error);
      setResults((res.businesses as Biz[]) ?? []);
    } catch {
      // A network blip shouldn't leave the button stuck on "Searching…"
      // forever — surface it and let the host retry.
      setErr("Vendor search is temporarily unavailable. Try again shortly.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetails(biz: Biz) {
    if (details[biz.id]) return;
    setDetails((d) => ({ ...d, [biz.id]: "loading" }));
    try {
      const res = await fetch("/api/public/vendor-discovery/details", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ placeId: biz.id }),
      }).then((r) => r.json());
      if (res.error) {
        setDetails((d) => ({ ...d, [biz.id]: "error" }));
        return;
      }
      setDetails((d) => ({
        ...d,
        [biz.id]: {
          phone: res.phone ?? null,
          website: res.website ?? null,
          rating: res.rating ?? null,
          reviewCount: res.reviewCount ?? null,
          openNow: res.openNow ?? null,
        },
      }));
    } catch {
      setDetails((d) => ({ ...d, [biz.id]: "error" }));
    }
  }

  return (
    <section className="border-y border-ink/5 bg-secondary/20 py-10">
      <div className="mx-auto max-w-5xl px-6">
        <p className="text-[10px] uppercase tracking-widest text-velvet">Vendor data via Google Maps</p>
        <h2 className="mt-1 font-serif text-3xl">Discover local vendors</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Browse event categories nationwide. View a business on Google Maps or invite it to bid right here.
        </p>

        <form onSubmit={search} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <select value={cat} onChange={(e) => setCat(e.target.value)}
            className="rounded-full bg-paper px-4 py-2 text-sm ring-1 ring-ink/10">
            {VENDOR_DISCOVERY_CATEGORIES.map((c) => <option key={c.key} value={c.query}>{c.label}</option>)}
          </select>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City or ZIP *"
            className="rounded-full bg-paper px-4 py-2 text-sm ring-1 ring-ink/10" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Optional keyword"
            className="rounded-full bg-paper px-4 py-2 text-sm ring-1 ring-ink/10" />
          <button type="submit" disabled={loading}
            className="rounded-full bg-velvet px-5 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        {err && <p className="mt-3 text-xs text-rose-600">{err}</p>}

        {loading && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="overflow-hidden rounded-2xl bg-card ring-1 ring-ink/5">
                <div className="aspect-[5/3] animate-pulse bg-secondary" />
                <div className="space-y-2 p-4">
                  <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
                  <div className="h-5 w-3/4 animate-pulse rounded bg-secondary" />
                  <div className="h-3 w-full animate-pulse rounded bg-secondary" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && searched && !err && results.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            No businesses found for that search. Try a different category or a broader location.
          </p>
        )}

        {!loading && results.length > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((b) => {
              const d = details[b.id];
              return (
                <div key={b.id} className="overflow-hidden rounded-2xl bg-card ring-1 ring-ink/5">
                  <div className="relative aspect-[5/3] bg-secondary">
                    {b.photoName && (
                      <PlacePhoto photoName={b.photoName} alt={b.name} />
                    )}
                    {b.photoAuthor && (
                      // Google requires crediting a named photo author wherever
                      // the image is shown.
                      <p className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 py-1 text-[9px] text-white/90">
                        Photo:{" "}
                        {b.photoAuthor.uri ? (
                          <a href={b.photoAuthor.uri} target="_blank" rel="noreferrer" className="underline">
                            {b.photoAuthor.name}
                          </a>
                        ) : (
                          b.photoAuthor.name
                        )}
                      </p>
                    )}
                  </div>
                  <div className="p-4">
                    {b.categoryLabel && (
                      <p className="text-[10px] uppercase tracking-wider text-velvet">{b.categoryLabel}</p>
                    )}
                    <p className="mt-1 font-serif text-lg">{b.name}</p>
                    {b.address && (
                      <p className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground">
                        <MapPin className="mt-0.5 size-3 shrink-0" />
                        {b.address}
                      </p>
                    )}

                    {d && d !== "loading" && d !== "error" && (
                      <div className="mt-2 space-y-1 text-[11px]">
                        {d.rating != null && (
                          <p className="flex items-center gap-1 text-ink/80">
                            <Star className="size-3 fill-amber-400 text-amber-400" />
                            {d.rating.toFixed(1)}
                            {d.reviewCount != null && ` (${d.reviewCount})`}
                            {d.openNow != null && (
                              <span className={d.openNow ? "text-emerald-600" : "text-ink/50"}>
                                {" "}· {d.openNow ? "Open now" : "Closed now"}
                              </span>
                            )}
                          </p>
                        )}
                        {d.phone && (
                          <a href={`tel:${d.phone}`} className="flex items-center gap-1 text-ink/80 hover:text-velvet">
                            <Phone className="size-3" /> {d.phone}
                          </a>
                        )}
                        {d.website && (
                          <a href={d.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-ink/80 hover:text-velvet">
                            <Globe className="size-3" /> Visit website
                          </a>
                        )}
                        {!d.phone && !d.website && d.rating == null && (
                          <p className="text-ink/50">No additional details available.</p>
                        )}
                      </div>
                    )}
                    {d === "error" && (
                      <p className="mt-2 text-[11px] text-ink/50">Couldn't load contact details.</p>
                    )}

                    <div className="mt-3 flex flex-col gap-1.5">
                      {!d && (
                        <button onClick={() => loadDetails(b)}
                          className="rounded-full border border-ink/10 px-3 py-1.5 text-center text-[11px] font-medium text-ink/70 hover:border-velvet/40 hover:text-velvet">
                          See phone, rating & website
                        </button>
                      )}
                      {d === "loading" && (
                        <p className="py-1.5 text-center text-[11px] text-ink/50">Loading details…</p>
                      )}
                      {b.mapsUrl && (
                        <a href={b.mapsUrl} target="_blank" rel="noreferrer"
                          className="rounded-full bg-ink px-3 py-1.5 text-center text-[11px] font-medium text-white hover:opacity-90">
                          View on Google Maps ↗
                        </a>
                      )}
                      <button onClick={() => setInviteFor(b)}
                        className="rounded-full bg-velvet px-3 py-1.5 text-center text-[11px] font-medium text-white hover:opacity-90">
                        Invite to bid here
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {inviteFor && (
          <InviteToBidModal
            biz={inviteFor}
            phone={(details[inviteFor.id] as Details | undefined)?.phone ?? undefined}
            onClose={() => setInviteFor(null)}
          />
        )}
      </div>
    </section>
  );
}

function InviteToBidModal({ biz, phone, onClose }: { biz: Biz; phone?: string; onClose: () => void }) {
  const dialogRef = useDialogA11y(onClose);
  const [rfqs, setRfqs] = useState<any[] | null>(null);
  const [rfqId, setRfqId] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ url: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listMyRfqs().then((r) => {
      if (!alive) return;
      const open = r.filter((x: any) => x.status === "open");
      setRfqs(open);
      if (open[0]) setRfqId(open[0].id);
    }).catch(() => {
      if (!alive) return;
      setRfqs([]);
      setErr("Sign in to invite a vendor to bid.");
    });
    return () => { alive = false; };
  }, []);

  async function send() {
    if (!rfqId) return;
    setSending(true);
    setErr(null);
    const res = await inviteDiscoveredVendorToBid({
      data: {
        rfq_id: rfqId,
        external_business_id: biz.id,
        business_name: biz.name,
        phone,
      },
    });
    setSending(false);
    if ("error" in res) setErr(res.error ?? "Error");
    else setDone({ url: `${window.location.origin}/claim/${res.claim_token}` });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif text-xl">Invite {biz.name} to bid</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          We'll generate a private link they can use to claim a profile and submit a bid on your RFQ.
        </p>
        {rfqs === null ? (
          <p className="mt-4 text-sm">Loading…</p>
        ) : rfqs.length === 0 ? (
          <div className="mt-4 rounded-lg bg-secondary p-3 text-sm">
            You don't have any open RFQs yet. <Link to="/rfq" className="text-velvet underline">Post one first →</Link>
          </div>
        ) : !done ? (
          <>
            <label className="mt-4 block text-xs font-medium text-muted-foreground">
              Attach to RFQ
              <select value={rfqId} onChange={(e) => setRfqId(e.target.value)}
                className="mt-1 w-full rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-ink/10">
                {rfqs.map((r) => <option key={r.id} value={r.id}>{r.subject}</option>)}
              </select>
            </label>
            {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={send} disabled={sending}
                className="rounded-full bg-velvet px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
                {sending ? "Generating…" : "Generate invite link"}
              </button>
              <button onClick={onClose} className="rounded-full bg-secondary px-4 py-1.5 text-xs font-medium">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">Share this link with the vendor (text, email, etc.):</p>
            <input readOnly value={done.url} onFocus={(e) => e.currentTarget.select()}
              className="mt-2 w-full rounded-lg bg-secondary px-3 py-2 text-xs ring-1 ring-ink/10" />
            <button onClick={() => { navigator.clipboard.writeText(done.url); }}
              className="mt-2 rounded-full bg-velvet px-3 py-1.5 text-[11px] font-medium text-white">
              Copy link
            </button>
            <button onClick={onClose} className="ml-2 rounded-full bg-secondary px-3 py-1.5 text-[11px]">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
