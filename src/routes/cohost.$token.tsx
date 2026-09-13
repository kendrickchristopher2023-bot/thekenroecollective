// PUBLIC collaborator invitation landing page.
//
// It has to work for three different people:
//  1. Someone signed in with the invited email  → accept immediately.
//  2. Someone signed in with a DIFFERENT email  → snag page + "sign out and retry".
//  3. Someone with NO account at all            → straight into signup with the
//     invited email pre-filled and locked, and the invite auto-accepted the
//     moment their session exists (including after email confirmation, which
//     returns them to this same URL).
// That's why this route is public: gating it behind auth dead-ends case 3.
import { toUserMessage } from "@/lib/user-error";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { acceptEventMemberInvite } from "@/lib/event-cohosts.functions";
import { lookupCohostInvite, type CohostInvitePreview } from "@/lib/cohost-invite.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/cohost/$token")({
  head: () => ({
    meta: [
      { title: "Accept co-host invitation — The Kenroe Collective" },
      {
        name: "description",
        content: "Accept an invitation to help host an event on The Kenroe Collective.",
      },
      { property: "og:title", content: "Accept co-host invitation" },
      { property: "og:description", content: "Join an event as a co-host or viewer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AcceptCohostPage,
});

type Phase = "loading" | "signedOut" | "accepting" | "ok" | "err";

function AcceptCohostPage() {
  const { token } = useParams({ from: "/cohost/$token" });
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("Checking your invitation…");
  const [isMismatch, setIsMismatch] = useState(false);
  const [invite, setInvite] = useState<CohostInvitePreview | null>(null);

  const accept = useCallback(async () => {
    setPhase("accepting");
    setMessage("Adding you to the event…");
    try {
      const res = await acceptEventMemberInvite({ data: { token } });
      setPhase("ok");
      setMessage("You're in. Taking you to the event…");
      setTimeout(() => {
        navigate({ to: "/events/$eventId", params: { eventId: res.eventId } });
      }, 900);
    } catch (e) {
      const msg = toUserMessage(e, "Could not accept this invitation.");
      setPhase("err");
      setMessage(msg);
      setIsMismatch(/different email/i.test(msg));
    }
  }, [token, navigate]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [preview, { data: sess }] = await Promise.all([
        lookupCohostInvite({ data: { token } }).catch(() => ({ found: false }) as CohostInvitePreview),
        supabase.auth.getSession(),
      ]);
      if (!active) return;
      setInvite(preview);

      if (!preview.found || preview.status === "revoked") {
        setPhase("err");
        setMessage("This invitation link is no longer valid. Ask the host to send a new one.");
        return;
      }
      if (preview.expired) {
        setPhase("err");
        setMessage("This invitation has expired. Ask the host to resend it and you'll be right in.");
        return;
      }
      if (!sess.session) {
        setPhase("signedOut");
        return;
      }
      void accept();
    })();
    return () => {
      active = false;
    };
  }, [token, accept]);

  // Covers the post-confirmation return trip: Supabase parses the link, a
  // session appears, and the invite is accepted without a manual step.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void accept();
    });
    return () => data.subscription.unsubscribe();
  }, [accept]);

  async function signOutAndRetry() {
    try {
      sessionStorage.setItem("postAuthNext", `/cohost/${token}`);
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: `/cohost/${token}` }, replace: true });
  }

  const heading =
    phase === "ok"
      ? "Welcome aboard"
      : phase === "err"
        ? "We hit a snag"
        : phase === "signedOut"
          ? "You've been invited"
          : "One moment";

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="py-24">
        <div className="mx-auto max-w-md px-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.25em] text-velvet">Invitation</p>
          <h1 className="mt-3 font-serif text-3xl">{heading}</h1>

          {phase === "signedOut" && invite?.found ? (
            <>
              <p className="mt-4 text-sm text-muted-foreground">
                <span className="font-medium text-ink">{invite.invitedEmail}</span> was invited to
                help run <span className="font-medium text-ink">{invite.eventTitle}</span> as a{" "}
                {invite.role === "viewer" ? "viewer (read only)" : "co-host (can edit)"}.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Create your account with that email and you'll land straight on the event, no extra
                steps. This seat comes from the host's plan, so your own account stays untouched.
              </p>
              <div className="mt-6 flex flex-col items-center gap-3">
                <Link
                  to="/signup"
                  search={{ plan: "postcard", from: undefined, invite: token, email: invite.invitedEmail }}
                  className="min-h-[44px] rounded-full bg-velvet px-6 py-3 text-sm font-medium text-white hover:opacity-90"
                >
                  Create my account →
                </Link>
                <Link
                  to="/auth"
                  search={{ redirect: `/cohost/${token}` }}
                  className="text-xs text-muted-foreground hover:text-ink hover:underline"
                >
                  I already have an account
                </Link>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{message}</p>
          )}

          {phase === "err" && (
            <div className="mt-6 flex flex-col items-center gap-3">
              {isMismatch && (
                <button
                  onClick={signOutAndRetry}
                  className="min-h-[44px] rounded-full bg-velvet px-5 py-2 text-sm font-medium text-white"
                >
                  Sign out and use the invited email
                </button>
              )}
              <button
                onClick={() => navigate({ to: "/events" })}
                className={
                  isMismatch
                    ? "text-xs text-muted-foreground hover:text-ink hover:underline"
                    : "min-h-[44px] rounded-full bg-velvet px-5 py-2 text-sm font-medium text-white"
                }
              >
                Go to my events
              </button>
            </div>
          )}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
