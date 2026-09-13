import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { supabase } from "@/integrations/supabase/client";
import { getRfq, postRfqMessage, acceptBid, closeRfq } from "@/lib/rfq.functions";
import { getMyVendor } from "@/lib/vendors.functions";
import { confirmDialog } from "@/lib/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Gavel } from "lucide-react";
import { VerifiedBadge } from "@/components/vendor-verified-badge";
import { formatDateOnly } from "@/lib/date-only";
import { formatTimestamp } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/rfq/$rfqId")({
  validateSearch: (s: Record<string, unknown>) => ({
    from: s.from === "sent" || s.from === "received" ? (s.from as "sent" | "received") : undefined,
  }),
  head: () => ({ meta: [{ title: "RFQ — The Kenroe Collective" }] }),
  component: RfqDetailPage,
});

function RfqDetailPage() {
  const { rfqId } = Route.useParams();
  const { from } = Route.useSearch();
  const [data, setData] = useState<any>(null);
  const [me, setMe] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [availability, setAvailability] = useState("");
  const [isBid, setIsBid] = useState(false);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(false);

  async function reload() {
    const d = await getRfq({ data: { id: rfqId } });
    setData(d);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    reload();
  }, [rfqId]);

  useEffect(() => {
    // If user owns a vendor profile, surface it for bid posting.
    // public.vendors is PRIVACY LOCKED, so this goes through the server
    // function instead of a direct browser read of the base table.
    if (!me) return;
    getMyVendor()
      .then((res: any) => setVendorId(res?.vendor?.id ?? null))
      .catch(() => setVendorId(null));
  }, [me]);

  if (!data) return <div className="min-h-screen bg-paper"><SiteNav /><p className="p-8 text-sm">Loading…</p></div>;

  const rfq = data.rfq;
  const isOwner = me === rfq.requester_user_id;
  const messages = data.messages as any[];
  const vendorMap: Record<
    string,
    { name: string; slug: string; verified: boolean; heroImage: string | null; avgRating: number; reviewCount: number }
  > = data.vendorMap;
  const bids = messages.filter((m) => m.is_bid);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    await postRfqMessage({
      data: {
        rfq_id: rfqId,
        body: body.trim(),
        is_bid: isBid,
        bid_amount: isBid && bidAmount ? Number(bidAmount) : undefined,
        availability_note: isBid && availability ? availability : undefined,
        vendor_id: isBid && vendorId ? vendorId : undefined,
      },
    });
    setBody(""); setBidAmount(""); setAvailability(""); setIsBid(false);
    setBusy(false);
    reload();
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="border-b border-ink/5 py-8">
        <div className="mx-auto max-w-4xl px-6">
          <Link
            to="/vendor-hub"
            search={{ tab: from ?? "sent" }}
            className="text-xs text-velvet hover:underline"
          >
            ← All RFQs
          </Link>
          <div className="mt-2 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-velvet">{rfq.category ?? "Request"}</p>
              <h1 className="mt-1 font-serif text-3xl">{rfq.subject}</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {rfq.location && `${rfq.location} · `}
                {rfq.event_date && `Event ${formatDateOnly(rfq.event_date)} · `}
                {rfq.guest_count && `${rfq.guest_count} guests · `}
                {(rfq.budget_min || rfq.budget_max) && `Budget $${rfq.budget_min ?? "?"}–$${rfq.budget_max ?? "?"}`}
              </p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              rfq.status === "awarded" ? "bg-emerald-50 text-emerald-700" :
              rfq.status === "closed" ? "bg-secondary text-muted-foreground" :
              "bg-velvet/10 text-velvet"
            }`}>{rfq.status}</span>
          </div>
          <p className="mt-3 whitespace-pre-line text-sm">{rfq.message}</p>
          {isOwner && rfq.status === "open" && (
            <button
              onClick={async () => {
                const ok = await confirmDialog({
                  title: "Close this RFQ?",
                  body: "Vendors will no longer be able to message or bid on this request. This can't be undone.",
                  confirmLabel: "Yes, close it",
                  tone: "danger",
                });
                if (!ok) return;
                await closeRfq({ data: { id: rfqId } });
                reload();
              }}
              className="mt-3 text-xs text-rose-600 hover:underline"
            >
              Close this RFQ
            </button>
          )}
        </div>
      </section>

      <section className="py-8">
        <div className="mx-auto max-w-4xl px-6">
          {bids.length > 0 ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-serif text-xl">Bids ({bids.length})</h2>
                {isOwner && bids.length > 1 && (
                  <button
                    onClick={() => setCompare((v) => !v)}
                    className="rounded-full border border-ink/15 px-3 py-1 text-[11px] hover:bg-ink/5"
                  >
                    {compare ? "List view" : "Compare side-by-side"}
                  </button>
                )}
              </div>
              {compare ? (
                <div className="overflow-x-auto rounded-2xl ring-1 ring-ink/10">
                  <table className="min-w-full text-sm">
                    <thead className="bg-velvet/5 text-left text-[11px] uppercase tracking-wider text-velvet">
                      <tr>
                        <th className="px-3 py-2">Vendor</th>
                        <th className="px-3 py-2">Reviews</th>
                        <th className="px-3 py-2 text-right">Bid</th>
                        <th className="px-3 py-2">Timeline</th>
                        <th className="px-3 py-2">Pitch</th>
                        <th className="px-3 py-2">Status</th>
                        {isOwner && rfq.status === "open" && <th className="px-3 py-2"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5 bg-card">
                      {[...bids]
                        .sort((a, b) => (a.bid_amount ?? Infinity) - (b.bid_amount ?? Infinity))
                        .map((b) => {
                          const v = b.vendor_id ? vendorMap[b.vendor_id] : undefined;
                          const vname = v?.name ?? "Vendor";
                          return (
                            <tr key={b.id} className={b.bid_status === "accepted" ? "bg-emerald-50/60" : b.bid_status === "declined" ? "opacity-50" : ""}>
                              <td className="px-3 py-2 font-medium">
                                <div className="flex items-center gap-2">
                                  {v?.heroImage && (
                                    <img src={v.heroImage} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-ink/10" />
                                  )}
                                  <div>
                                    {b.vendor_id && v ? (
                                      <Link to="/vendors/$slug" params={{ slug: v.slug }} className="hover:underline">{vname}</Link>
                                    ) : vname}
                                    {v?.verified && <VerifiedBadge className="ml-2 align-middle" />}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {v && v.reviewCount > 0 ? `${v.avgRating.toFixed(1)} ★ (${v.reviewCount})` : "No reviews yet"}
                              </td>
                              <td className="px-3 py-2 text-right font-serif text-velvet">
                                {b.bid_amount != null ? `$${Number(b.bid_amount).toLocaleString()}` : "—"}
                              </td>
                              <td className="px-3 py-2 text-xs">{b.availability_note ?? "—"}</td>
                              <td className="max-w-xs px-3 py-2 text-xs text-muted-foreground line-clamp-3">{b.body}</td>
                              <td className="px-3 py-2 text-xs">
                                {b.bid_status === "accepted" ? "✓ Awarded" : b.bid_status === "declined" ? "Declined" : "Pending"}
                              </td>
                              {isOwner && rfq.status === "open" && (
                                <td className="px-3 py-2">
                                  {b.bid_status === "pending" && (
                                    <button onClick={async () => {
                                      const r = await acceptBid({ data: { rfq_id: rfqId, message_id: b.id } });
                                      const n = (r as any)?.notified ?? 0;
                                      if (n > 0) {
                                        const { toast } = await import("sonner");
                                        toast.success(`Awarded. Other ${n} vendor${n === 1 ? "" : "s"} notified politely.`);
                                      }
                                      reload();
                                    }}
                                      className="rounded-full bg-velvet px-3 py-1 text-[11px] font-medium text-white hover:opacity-90">
                                      Award
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-3">
                  {bids.map((b) => {
                    const v = b.vendor_id ? vendorMap[b.vendor_id] : undefined;
                    const vname = v?.name ?? "Vendor";
                    return (
                      <div key={b.id} className={`rounded-2xl p-4 ring-1 ${
                        b.bid_status === "accepted" ? "bg-emerald-50 ring-emerald-200" :
                        b.bid_status === "declined" ? "bg-secondary/30 ring-ink/5 opacity-60" :
                        "bg-card ring-ink/5"
                      }`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            {v?.heroImage && (
                              <img src={v.heroImage} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-ink/10" />
                            )}
                            <div>
                              <p className="font-medium">
                                {b.vendor_id && v ? (
                                  <Link to="/vendors/$slug" params={{ slug: v.slug }} className="hover:underline">
                                    {vname}
                                  </Link>
                                ) : vname}
                                {v?.verified && <VerifiedBadge className="ml-2 align-middle" />}
                                {b.bid_amount != null && (
                                  <span className="ml-2 font-serif text-lg text-velvet">${Number(b.bid_amount).toLocaleString()}</span>
                                )}
                              </p>
                              {v && v.reviewCount > 0 && (
                                <p className="text-xs text-muted-foreground">{v.avgRating.toFixed(1)} ★ ({v.reviewCount} review{v.reviewCount === 1 ? "" : "s"})</p>
                              )}
                              {b.availability_note && <p className="text-xs text-muted-foreground">Available: {b.availability_note}</p>}
                              <p className="mt-2 whitespace-pre-line text-sm">{b.body}</p>
                            </div>
                          </div>
                          {isOwner && rfq.status === "open" && b.bid_status === "pending" && (
                            <button onClick={async () => {
                              const r = await acceptBid({ data: { rfq_id: rfqId, message_id: b.id } });
                              const n = (r as any)?.notified ?? 0;
                              if (n > 0) {
                                const { toast } = await import("sonner");
                                toast.success(`Awarded. Other ${n} vendor${n === 1 ? "" : "s"} notified politely.`);
                              }
                              reload();
                            }}
                              className="shrink-0 rounded-full bg-velvet px-3 py-1 text-[11px] font-medium text-white hover:opacity-90">
                              Award bid
                            </button>
                          )}
                          {b.bid_status === "accepted" && <span className="shrink-0 text-xs text-emerald-700">✓ Awarded</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={Gavel}
              title="No bids yet"
              description="Invite vendors or share your RFQ link to collect bids."
              cta={{
                label: "Share RFQ",
                onClick: () => {
                  const invitations = data.invitations as { claim_token?: string }[];
                  const token = invitations.find((i) => i.claim_token)?.claim_token;
                  const shareUrl = token
                    ? `${window.location.origin}/rfq-bid/${token}`
                    : `${window.location.origin}/rfq/${rfqId}`;
                  navigator.clipboard.writeText(shareUrl).then(() => {
                    import("sonner").then(({ toast }) => toast.success("RFQ link copied to clipboard"));
                  });
                },
              }}
            />
          )}

          <h2 className="mt-8 mb-3 font-serif text-xl">Messages</h2>
          <div className="space-y-2">
            {messages.filter((m) => !m.is_bid).map((m) => (
              <div key={m.id} className={`rounded-2xl p-3 ring-1 ring-ink/5 ${m.sender_user_id === me ? "bg-velvet/5" : "bg-card"}`}>
                <p className="text-[10px] text-muted-foreground">{formatTimestamp((m.created_at))}</p>
                <p className="text-sm">{m.body}</p>
              </div>
            ))}
          </div>

          {rfq.status === "open" && (
            <div className="mt-6 rounded-2xl bg-card p-4 ring-1 ring-ink/5">
              {vendorId && !isOwner && (
                <label className="mb-2 flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={isBid} onChange={(e) => setIsBid(e.target.checked)} />
                  Submit as a bid
                </label>
              )}
              {isBid && (
                <div className="mb-2 grid gap-2 sm:grid-cols-2">
                  <input type="number" placeholder="Bid amount ($)" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)}
                    className="rounded-lg bg-paper px-3 py-2 text-sm ring-1 ring-ink/10" />
                  <input placeholder="Availability note" value={availability} onChange={(e) => setAvailability(e.target.value)}
                    className="rounded-lg bg-paper px-3 py-2 text-sm ring-1 ring-ink/10" />
                </div>
              )}
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder={isBid ? "Pitch your bid…" : "Write a message…"}
                className="w-full rounded-lg bg-paper px-3 py-2 text-sm ring-1 ring-ink/10" />
              <button onClick={send} disabled={busy || !body.trim()}
                className="mt-2 rounded-full bg-velvet px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busy ? "Sending…" : isBid ? "Submit bid" : "Send message"}
              </button>
            </div>
          )}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
