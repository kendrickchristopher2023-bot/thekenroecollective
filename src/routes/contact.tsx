import { toUserMessage } from "@/lib/user-error";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { submitTicket } from "@/lib/support.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact support — The Kenroe Collective" },
      { name: "description", content: "Reach the The Kenroe Collective team for support, account questions, or event-planning help. We reply within one business day." },
      { property: "og:title", content: "Contact support — The Kenroe Collective" },
      { property: "og:description", content: "Reach the The Kenroe Collective team for help. We reply within one business day." },
      { property: "og:url", content: "https://thekenroecollective.com/contact" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
  const send = useServerFn(submitTicket);
  const [form, setForm] = useState({ contact_name: "", contact_email: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent | React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      await send({ data: form });
      setSent(true);
    } catch (err) {
      toast.error(toUserMessage(err, "Failed to send"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="font-serif text-4xl">Contact support</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We reply within one business day. For urgent issues, paid plans get priority.
        </p>
        {sent ? (
          <div className="mt-8 rounded-2xl bg-card p-6 ring-1 ring-ink/5">
            <div className="text-2xl">✨</div>
            <h2 className="mt-2 font-serif text-xl">Message received</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We've drafted a response and our team will personalize and send it shortly.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-3">
            <label htmlFor="contact-name" className="sr-only">Your name</label>
            <input
              id="contact-name"
              placeholder="Your name"
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              className="w-full rounded-xl border border-ink/15 px-4 py-2.5 text-sm"
            />
            <label htmlFor="contact-email" className="sr-only">Email address</label>
            <input
              id="contact-email"
              type="email"
              required
              placeholder="you@example.com"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              className="w-full rounded-xl border border-ink/15 px-4 py-2.5 text-sm"
            />
            <label htmlFor="contact-subject" className="sr-only">Subject</label>
            <input
              id="contact-subject"
              required
              placeholder="Subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full rounded-xl border border-ink/15 px-4 py-2.5 text-sm"
            />
            <label htmlFor="contact-message" className="sr-only">Message</label>
            <textarea
              id="contact-message"
              required
              rows={6}
              placeholder="How can we help?"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full rounded-xl border border-ink/15 px-4 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-velvet py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send message"}
            </button>
          </form>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
