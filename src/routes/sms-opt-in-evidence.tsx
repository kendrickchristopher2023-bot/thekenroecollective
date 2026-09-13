import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { GuestConsentCheckbox } from "@/components/guest-consent-checkbox";

export const Route = createFileRoute("/sms-opt-in-evidence")({
  head: () => ({
    meta: [
      { title: "SMS Opt-In Consent Flow (Verification Evidence) — The Kenroe Collective" },
      {
        name: "description",
        content:
          "Publicly viewable proof of The Kenroe Collective's SMS consent flow: the exact host confirmation checkbox, disclosures, message frequency, and STOP/HELP handling used before any guest is texted.",
      },
      { property: "og:title", content: "SMS Opt-In Consent Flow — The Kenroe Collective" },
      {
        property: "og:description",
        content: "The exact in-product SMS consent experience, shown publicly for compliance verification.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://thekenroecollective.com/sms-opt-in-evidence" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/sms-opt-in-evidence" }],
  }),
  component: SmsOptInEvidencePage,
});

function SmsOptInEvidencePage() {
  const [consent, setConsent] = useState(false);

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="mx-auto max-w-3xl px-6 py-20">
        <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">Compliance</span>
        <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">
          SMS Opt-In Consent Flow
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Public verification page · Brand: The Kenroe Collective · Last updated: August 5, 2026
        </p>

        <div className="mt-12 space-y-10 text-sm leading-relaxed text-ink/80">
          <section>
            <p>
              This page exists so that anyone — including carrier and messaging compliance reviewers — can see the
              complete SMS consent experience used by The Kenroe Collective without needing an account. The consent
              control shown below is the live component used inside the product; it is unchecked by default and requires
              an affirmative action.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Opt-in path 1 — Host confirmation of guest consent</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>
                A host signs in at{" "}
                <a href="https://thekenroecollective.com" className="text-velvet underline underline-offset-4">
                  thekenroecollective.com
                </a>{" "}
                and creates a private event (wedding, dinner, party, or similar gathering).
              </li>
              <li>
                The host obtains permission directly from each guest — verbally or in writing — before entering that
                guest's mobile number. Guests are known invitees of the host, never purchased or third-party lists.
              </li>
              <li>
                On the “Add guests” and “Import guests” steps, the host cannot save any guest with a phone number until
                the host checks the confirmation box below. It is unchecked by default and cannot be pre-checked.
              </li>
              <li>
                The platform stores that confirmation with the host account identity and a timestamp as the consent
                record of record.
              </li>
              <li>
                The first SMS ever sent to a phone number automatically appends the opt-out disclosure: “Reply STOP to
                opt out. Msg &amp; data rates may apply. The Kenroe Collective.”
              </li>
            </ol>

            <div className="mt-5 rounded-xl border border-ink/10 bg-card p-5 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Exact in-product consent control (live component)
              </p>
              <div className="mt-3">
                <GuestConsentCheckbox
                  checked={consent}
                  onChange={setConsent}
                  id="evidence-host-guest-consent"
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Status:{" "}
                <strong className="text-ink">
                  {consent ? "confirmed — guests may now be saved" : "not confirmed — saving guests is blocked"}
                </strong>
                . Message frequency varies, typically 1–3 messages per event. Message and data rates may apply. Reply
                STOP to opt out, HELP for help. See{" "}
                <Link to="/terms" className="text-velvet underline underline-offset-4">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="text-velvet underline underline-offset-4">
                  Privacy Policy
                </Link>{" "}
                (mobile numbers and opt-in consent are never shared or sold to third parties or affiliates for
                marketing).
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Opt-in path 2 — Keyword opt-in by text message</h2>
            <p className="mt-2">
              A recipient can opt in, or re-subscribe after opting out, by texting <strong>START</strong>,{" "}
              <strong>YES</strong>, or <strong>UNSTOP</strong> to the number that messaged them. They receive this
              confirmation auto-reply:
            </p>
            <blockquote className="mt-3 rounded-md border border-ink/10 bg-secondary/30 p-3 not-italic">
              The Kenroe Collective: You are re-subscribed to event reminders. Msg &amp; data rates may apply. For help,
              reply HELP. To opt-out, reply STOP.
            </blockquote>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Opt-out and help handling</h2>
            <p className="mt-2">
              <strong>STOP</strong> (also CANCEL, QUIT, OPTOUT, UNSUBSCRIBE, STOPALL, REVOKE, END) opts the number out
              immediately and permanently across every event on the platform. Reply:
            </p>
            <blockquote className="mt-3 rounded-md border border-ink/10 bg-secondary/30 p-3 not-italic">
              You have successfully been unsubscribed. You will not receive any more messages from this number. Reply
              START to resubscribe.
            </blockquote>
            <p className="mt-3">
              <strong>HELP</strong> or <strong>INFO</strong> returns:
            </p>
            <blockquote className="mt-3 rounded-md border border-ink/10 bg-secondary/30 p-3 not-italic">
              Reply STOP to unsubscribe. Msg&amp;Data Rates May Apply.
            </blockquote>
            <p className="mt-3">
              Support is also available at{" "}
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
            <h2 className="font-serif text-xl font-medium text-ink">What we send</h2>
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
            <p className="mt-3">
              No marketing, promotional, or third-party content is ever sent through this program. Full policy:{" "}
              <Link to="/sms-terms" className="text-velvet underline underline-offset-4">
                SMS Terms &amp; Opt-In Policy
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
