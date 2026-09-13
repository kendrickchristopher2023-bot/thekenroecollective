import { toUserMessage } from "@/lib/user-error";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { checkAuthAttempt } from "@/lib/auth-rate-limit.functions";
import { resolveAuthRedirect } from "@/lib/auth-redirect";

import { toast } from "sonner";

type Mode = "signin" | "signup" | "forgot";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),

  head: () => ({
    meta: [
      { title: "Sign in — The Kenroe Collective" },
      { name: "description", content: "Sign in to The Kenroe Collective to manage your gatherings, guest lists, and invitations." },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const navigatedRef = useRef(false);

  // Persist an explicit `?redirect=` intent so it survives the email-confirmation
  // round trip (the confirmation link comes back to bare `/auth`, dropping the
  // search param). Without this a Projects-only signup lands on the events
  // homepage instead of `/projects`.
  useEffect(() => {
    if (typeof redirect === "string" && redirect.startsWith("/") && !redirect.startsWith("//")) {
      try { sessionStorage.setItem("postAuthNext", redirect); } catch { /* ignore */ }
    }
  }, [redirect]);

  // If the user is already signed in — or just landed here from an email link
  // (signup confirmation, magic link, email change) or an OAuth redirect —
  // establish the session via the shared helper and bounce to the destination.
  useEffect(() => {
    let cancelled = false;
    const go = () => {
      if (cancelled || navigatedRef.current) return;
      navigatedRef.current = true;
      let next: string | null = null;
      try { next = sessionStorage.getItem("postAuthNext"); } catch { /* ignore */ }
      try { sessionStorage.removeItem("postAuthNext"); } catch { /* ignore */ }
      const target =
        (next && next.startsWith("/") && !next.startsWith("//") ? next : null) ??
        (typeof redirect === "string" && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/gatherings");
      try { sessionStorage.setItem("justSignedIn", "1"); } catch { /* ignore */ }
      void router.navigate({ to: target, replace: true });
    };
    void resolveAuthRedirect().then((res) => {
      if (cancelled) return;
      if (res.session) go();
      else if (res.error) toast.error(res.error);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) go();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  function landingFor(): string {
    // Safe internal-only redirect; default to the events product homepage.
    if (typeof redirect === "string" && redirect.startsWith("/") && !redirect.startsWith("//")) {
      return redirect;
    }
    // Fall back to a stored intent (survives the email-confirmation round trip).
    let stored: string | null = null;
    try { stored = sessionStorage.getItem("postAuthNext"); } catch { /* ignore */ }
    if (stored && stored.startsWith("/") && !stored.startsWith("//")) {
      try { sessionStorage.removeItem("postAuthNext"); } catch { /* ignore */ }
      return stored;
    }
    return "/gatherings";
  }

  function goHome(target: string) {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    // Flag for the home screen to fire a celebratory confetti burst.
    try { sessionStorage.setItem("justSignedIn", "1"); } catch { /* ignore */ }
    void router.navigate({ to: target, replace: true });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode !== "forgot" && email) {
        const rl = await checkAuthAttempt({ data: { email } }).catch(() => ({ allowed: true }));
        if (!rl.allowed) {
          toast.error("Too many attempts. Please wait a few minutes and try again.");
          setLoading(false);
          return;
        }
      }
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Check your email for a reset link.");
        setMode("signin");
        setLoading(false);
      } else if (mode === "signup") {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name }, emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
        if (signUpData.user && (phone.trim() || smsOptIn)) {
          await supabase
            .from("profiles")
            .update({ phone: phone.trim() || null, sms_opt_in: smsOptIn })
            .eq("id", signUpData.user.id);
        }
        if (signUpData.session) {
          toast.success("Welcome to the collective ✨");
          goHome(landingFor());
        } else {
          toast.success(`We sent a confirmation link to ${email}. Click it to finish creating your account.`, { duration: 8000 });
          setMode("signin");
          setPassword("");
          setLoading(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back ✨");
        goHome(landingFor());
      }
    } catch (e) {
      toast.error(toUserMessage(e, "Auth failed"));
      setLoading(false);
    }
  }

  function stashNext() {
    try { sessionStorage.setItem("postAuthNext", landingFor()); } catch { /* ignore */ }
    try { sessionStorage.setItem("justSignedIn", "1"); } catch { /* ignore */ }
  }

  async function google() {
    stashNext();
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error("Google sign-in failed");
  }

  async function apple() {
    stashNext();
    const r = await lovable.auth.signInWithOAuth("apple", { redirect_uri: window.location.origin });
    if (r.error) toast.error("Apple sign-in failed");
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-serif text-3xl">
          {mode === "signin" ? "Welcome back" : mode === "signup" ? "Join the collective" : "Reset your password"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Sign in to keep planning."
            : mode === "signup"
              ? "Create your account."
              : "Enter your email and we'll send you a reset link."}
        </p>

        {mode !== "forgot" && (
          <>
            <div className="mt-6 space-y-2">
              <button
                onClick={google}
                className="w-full rounded-full border border-ink/15 bg-paper py-2.5 text-sm font-medium hover:bg-secondary"
              >
                Continue with Google
              </button>
              <button
                onClick={apple}
                className="w-full rounded-full border border-ink/15 bg-ink py-2.5 text-sm font-medium text-paper hover:opacity-90"
              >
                Continue with Apple
              </button>
            </div>

            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-ink/10" /> or <div className="h-px flex-1 bg-ink/10" />
            </div>
          </>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === "signup" && (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl border border-ink/15 bg-paper px-4 py-2.5 text-sm"
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number (optional, for event alerts)"
                className="w-full rounded-xl border border-ink/15 bg-paper px-4 py-2.5 text-sm"
              />
              <label className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={smsOptIn}
                  onChange={(e) => setSmsOptIn(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Send me SMS alerts about events I'm attending (venue changes, cancellations, date changes).</span>
              </label>
            </>
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-ink/15 bg-paper px-4 py-2.5 text-sm"
          />
          {mode !== "forgot" && (
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-xl border border-ink/15 bg-paper px-4 py-2.5 text-sm"
            />
          )}
          <button
            disabled={loading}
            className="w-full rounded-full bg-velvet py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading
              ? "..."
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send reset link"}
          </button>
        </form>

        <div className="mt-4 flex flex-col items-center gap-2 text-xs text-muted-foreground">
          {mode === "signin" && (
            <button onClick={() => setMode("forgot")} className="hover:text-ink hover:underline">
              Forgot your password?
            </button>
          )}
          {mode !== "forgot" && (
            <button
              type="button"
              onClick={async () => {
                if (!email) { toast.error("Enter your email first"); return; }
                const { error } = await supabase.auth.resend({
                  type: "signup",
                  email,
                  options: { emailRedirectTo: `${window.location.origin}/auth` },
                });
                if (error) toast.error(error.message);
                else toast.success(`Verification email re-sent to ${email}.`);
              }}
              className="hover:text-ink hover:underline"
            >
              Resend verification email
            </button>
          )}
          <button
            onClick={() => setMode(mode === "signup" ? "signin" : mode === "forgot" ? "signin" : "signup")}
            className="hover:text-ink"
          >
            {mode === "signin"
              ? "Need an account? Sign up"
              : mode === "signup"
                ? "Have an account? Sign in"
                : "← Back to sign in"}
          </button>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link to="/gatherings" className="hover:underline">← Back home</Link>
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
