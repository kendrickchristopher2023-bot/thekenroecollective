import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteNav } from "@/components/site-nav";

export const Route = createFileRoute("/dmca")({
  head: () => ({
    meta: [
      { title: "DMCA Policy — The Kenroe Collective" },
      { name: "description", content: "DMCA policy and designated agent contact information for The Kenroe Collective." },
      { property: "og:title", content: "DMCA Policy — The Kenroe Collective" },
      { property: "og:description", content: "DMCA policy and designated agent contact information." },
      { property: "og:url", content: "https://thekenroecollective.com/dmca" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/dmca" }],
  }),
  component: DMCAPage,
});

function DMCAPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="mx-auto max-w-3xl px-6 py-20">
        <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">Legal</span>
        <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">DMCA Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: July 13, 2026</p>

        <div className="mt-12 space-y-10 text-sm leading-relaxed text-ink/80">
          <section>
            <h2 className="font-serif text-xl font-medium text-ink">DMCA Safe Harbor</h2>
            <p className="mt-2">
              The Kenroe Collective respects the intellectual property rights of others and relies on the safe-harbor provisions of the Digital Millennium Copyright Act (DMCA) to host user-generated content. This page explains how to report claimed copyright infringement and how to submit a counter-notification if you believe material was removed by mistake.
            </p>
          </section>

          <section className="rounded-lg border border-ink/10 bg-secondary/40 p-5">
            <h2 className="font-serif text-xl font-medium text-ink">DMCA Designated Agent</h2>
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
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">How to Submit a Takedown Notice</h2>
            <p className="mt-2">
              A valid DMCA takedown notice must include the following elements under 17 U.S.C. § 512(c)(3):
            </p>
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              <li>Identification of the copyrighted work claimed to have been infringed.</li>
              <li>Identification of the allegedly infringing material and its location on our platform.</li>
              <li>Your contact information (name, address, phone, email).</li>
              <li>A statement of your good-faith belief that the use of the material is not authorized by the copyright owner, its agent, or the law.</li>
              <li>A statement, under penalty of perjury, that the information in the notification is accurate and that you are authorized to act on behalf of the copyright owner.</li>
              <li>Your physical or electronic signature.</li>
            </ol>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Counter-Notification</h2>
            <p className="mt-2">
              If you believe material was removed or disabled as a result of mistake or misidentification, you may submit a counter-notification under 17 U.S.C. § 512(g). A valid counter-notification must include your contact information, identification of the removed material and its prior location, a statement under penalty of perjury that you have a good-faith belief the material was removed by mistake or misidentification, and your consent to the jurisdiction of the federal court in your district (or, if outside the United States, any district in which we may be found).
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Related Policies</h2>
            <p className="mt-2">
              For more information about our terms of service and privacy practices, please see our{" "}
              <Link to="/terms" className="text-velvet underline underline-offset-4">Terms &amp; Conditions</Link>{" "}
              and{" "}
              <Link to="/privacy" className="text-velvet underline underline-offset-4">Privacy Policy</Link>.
            </p>
          </section>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
