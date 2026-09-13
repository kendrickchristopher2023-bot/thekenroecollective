import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SiteNav } from "@/components/site-nav";

export const Route = createFileRoute("/accessibility")({
  head: () => ({
    meta: [
      { title: "Accessibility Statement — The Kenroe Collective" },
      { name: "description", content: "Accessibility statement and commitment to WCAG 2.1 Level AA compliance for The Kenroe Collective." },
      { property: "og:title", content: "Accessibility Statement — The Kenroe Collective" },
      { property: "og:description", content: "Accessibility statement and commitment to WCAG 2.1 Level AA compliance." },
      { property: "og:url", content: "https://thekenroecollective.com/accessibility" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/accessibility" }],
  }),
  component: AccessibilityPage,
});

function AccessibilityPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="mx-auto max-w-3xl px-6 py-20">
        <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">Legal</span>
        <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">Accessibility Statement</h1>
        <p className="mt-2 text-sm text-muted-foreground">Our Commitment to Digital Accessibility</p>

        <div className="mt-12 space-y-10 text-sm leading-relaxed text-ink/80">
          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Conformance</h2>
            <p className="mt-2">
              The Kenroe Collective is committed to ensuring digital accessibility for people with disabilities. We aim for compliance with WCAG 2.1 level AA standards.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Accessibility Features</h2>
            <p className="mt-2">
              The site includes keyboard navigation, screen reader support, proper heading hierarchy, alt text for images, sufficient color contrast, and form labels. Atelier AI features include text alternatives for design inputs.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Known Limitations</h2>
            <p className="mt-2">
              Some third-party embeds (Stripe checkout, Supabase auth) may have limited accessibility. Photo Wall uploads are moderated by hosts, not The Kenroe Collective.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Feedback</h2>
            <p className="mt-2">
              If you encounter accessibility barriers, please contact us at{" "}
              <a href="mailto:support@thekenroecollective.com" className="text-velvet underline underline-offset-4">
                support@thekenroecollective.com
              </a>{" "}
              so we can assist and improve.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-medium text-ink">Standards</h2>
            <p className="mt-2">
              Read our full{" "}
              <a href="https://www.w3.org/WAI/WCAG21/quickref/" className="text-velvet underline underline-offset-4" target="_blank" rel="noopener noreferrer">
                WCAG 2.1 Level AA accessibility standards policy
              </a>
              .
            </p>
          </section>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
