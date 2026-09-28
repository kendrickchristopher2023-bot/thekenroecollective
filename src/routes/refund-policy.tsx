import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { RefundTerms, useRefundCopy } from "@/components/refund-terms";

export const REFUND_POLICY_VERSION = "2026-07-12";

export const Route = createFileRoute("/refund-policy")({
  head: () => ({
    meta: [
      { title: "Refund Policy — The Kenroe Collective" },
      { name: "description", content: "Refund policy for The Kenroe Collective: 24-hour window on unused one-time event passes, subscription rules, and dispute terms." },
      { property: "og:title", content: "Refund Policy — The Kenroe Collective" },
      { property: "og:description", content: "24-hour refund window on unused one-time passes. Subscriptions are non-refundable. One refund per customer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/refund-policy" }],
  }),
  component: RefundPolicyPage,
});

function RefundPolicyPage() {
  const studioCopy = useRefundCopy();
  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="mx-auto max-w-3xl px-6 py-20">
        <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">Legal</span>
        <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">Refund Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Version {REFUND_POLICY_VERSION}</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-ink/80">
          <section>
            <h2 className="font-serif text-xl font-medium text-ink">1. One-time single-event passes</h2>
            <p className="mt-2">
              Whisper, Host, and Atelier single-event passes ("Passes") are one-time purchases attached to a
              single event. A Pass is <strong>cancellable within twenty-four (24) hours of purchase, and only if
              it has NOT been materially used</strong>. After the 24-hour window OR the first material use —
              whichever occurs first — <strong>all sales are final</strong>.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">2. What counts as material use</h2>
            <p className="mt-2">
              Any of the following delivery actions on the event the Pass is attached to constitutes material use
              and immediately ends refund eligibility, whether or not the Pass has been formally attached:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>An invitation email or reminder is sent through our platform.</li>
              <li>An SMS message is queued or delivered.</li>
              <li>An AI generation (text or image) is run.</li>
              <li>Any export is produced (PDF, ICS, CSV, printable, or otherwise).</li>
              <li>An announcement is published.</li>
              <li>Guest check-in is activated (QR scanning turned on).</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Merely creating or editing an event, uploading media, or previewing an invitation does <em>not</em>
              trigger material use. Any of the above triggers, however, constitutes acceptance of delivery of the
              digital service.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">3. How to request a refund</h2>
            <p className="mt-2">
              A self-serve "Cancel purchase" button appears next to the Pass in your account while the Pass
              remains refund-eligible. Clicking it re-verifies eligibility on our servers, issues a Stripe refund
              to the original payment method, and revokes the Pass immediately. Refunds typically settle in
              5–10 business days.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">4. Subscriptions</h2>
            <p className="mt-2">
              Monthly subscriptions are billed one month at a time with no minimum commitment. You may cancel at any time and will retain access through the end of the current billing period. Yearly plans are billed once a year. <strong>Partial-period refunds are not issued.</strong>
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">5. One refund per customer</h2>
            <p className="mt-2">
              The self-serve refund button is available <strong>once per customer, for one Pass</strong>. If you
              have previously received a refund on any Pass and believe another is warranted, please contact
              support — we review requests case-by-case.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">6. AI generation and other usage limits</h2>
            <p className="mt-2">
              Atelier single-event Passes include a fair-use cap of 150 AI generations per Pass. Reaching a
              usage cap does not entitle you to a refund; you may upgrade to an Atelier subscription for
              unlimited generations.
            </p>
          </section>

          <section>

            <h2 className="font-serif text-xl font-medium text-ink">6a. Kenroe Sound Studio pieces</h2>
            <p className="mt-2">
              Composed songs, poems and letters read aloud have their own terms, shown again before you pay:
            </p>
            <div className="mt-3 rounded-xl bg-ink/[0.03] p-4">
              <RefundTerms copy={studioCopy} />
            </div>
            {studioCopy?.updatedAt ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Studio wording last changed {new Date(studioCopy.updatedAt).toLocaleDateString()}.
              </p>
            ) : null}
          </section>


          <section>
            <h2 className="font-serif text-xl font-medium text-ink">7. Chargebacks and disputes</h2>
            <p className="mt-2">
              <strong>Initiating a payment dispute or chargeback for services already delivered constitutes a
              breach of these Terms.</strong> "Delivered" includes any material use as defined in Section 2. In
              response to a chargeback for delivered services we may (a) suspend the associated account, (b)
              submit as dispute evidence: server-side usage logs, our consent record of your acceptance of these
              Terms and this Refund Policy at checkout, your IP address and user-agent string at the time of
              purchase, and any communications received; and (c) seek recovery of chargeback fees. We reserve
              all remedies at law.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">8. Questions</h2>
            <p className="mt-2">
              See the <Link to="/terms" className="text-velvet underline">Terms &amp; Conditions</Link> for
              related provisions. Contact us via the <Link to="/contact" className="text-velvet underline">contact
              page</Link> if anything is unclear.
            </p>
          </section>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
