import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getRfqByToken, postRfqBidByToken, declineRfqByToken } from "@/lib/rfq.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/rfq-bid/$token")({
  head: () => ({
    meta: [
      { title: "Submit a bid — The Kenroe Collective" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content:
          "Vendors invited through The Kenroe Collective can preview the event request and submit a single bid here — no account required.",
      },
    ],
  }),
  component: RfqBidPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="font-serif text-2xl">We couldn't load this invitation.</h1>
      <p className="mt-2 text-sm text-neutral-600">{error?.message ?? "Unknown error"}</p>
      <Link to="/" className="mt-4 inline-block text-sm underline">Return home</Link>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="font-serif text-2xl">Invitation not found</h1>
      <p className="mt-2 text-sm text-neutral-600">
        This RFQ may have been closed or the link is no longer valid.
      </p>
      <Link to="/" className="mt-4 inline-block text-sm underline">Return home</Link>
    </div>
  ),
});

interface RfqPayload {
  invitation?: {
    id: string;
    status: string;
    vendor_id: string | null;
    vendor_name: string | null;
    business_name: string | null;
    responded_at: string | null;
  };
  rfq?: {
    id: string;
    subject: string;
    category: string;
    message: string;
    location: string | null;
    event_date: string | null;
    guest_count: number | null;
    budget_min: number | null;
    budget_max: number | null;
    status: string;
    created_at: string;
  };
  error?: string;
}

function RfqBidPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const fetchFn = useServerFn(getRfqByToken);
  const submitFn = useServerFn(postRfqBidByToken);
  const declineFn = useServerFn(declineRfqByToken);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RfqPayload | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [avail, setAvail] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = (await fetchFn({ data: { token } })) as RfqPayload;
        if (!cancelled) setData(res);
      } catch (e: any) {
        if (!cancelled) setData({ error: e?.message ?? "load_failed" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, fetchFn]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      toast.error("Please add a short message for the host.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitFn({
        data: {
          token,
          bid_amount: amount ? Number(amount) : undefined,
          availability_note: avail || undefined,
          body,
        },
      });
      if ((res as any)?.error) {
        toast.error((res as any).error);
      } else {
        toast.success("Bid sent — the host has been notified.");
        setDone(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onDecline() {
    const reason = window.prompt(
      "Optional: a brief reason (booked, out of area, not our category…). Leave blank to just decline.",
      "",
    );
    if (reason === null) return; // user cancelled
    setDeclining(true);
    try {
      const res = await declineFn({ data: { token, reason: reason || undefined } });
      if ((res as any)?.error) {
        toast.error((res as any).error);
      } else {
        toast.success("Thanks — we've let the host know you're not available.");
        setDeclined(true);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not decline");
    } finally {
      setDeclining(false);
    }
  }


  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-neutral-600">
        Loading invitation…
      </div>
    );
  }
  if (!data || data.error || !data.rfq) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="font-serif text-2xl">Invitation not found</h1>
        <p className="mt-2 text-sm text-neutral-600">
          {data?.error === "rfq_closed"
            ? "This request has already been closed by the host."
            : "This RFQ link is no longer valid."}
        </p>
        <button
          onClick={() => navigate({ to: "/" })}
          className="mt-4 rounded-full bg-velvet px-4 py-2 text-sm text-white"
        >
          Return home
        </button>
      </div>
    );
  }

  const { rfq, invitation } = data;
  const alreadyResponded = invitation?.status === "responded";
  const facts: string[] = [];
  if (rfq.category) facts.push(rfq.category);
  if (rfq.location) facts.push(rfq.location);
  if (rfq.event_date) facts.push(rfq.event_date);
  if (rfq.guest_count) facts.push(`${rfq.guest_count} guests`);
  if (rfq.budget_max) facts.push(`Budget up to $${rfq.budget_max}`);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.18em] text-velvet/70">
          The Kenroe Collective
        </p>
        <h1 className="mt-2 font-serif text-3xl">{rfq.subject}</h1>
        {facts.length > 0 && (
          <p className="mt-2 text-sm font-medium text-velvet">{facts.join("  •  ")}</p>
        )}
      </div>

      <section className="mb-8 rounded-2xl border border-velvet/15 bg-white p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          The brief
        </h2>
        <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-700">{rfq.message}</p>
      </section>

      {declined ? (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-center">
          <h2 className="font-serif text-xl text-neutral-900">Declined — got it.</h2>
          <p className="mt-1 text-sm text-neutral-600">
            We've removed you from this request. You'll still receive future invitations that match
            your service area.
          </p>
        </div>
      ) : alreadyResponded || done ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <h2 className="font-serif text-xl text-emerald-900">Thanks — your bid is in.</h2>
          <p className="mt-1 text-sm text-emerald-800">
            The host has been notified. To continue the conversation, sign in with the email this
            invitation was sent to.
          </p>
          <Link
            to="/auth"
            search={{ redirect: undefined }}
            className="mt-4 inline-block rounded-full bg-velvet px-5 py-2 text-sm text-white"
          >
            Sign in to follow up
          </Link>
        </div>
      ) : (
        <>
          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-2xl border border-velvet/15 bg-white p-5"
          >
            <h2 className="font-serif text-xl">Submit your bid</h2>
            <p className="text-xs text-neutral-500">
              Replying as <strong>{invitation?.vendor_name ?? invitation?.business_name ?? "vendor"}</strong>.
              No account needed for your first response.
            </p>

            <label className="block text-sm">
              <span className="text-neutral-700">Bid amount (USD)</span>
              <input
                type="number"
                min={0}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 4200"
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-sm">
              <span className="text-neutral-700">Availability note</span>
              <input
                type="text"
                value={avail}
                onChange={(e) => setAvail(e.target.value)}
                placeholder="e.g. Available May 12; deposit due 30 days prior"
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                maxLength={500}
              />
            </label>

            <label className="block text-sm">
              <span className="text-neutral-700">Message to the host *</span>
              <textarea
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                maxLength={4000}
                placeholder="Tell the host what's included, your process, and anything they should know."
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-velvet px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Submit bid"}
            </button>
          </form>

          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={onDecline}
              disabled={declining}
              className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline disabled:opacity-50"
            >
              {declining ? "Declining…" : "Not a fit — decline politely"}
            </button>
          </div>
        </>
      )}

      <p className="mt-6 text-center text-xs text-neutral-400">
        Powered by The Kenroe Collective
      </p>
    </div>
  );
}
