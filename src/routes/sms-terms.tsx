import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteNav } from "@/components/site-nav";

export const Route = createFileRoute("/sms-terms")({
  head: () => ({
    meta: [
      { title: "SMS Terms & Opt-In Policy — The Kenroe Collective" },
      {
        name: "description",
        content:
          "How The Kenroe Collective collects SMS consent, what event messages we send, message frequency, and how to opt out with STOP or get help with HELP.",
      },
      { property: "og:title", content: "SMS Terms & Opt-In Policy — The Kenroe Collective" },
      {
        property: "og:description",
        content: "SMS consent, message types, frequency, opt-out (STOP) and help (HELP) instructions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://thekenroecollective.com/sms-terms" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/sms-terms" }],
  }),
  component: SmsTermsPage,
});

function SmsTermsPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="mx-auto max-w-3xl px-6 py-20">
        <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">Legal</span>
        <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">SMS Terms &amp; Opt-In Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: July 31, 2026</p>

        <div className="mt-12 space-y-10 text-sm leading-relaxed text-ink/80">
          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Program Description</h2>
            <p className="mt-2">
              The Kenroe Collective sends event-related text messages on behalf of hosts who use our platform to plan
              private events. Messages are limited to RSVP reminders, event details and logistics, and host-initiated
              updates for a specific event a recipient has been invited to. We never send marketing or promotional
              text messages through this program.
            </p>
          </section>

          <section className="rounded-lg border border-ink/10 bg-secondary/40 p-5">
            <h2 className="font-serif text-xl font-medium text-ink">How Consent Is Collected</h2>
            <p className="mt-2">
              Consent is obtained by the event host directly from each guest, verbally or in writing, before the guest
              is added to an event. Before adding or importing guests, the host must check an unchecked confirmation
              box in the platform stating:
            </p>
            <blockquote className="mt-3 border-l-2 border-velvet/40 pl-4 italic text-ink">
              “I confirm that each guest has given me permission to receive event-related SMS and other event
              communications sent through The Kenroe Collective, and that I have the right to share their contact
              information for this purpose.”
            </blockquote>
            <p className="mt-3">
              The platform records this confirmation, including the host account and timestamp. Guests may also opt in
              directly by texting <strong>START</strong>, <strong>YES</strong>, or <strong>UNSTOP</strong> to the
              number they received a message from.
            </p>
            <p className="mt-3">
              The exact consent control and the full step-by-step flow are publicly viewable, without an account, on our{" "}
              <Link to="/sms-opt-in-evidence" className="text-velvet underline underline-offset-4">
                SMS opt-in consent flow page
              </Link>
              .
            </p>
          </section>


          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Message Frequency</h2>
            <p className="mt-2">
              Message frequency varies, typically 1–3 messages per event. Message and data rates may apply.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Opting Out</h2>
            <p className="mt-2">
              Reply <strong>STOP</strong> to any message to opt out at any time. You will receive one confirmation
              message and no further messages. Reply <strong>START</strong> to re-subscribe.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Getting Help</h2>
            <p className="mt-2">
              Reply <strong>HELP</strong> to any message for assistance, or email{" "}
              <a
                href="mailto:support@thekenroecollective.com"
                className="text-velvet underline underline-offset-4"
              >
                support@thekenroecollective.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Sample Messages</h2>
            <ul className="mt-2 space-y-3">
              <li className="rounded-md border border-ink/10 bg-secondary/30 p-3">
                The Kenroe Collective: Reminder for [Event Name], hosted by [Host Name]. RSVP:
                https://thekenroecollective.com/s/[event-link] Msg &amp; data rates may apply. Reply STOP to opt out or
                HELP for help.
              </li>
              <li className="rounded-md border border-ink/10 bg-secondary/30 p-3">
                The Kenroe Collective: Update for [Event Name]: [Event Details]. Reply STOP to opt out.
              </li>
              <li className="rounded-md border border-ink/10 bg-secondary/30 p-3">
                The Kenroe Collective: Thank you for celebrating [Event Name] with us. Reply STOP to opt out.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Privacy</h2>
            <p className="mt-2">
              Mobile information will not be shared with third parties or affiliates for marketing or promotional
              purposes. All other categories exclude text messaging originator opt-in data and consent; this
              information will not be shared with any third parties. See our{" "}
              <Link to="/privacy" className="text-velvet underline underline-offset-4">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link to="/terms" className="text-velvet underline underline-offset-4">
                Terms of Service
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
