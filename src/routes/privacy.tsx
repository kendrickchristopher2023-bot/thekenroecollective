import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { useContactEmail } from "@/hooks/use-contact-email";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — The Kenroe Collective" },
      { name: "description", content: "How The Kenroe Collective collects, uses, stores, and protects your personal data and your guests' information." },
      { property: "og:title", content: "Privacy Policy — The Kenroe Collective" },
      { property: "og:description", content: "How The Kenroe Collective protects your data and your guests' information." },
      { property: "og:url", content: "https://thekenroecollective.com/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const email = useContactEmail();
  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="mx-auto max-w-3xl px-6 py-20">
        <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">Legal</span>
        <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: July 11, 2026</p>

        <div className="mt-12 space-y-10 text-sm leading-relaxed text-ink/80">
          <section>
            <h2 className="font-serif text-xl font-medium text-ink">1. Introduction and Scope</h2>
            <p className="mt-2">
              The Kenroe Collective LLC ("we," "us," or "our") operates the website, applications, and related
              services referred to collectively as the "Service." This Privacy Policy applies to anyone who uses the
              Service, including registered account holders ("Hosts"), individuals whose information is added to events
              by Hosts ("Guests"), and visitors who browse the site without an account.
            </p>
            <p className="mt-2">
              Guests do not create accounts with us. A Host provides Guest names, email addresses, and other details
              solely so that the Service can deliver invitations, collect RSVPs, and send event-related communications.
              If you are a Guest and have questions about your data, please contact the Host who invited you or see
              Section 7 for information on how to request deletion.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">2. Information We Collect</h2>
            <p className="mt-2 font-medium text-ink">2.1 Account and identity data</p>
            <p className="mt-1">
              When you create a Host account, we collect your name, email address, password hash or OAuth tokens (for
              Google sign-in), and any profile information you choose to provide.
            </p>
            <p className="mt-3 font-medium text-ink">2.2 Event, guest, and project data</p>
            <p className="mt-1">
              Hosts provide event details, project details, guest lists, and related information. This may include Guest
              names, email addresses, phone numbers, mailing addresses, dietary preferences, plus-ones, RSVP responses,
              and messages sent through the Service. Guests do not sign up with us; their information is supplied by the
              Host.
            </p>
            <p className="mt-3 font-medium text-ink">2.3 Payment and billing data</p>
            <p className="mt-1">
              We do not store full payment card numbers. Stripe, our payment processor, collects and stores payment card
              details according to PCI-DSS requirements. We retain billing address, subscription status, transaction
              history, and the last four digits of the card for accounting, support, and fraud prevention.
            </p>
            <p className="mt-3 font-medium text-ink">2.4 Contribution and registry data</p>
            <p className="mt-1">
              If you contribute to a gift fund or use a registry link, we process transaction metadata (amount,
              timestamp, and payer reference) through Stripe. We do not access external registry accounts.
            </p>
            <p className="mt-3 font-medium text-ink">2.5 AI prompts and generated content</p>
            <p className="mt-1">
              When you use our AI-generated design or art features, we collect the prompts you submit and the resulting
              images or designs. We use AI as a service provider only and do not train our own models on your content.
            </p>
            <p className="mt-3 font-medium text-ink">2.6 Photo Wall and user-generated content</p>
            <p className="mt-1">
              Hosts and Guests may upload photos, messages, or other content to the Photo Wall for an event. This
              content is stored and displayed within the event access window and is visible to other event participants
              as configured by the Host.
            </p>
            <p className="mt-3 font-medium text-ink">2.7 Communications and support data</p>
            <p className="mt-1">
              We collect emails, messages, and call notes when you contact us for support or use the Service's
              communication features.
            </p>
            <p className="mt-3 font-medium text-ink">2.8 Device and usage data</p>
            <p className="mt-1">
              We automatically collect log data, IP addresses, browser type, device type, operating system, and usage
              analytics. We also use cookies and similar technologies to maintain sessions and remember preferences.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">3. How We Use Your Information</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>To provide, operate, and maintain the Service</li>
              <li>To process payments and manage subscriptions</li>
              <li>To facilitate events, invitations, RSVPs, reminders, and other event-related communications</li>
              <li>To generate AI content based on your prompts</li>
              <li>To use addresses a Host provides to make printable cards, labels, and envelopes for that Host</li>
              <li>To respond to support requests and troubleshoot issues</li>
              <li>To analyze usage trends and improve our features</li>
              <li>To send service-related notices, updates, and security alerts</li>
              <li>To send marketing communications to Hosts who have opted in, which you can opt out of at any time</li>
              <li>To detect and prevent fraud, abuse, and security threats</li>
              <li>To comply with legal obligations and enforce our terms</li>
            </ul>
            <p className="mt-2 font-medium text-ink">
              Guest data is used solely for event operations. We do not use Guest contact information for our own
              marketing. We do not sell Guest information. We do not share Guest information with advertisers or data
              brokers.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">4. How We Share Your Information</h2>
            <p className="mt-2">
              We do not sell your personal information. We do not share personal information for cross-context
              behavioral advertising. We share personal information only in the following circumstances:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>Service providers:</strong> We share data with trusted vendors who help us operate the Service,
                including Supabase (hosting, authentication, and database services), Stripe (payment processing),
                email delivery services, and SMS providers. A current list of subprocessors is available upon request.
              </li>
              <li>
                <strong>Event participants:</strong> Hosts can see Guest RSVPs and responses. Guests can see event
                details and information the Host chooses to share in an invitation.
              </li>
              <li>
                <strong>Vendors in request-for-quote (RFQ) flows:</strong> When a Host solicits quotes from vendors, we
                share the event or project details needed for the quote. We do not share Guest-level personal
                information with vendors unless the Host explicitly chooses to do so.
              </li>
              <li>
                <strong>Legal requirements:</strong> We may disclose information if required by law, court order, or
                government request, or to protect our rights, safety, or property.
              </li>
              <li>
                <strong>Business transfers:</strong> If we are involved in a merger, acquisition, or sale of assets, your
                information may be transferred as part of that transaction.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">5. Peer-to-Peer Payment Links (Tip and Gift Jar)</h2>
            <p className="mt-2">
              The Service may display deep links to third-party payment platforms such as Venmo, Cash App, Zelle, PayPal,
              Apple Pay, and Google Pay. These links allow funds to flow directly between a Guest and a Host. The Kenroe
              Collective does not process, hold, or access these funds. Your use of any third-party payment platform is
              governed by that platform's terms and privacy policy.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">6. Data Retention and Deletion</h2>
            <p className="mt-2">
              We retain your personal information for as long as needed to provide the Service and for legitimate business
              purposes. Specific retention periods are:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <strong>Account data:</strong> Retained while your account is active. After deletion, we remove your
                personal data within a reasonable period, except where we are legally required to retain it.
              </li>
              <li>
                <strong>Event and Guest data:</strong> Retained during the event access window, typically 90 days after
                the event. After the event access window closes, Guest personally identifiable information is
                anonymized or deleted within 30 days.
              </li>
              <li>
                <strong>Photo Wall content:</strong> Deleted after the event access window closes.
              </li>
              <li>
                <strong>Payment records:</strong> Retained as long as required by applicable tax, accounting, and
                anti-fraud laws.
              </li>
              <li>
                <strong>Backups:</strong> Backup copies may persist for up to 30 additional days before being deleted.
              </li>
            </ul>
            <p className="mt-2">
              Event data that has been shared with Guests (such as email invitations) may remain in their email inboxes or
              devices outside our control.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">7. Your Privacy Rights</h2>
            <p className="mt-2">
              All users have the right to access, correct, and delete their personal information, and to opt out of
              marketing. To exercise any of these rights, contact us at{" "}
              <a href={`mailto:${email}?subject=Privacy%20Request`} className="text-velvet underline underline-offset-4">
                {email}
              </a>{" "}
              with "Privacy Request" in the subject line.
            </p>
            <p className="mt-2">
              <strong>California residents (CCPA/CPRA):</strong> You have the right to know what personal information we
              collect, to delete or correct personal information, to opt out of the sale or sharing of personal
              information (we do not sell or share for cross-context behavioral advertising), to limit the use or
              disclosure of sensitive personal information, and to receive non-discriminatory treatment for exercising
              these rights.
            </p>
            <p className="mt-2">
              <strong>Other U.S. state residents:</strong> Residents of Virginia, Colorado, Connecticut, Utah, and
              other states with comprehensive privacy laws may have similar rights, including the right to opt out of
              certain processing, to request deletion, and to appeal a denial. We will honor these rights to the extent
              applicable.
            </p>
            <p className="mt-2">
              We will respond to verified requests within 45 days, or notify you if additional time is needed. Guests who
              do not have an account may visit{" "}
              <a href="/guest-privacy" className="text-velvet underline underline-offset-4">
                /guest-privacy
              </a>{" "}
              to look up an event and request deletion of their personal information.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">8. Cookies and Tracking</h2>
            <p className="mt-2">
              We use only essential cookies and similar technologies. These include Supabase authentication tokens and
              session cookies needed to keep you signed in, and Stripe cookies required to process checkout and prevent
              fraud. We do not use advertising, retargeting, or analytics cookies, and we do not show third-party ads on the
              Service. You can manage cookie settings through your browser, but disabling essential cookies may limit your
              ability to use the Service.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">9. SMS and Email Communications</h2>
            <p className="mt-2">
              Hosts may choose to send SMS reminders to Guests. Message frequency varies by event and Host settings,
              typically 1-3 messages per event (reminder, day-of, and thank-you). Message and data rates may apply.
              The first SMS message includes opt-out instructions (reply STOP). If you reply STOP, we will honor the
              opt-out immediately and you will receive no further SMS messages from that event. Reply HELP for
              support.
            </p>
            <p className="mt-2">
              No mobile information, including phone numbers and opt-in consent, will be shared or sold to third
              parties or affiliates for their marketing or promotional purposes. Phone numbers are used solely to
              deliver the event reminders described above and are shared only with our SMS delivery provider (Twilio)
              as needed to send those messages.
            </p>
            <p className="mt-2">
              Transactional emails (such as payment confirmations, security alerts, and event updates) are not
              marketing. We send marketing emails only to Hosts who have opted in, and every marketing email contains an
              unsubscribe link. We never send marketing emails to Guests. We comply with the CAN-SPAM Act.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">10. User-Generated Content and Photo Wall</h2>
            <p className="mt-2">
              Users retain ownership of photos, messages, and other content they upload. By uploading content, you grant
              us a limited license to host, display, and transmit that content within the event or project as you
              configure. This license ends when the content is deleted or the event access window closes.
            </p>
            <p className="mt-2">
              We respond to copyright complaints under the Digital Millennium Copyright Act. If you believe content on
              the Service infringes your copyright, contact us at{" "}
              <a href={`mailto:${email}?subject=Privacy%20Request`} className="text-velvet underline underline-offset-4">
                {email}
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">11. Security</h2>
            <p className="mt-2">
              We implement industry-standard security measures, including encryption in transit (TLS), Supabase
              row-level security, scoped access controls, signed authentication tokens, and regular security reviews.
              Stripe handles payment card data in compliance with PCI-DSS. No system is 100% secure, and you are
              responsible for keeping your password and authentication credentials confidential.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">12. Children's Privacy</h2>
            <p className="mt-2">
              The Service is not intended for children under 13. We do not knowingly collect personal information from
              children under 13 in compliance with the Children's Online Privacy Protection Act (COPPA). If you believe
              we have collected such information, please contact us and we will delete it promptly. Hosts must not upload
              children's personal information without appropriate parental consent.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">13. Third-Party Links</h2>
            <p className="mt-2">
              The Service may contain links to external sites (for example, gift registries, vendor websites, or payment
              platforms). We are not responsible for the privacy practices or content of those sites. We encourage you
              to read their privacy policies.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">14. International Users</h2>
            <p className="mt-2">
              The Service is operated in the United States. If you access the Service from outside the United States,
              your personal information may be transferred to, stored in, and processed in the United States. When
              required, we rely on appropriate safeguards, such as Standard Contractual Clauses, for international data
              transfers.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">15. Changes to This Policy</h2>
            <p className="mt-2">
              We may update this Privacy Policy periodically. We will post the revised version with a new "Last updated"
              date. For material changes, we will notify you by email or through the Service.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">16. Contact Us</h2>
            <p className="mt-2">
              If you have questions or concerns about this Privacy Policy or our data practices, please contact us at{" "}
              <a href={`mailto:${email}?subject=Privacy%20Request`} className="text-velvet underline underline-offset-4">
                {email}
              </a>{" "}
              with "Privacy Request" in the subject line, or through our{" "}
              <Link to="/contact" className="text-velvet underline underline-offset-4">
                contact form
              </Link>
              .
            </p>
          </section>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
