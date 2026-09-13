import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { useContactEmail } from "@/hooks/use-contact-email";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — The Kenroe Collective" },
      { name: "description", content: "Terms of service for The Kenroe Collective event-management platform — accounts, payments, subscriptions, and user responsibilities." },
      { property: "og:title", content: "Terms & Conditions — The Kenroe Collective" },
      { property: "og:description", content: "Terms of service for the The Kenroe Collective platform." },
      { property: "og:url", content: "https://thekenroecollective.com/terms" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  const email = useContactEmail();
  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="mx-auto max-w-3xl px-6 py-20">
        <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">Legal</span>
        <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">Terms & Conditions</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: July 9, 2026</p>

        <div className="mt-12 space-y-10 text-sm leading-relaxed text-ink/80">
          <section>
            <h2 className="font-serif text-xl font-medium text-ink">1. Acceptance of Terms</h2>
            <p className="mt-2">
              By accessing or using The Kenroe Collective ("we," "us," or "our") — including our website, mobile
              experiences, and related services (collectively, the "Service") — you agree to be bound by these
              Terms & Conditions ("Terms"). If you do not agree, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">2. Description of Service</h2>
            <p className="mt-2">
              The Kenroe Collective is an editorial event-management platform that helps users plan, organize, and
              celebrate life's milestones. Our tools include digital invitation design, RSVP tracking, guest
              management, gift-registry linking, contribution collection, vendor coordination, timeline
              management, printed thank-you card services, and AI-generated invitation artwork.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">3. User Accounts</h2>
            <p className="mt-2">
              You must provide accurate and complete information when creating an account. You are responsible
              for maintaining the confidentiality of your account credentials and for all activity that occurs
              under your account. You must be at least 13 years old to use the Service. If you are under 18,
              you represent that you have parental or guardian consent.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">4. Subscription Plans & Payments</h2>
            <p className="mt-2">
              We offer tiered paid plans: a one-time Whisper unlock, and Host and Atelier subscriptions. Paid subscriptions are billed in advance on a monthly or yearly basis through our
              payment processor, Stripe. By subscribing, you authorize us to charge your selected payment method
              for the subscription fee plus any applicable taxes.
            </p>
            <p className="mt-2">
              Subscriptions automatically renew at the end of each billing period unless you cancel. You may
              cancel at any time through your billing portal or by contacting support. Cancellation takes effect
              at the end of your current billing period; you will retain access until then. We do not provide
              partial refunds for unused time unless required by law.
            </p>
            <p className="mt-2">
              Monthly subscriptions are billed one month at a time with no minimum commitment. You may cancel at any time and will retain access through the end of the current billing period. Yearly plans are billed once a year.
            </p>
            <p className="mt-2">
              We reserve the right to change our pricing with reasonable notice. Any price changes will apply at
              the start of your next billing cycle.
            </p>
            <p className="mt-2">
              <strong>One-time single-event passes.</strong> Whisper, Host, and Atelier single-event passes are
              one-time, non-recurring purchases attached to a single event of your choice. Each pass is
              cancellable within twenty-four (24) hours of purchase <em>only if</em> it has not been materially
              used; after 24 hours or after first material use — whichever occurs first — <strong>all sales are
              final</strong>. Material use is defined in our{" "}
              <Link to="/refund-policy" className="text-velvet underline">Refund Policy</Link>.
              Atelier single-event passes include a fair-use cap of 150 AI generations per pass. Passes remain
              usable through the earlier of (a) the event date plus ninety (90) days or (b) twelve (12) months
              from purchase.
            </p>
            <p className="mt-2">
              <strong>One refund per customer.</strong> Self-serve refunds are limited to one per customer
              lifetime. Additional refund requests must be submitted to support and are reviewed case-by-case.
            </p>
            <p className="mt-2">
              <strong>Chargebacks.</strong> Initiating a payment dispute or chargeback for services already
              delivered constitutes a breach of these Terms. In response we may suspend the associated account
              and submit as evidence: our server-side usage records, your recorded acceptance of these Terms and
              our Refund Policy at checkout, your IP address and user-agent string at the time of purchase, and
              any related communications. We reserve the right to seek recovery of chargeback fees.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">5. Add-Ons & Additional Services</h2>
            <p className="mt-2">
              Optional add-ons such as printed thank-you cards and card packs are
              available for separate purchase. Prices and availability are listed at checkout. Printed card
              deliveries require accurate shipping information; we are not responsible for delays or failures
              caused by incorrect addresses.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">6. Acceptable Use</h2>
            <p className="mt-2">
              You agree not to use the Service to: (a) violate any law or regulation; (b) infringe intellectual
              property rights; (c) send spam, harassment, or harmful content to guests or other users;
              (d) attempt to gain unauthorized access to our systems; (e) interfere with the Service's
              availability or integrity; or (f) use AI-generated content in ways that violate our content
              policies or applicable laws.
            </p>
            <p className="mt-2">
              We may suspend or terminate your account for violations of these rules.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">7. Intellectual Property</h2>
            <p className="mt-2">
              All content, trademarks, software, and designs on the Service are owned by The Kenroe Collective or
              our licensors. You retain ownership of content you upload (such as event details, guest lists, and
              custom invitation text). By uploading content, you grant us a limited license to use, display,
              and process it solely to provide and improve the Service.
            </p>
            <p className="mt-2">
              AI-generated artwork created through our platform is provided under a personal, non-exclusive
              license for your events. You may not resell or redistribute AI-generated artwork outside the
              context of your event planning without our written permission.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">8. Third-Party Services</h2>
            <p className="mt-2">
              The Service integrates with third-party services including Stripe (payments), Supabase (data
              hosting), and external registry platforms (Amazon, Target, Walmart, etc.). Your use of these
              services is governed by their respective terms. We are not responsible for the availability,
              accuracy, or practices of third-party services.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">9. Disclaimers & Limitation of Liability</h2>
            <p className="mt-2">
              The Service is provided "as is" without warranties of any kind, express or implied. We do not
              guarantee that the Service will be uninterrupted, error-free, or completely secure.
            </p>
            <p className="mt-2">
              To the maximum extent permitted by law, The Kenroe Collective and its affiliates shall not be liable
              for any indirect, incidental, special, consequential, or punitive damages, or for any loss of
              profits, revenue, data, or goodwill arising from your use of the Service. Our total liability shall
              not exceed the amount you paid to us in the 12 months preceding the claim, or $100 if you have
              not paid.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">10. Indemnification</h2>
            <p className="mt-2">
              You agree to indemnify and hold harmless The Kenroe Collective, its officers, directors, employees,
              and agents from any claims, damages, losses, or expenses (including reasonable legal fees) arising
              from your use of the Service, your content, or your violation of these Terms.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">10a. Referral Program</h2>
            <p className="mt-2">
              Active subscribers receive a personal referral code (e.g. <code>KENROE-XXXXXX</code>) that offers
              a 20% discount to a new subscriber's first paid month or year. Each referred account may redeem
              exactly one referral code, and only on their first paid subscription — the code is void for accounts
              that have previously held any paid subscription. You may not redeem your own referral code.
            </p>
            <p className="mt-2">
              When a referred subscriber's first payment succeeds, we will credit the referring account with one
              additional free month on their active plan (or an equivalent account credit if the referring plan
              is annual or inactive). Credits are non-transferable, have no cash value, and are void if either
              account is closed, refunded, or found to have abused the program. We may modify or discontinue
              the referral program at any time with reasonable notice.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">10b. Event Announcements & Broadcast Messages</h2>
            <p className="mt-2">
              Hosts may send broadcast announcements (email, SMS, or in-app) to guests they have added to their
              own events. By using this feature, hosts represent that they have permission to contact those
              guests for event-related purposes and agree not to send unsolicited marketing, spam, or content
              that violates our Acceptable Use rules (Section 6). Guests may unsubscribe from any host's
              announcements at any time via the link in the email or from their guest preferences page, and we
              honor unsubscribes within 24 hours. We reserve the right to suspend broadcast privileges for any
              account found abusing this feature.
            </p>
          </section>


          <section>
            <h2 className="font-serif text-xl font-medium text-ink">11. Governing Law</h2>
            <p className="mt-2">
              These Terms are governed by the laws of the State of New York, without regard to conflict-of-law
              principles. Any disputes shall be resolved in the state or federal courts located in New York
              County, New York.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">12. Changes to These Terms</h2>
            <p className="mt-2">
              We may update these Terms from time to time. We will notify you of material changes via email or
              through the Service. Continued use after changes constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">13. Contact</h2>
            <p className="mt-2">
              Questions about these Terms? Reach us at{" "}
              <a href={`mailto:${email}`} className="text-velvet underline underline-offset-4">
                {email}
              </a>{" "}
              or through our{" "}
              <Link to="/contact" className="text-velvet underline underline-offset-4">
                contact form
              </Link>.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">14. Host Responsibility for Guest Data</h2>
            <p className="mt-2">
              By uploading or entering Guest information (names, email addresses, phone numbers, mailing addresses, or other personal information) into the Service, you represent and warrant that: (a) you have a lawful basis to provide this information to us for the purpose of event communication; (b) you have informed each Guest that their information will be processed by The Kenroe Collective for event-related communications; and (c) you will not upload the personal information of children under 13 without verifiable parental consent. You agree to indemnify and hold harmless The Kenroe Collective from any claims arising from your failure to comply with this section.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">15. User-Generated Content and DMCA</h2>
            <p className="mt-2">
              You retain ownership of content you upload to the Service, including photos, images, and text. By uploading content, you grant The Kenroe Collective a limited, non-exclusive, royalty-free, worldwide license to host, display, reproduce, and distribute the content solely in connection with the Service and the event for which it was uploaded. You represent that you have all necessary rights and consents to upload the content, including the consent of identifiable individuals in photos. The Kenroe Collective may remove content that violates these Terms, applicable law, or that we receive a valid DMCA takedown notice for. To report infringing content, contact our designated DMCA agent using the information below.
            </p>
            <div className="mt-6 rounded-lg border border-ink/10 bg-secondary/40 p-5">
              <h3 className="font-serif text-lg font-medium text-ink">DMCA Designated Agent</h3>
              <p className="mt-2">
                To submit a copyright infringement notification, please contact our designated agent:
              </p>
              <address className="mt-2 not-italic text-ink">
                United States Corporation Agents, Inc.<br />
                6135 Park South Drive, Suite 510<br />
                Charlotte, NC 28210<br />
                Phone: <a href="tel:1-800-773-0888" className="text-velvet underline underline-offset-4">1-800-773-0888</a><br />
                Email: <a href="mailto:support@legalzoom.com" className="text-velvet underline underline-offset-4">support@legalzoom.com</a><br />
                Email: <a href="mailto:support@thekenroecollective.com" className="text-velvet underline underline-offset-4">support@thekenroecollective.com</a>
              </address>
              <p className="mt-2">
                For your notification to be valid under the DMCA, it must include all elements required by 17 U.S.C. § 512(c)(3).
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">16. Photo Wall Content Moderation</h2>
            <p className="mt-2">
              Hosts are responsible for moderating content on their event's Photo Wall. The Kenroe Collective provides tools for Hosts to remove inappropriate content. We reserve the right to remove content that violates our Terms of Service or applicable law, but we are not obligated to monitor or review all user-generated content.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">17. Payments and Refunds</h2>
            <p className="mt-2">
              Monthly subscriptions are billed one month at a time with no minimum commitment; you may cancel at any time and access continues through the end of the current billing period. Annual plans are billed once a year. Because our services are delivered immediately upon purchase, all sales are final and we do not issue refunds. Payments are processed by Stripe. We do not store your full payment card details.
            </p>
            <p className="mt-2">
              <strong>Single-event passes.</strong> Host and Atelier are also available as one-time single-event passes ($49 and $99 respectively). Each pass attaches to a single event of your choice and grants that tier's features for the event date + 90 days, up to 12 months from purchase, whichever comes first. Atelier single-event passes include a fair-use cap of 150 AI generations per pass; additional AI generation requires an Atelier subscription. Single-event passes are non-refundable, non-transferable, and cannot be re-attached to a different event once assigned. All sales are final.
            </p>
            <p className="mt-2">
              <strong>Group eCards.</strong> Creating a Group eCard and collecting messages is free. A single one-off fee of $3.99 per card is charged only when you choose to send the card, and no processing fee is added to that amount. Because the card is delivered straight away, all sales are final once you send, and the sending fee is non-refundable and non-transferable between cards.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">18. Peer-to-Peer Payment Links (Tip & Gift Jar)</h2>
            <p className="mt-2">
              The Service allows Hosts to display links to third-party peer-to-peer payment services (Venmo, CashApp, Zelle, PayPal, Apple Pay, Google Pay). These links direct Guests to the Host's account on those third-party platforms. Funds flow directly from Guest to Host. The Kenroe Collective does not initiate, process, hold, or have access to these transactions. Your use of those third-party payment platforms is governed by their respective terms of service and privacy policies.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">19. SMS Communications Consent</h2>
            <p className="mt-2">
              By providing a phone number for yourself or your Guests in connection with event reminders, you consent to receive (or you confirm that the Guest has consented to receive) SMS messages from The Kenroe Collective related to the event. Standard message and data rates may apply.
            </p>
            <p className="mt-2">
              Message frequency: Event reminders typically number 1-3 SMS messages per event (reminder, day-of, thank-you). Frequency varies based on Host settings. Standard message and data rates apply.
            </p>
            <p className="mt-2">
              Messages may be sent before an event, day-of reminders, and post-event thank-yous — typically up to 3 messages per event. Message frequency varies by event and host preferences. Carriers may impose charges per message and standard rates apply. You retain the right to opt out at any time by replying STOP.
            </p>
            <p className="mt-2">
              You or your Guests may opt out at any time by replying STOP to any message. Opting out of SMS will not affect access to the Service.
            </p>
          </section>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
