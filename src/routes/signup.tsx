import { toUserMessage } from "@/lib/user-error";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  validateSearch: (s: Record<string, unknown>) => ({
    plan: typeof s.plan === "string" ? s.plan : "host",
    from: typeof s.from === "string" ? s.from : undefined,
    // Collaborator invitation handshake: the email is locked to the invited
    // address and the invite is accepted as soon as a session exists.
    invite: typeof s.invite === "string" ? s.invite : undefined,
    email: typeof s.email === "string" ? s.email : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Create your account — The Kenroe Collective" },
      { name: "description", content: "Sign up for The Kenroe Collective to plan unforgettable gatherings, send beautiful invitations, and track RSVPs in minutes." },
      { property: "og:title", content: "Create your account — The Kenroe Collective" },
      { property: "og:description", content: "Sign up to plan unforgettable gatherings in minutes." },
      { property: "og:url", content: "https://thekenroecollective.com/signup" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/signup" }],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { plan, from, invite, email: invitedEmail } = Route.useSearch();
  const navigate = useNavigate();
  const [step, setStep] = useState<"form" | "verify">("form");
  const [loading, setLoading] = useState(false);
  const lockedEmail = invite ? (invitedEmail ?? "") : "";
  const [form, setForm] = useState({ name: "", email: lockedEmail, password: "" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      // An invited collaborator comes back to the invite link after confirming
      // their email, so the invite is accepted without a separate manual step.
      const next = invite ? `/cohost/${invite}` : "/auth";
      try { sessionStorage.setItem("postAuthNext", invite ? `/cohost/${invite}` : "/events/new"); } catch { /* ignore */ }
      const { data, error } = await supabase.auth.signUp({
        email: (lockedEmail || form.email).trim(),
        password: form.password,
        options: {
          data: { display_name: form.name.trim(), plan },
          emailRedirectTo: `${window.location.origin}${next}`,
        },
      });
      if (error) throw error;
      // With email confirmation ON, signUp returns a user but no session.
      if (data.session) {
        toast.success("Welcome to the collective ✨");
        if (invite) {
          navigate({ to: "/cohost/$token", params: { token: invite } });
        } else {
          navigate({ to: "/events/new" });
        }
        return;
      }
      setStep("verify");
    } catch (err) {
      toast.error(toUserMessage(err, "Could not create account"));
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    try { sessionStorage.setItem("postAuthNext", "/events/new"); } catch { /* ignore */ }
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error("Google sign-in failed");
  }

  async function apple() {
    try { sessionStorage.setItem("postAuthNext", "/events/new"); } catch { /* ignore */ }
    const r = await lovable.auth.signInWithOAuth("apple", { redirect_uri: window.location.origin });
    if (r.error) toast.error("Apple sign-in failed");
  }

  if (step === "verify") {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="mx-auto max-w-lg px-6 py-24 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-velvet/10 text-3xl">
            ✉️
          </div>
          <h1 className="mt-6 font-serif text-3xl">Check your inbox</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-ink">{form.email}</span>.
            Click the link to verify your email and finish creating your account.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Don't see it? Check your spam folder. The email is from <span className="font-medium">noreply@thekenroecollective.com</span>.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              to="/auth"
              search={{ redirect: undefined }}
              className="rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              Go to sign in
            </Link>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="mx-auto grid max-w-5xl gap-12 px-6 py-16 sm:grid-cols-2">
        <div>
          <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">
            {invite ? "You've been invited" : from ? "Loved your invite?" : "Join the collective"}
          </span>
          <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">
            Make your next gathering unforgettable.
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Send invites that feel like an experience. Track RSVPs. Collect contributions.
            Drop a gift registry from anywhere. We handle the choreography.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-ink/80">
            {[
              "Stunning invitations in minutes",
              "RSVP tracking with party size & dietary",
              "Registries from Amazon, Target, Walmart, anywhere",
              "Collect money via Stripe, Venmo, CashApp, Zelle, PayPal",
              "Reminders that don't feel like spam",
            ].map((b) => (
              <li key={b} className="flex items-start gap-2">
                <span className="text-velvet">✓</span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-3xl bg-card p-8 ring-1 ring-ink/5 shadow-sm"
        >
          <h2 className="font-serif text-2xl">Create your account</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Plan selected: <span className="font-medium capitalize text-ink">{plan}</span> ·{" "}
            <Link to="/pricing" className="text-velvet underline underline-offset-4">
              change
            </Link>
          </p>

          <div className="mt-6 space-y-4">
            <Field label="Your name">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-ink/10 bg-secondary px-3 py-2.5 text-sm focus:border-velvet focus:outline-none"
                placeholder="Sophia Laurent"
              />
            </Field>
            <Field label="Email">
              <input
                required
                type="email"
                readOnly={!!lockedEmail}
                value={lockedEmail || form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={`w-full rounded-lg border border-ink/10 px-3 py-2.5 text-sm focus:border-velvet focus:outline-none ${lockedEmail ? "cursor-not-allowed bg-ink/5 text-ink/70" : "bg-secondary"}`}
                placeholder="you@email.com"
              />
              {lockedEmail ? (
                <span className="text-[11px] text-muted-foreground">
                  Locked to the address your invitation was sent to.
                </span>
              ) : null}
            </Field>
            <Field label="Password">
              <input
                required
                type="password"
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-lg border border-ink/10 bg-secondary px-3 py-2.5 text-sm focus:border-velvet focus:outline-none"
                placeholder="At least 6 characters"
              />
            </Field>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-velvet py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Creating account…" : "Create my account →"}
            </button>

            <p className="text-center text-[11px] text-muted-foreground">
              We'll email you a link to verify your address before you can sign in.
            </p>

            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="h-px flex-1 bg-ink/10" />
              or continue with
              <span className="h-px flex-1 bg-ink/10" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={google}
                className="rounded-full bg-secondary py-2.5 text-xs font-medium text-ink ring-1 ring-ink/10 hover:bg-secondary/70"
              >
                Google
              </button>
              <button
                type="button"
                onClick={apple}
                className="rounded-full bg-secondary py-2.5 text-xs font-medium text-ink ring-1 ring-ink/10 hover:bg-secondary/70"
              >
                Apple
              </button>
            </div>

            <p className="text-center text-[11px] text-muted-foreground">
              Already have an account?{" "}
              <Link to="/auth" search={{ redirect: undefined }} className="text-velvet underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </section>
      <SiteFooter />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
