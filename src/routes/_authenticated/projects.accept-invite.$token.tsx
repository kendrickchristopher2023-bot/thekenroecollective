import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { acceptPmInvite } from "@/lib/pm-invites.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/projects/accept-invite/$token")({
  head: () => ({ meta: [{ title: "Accept invitation — The Kenroe Collective" }] }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = useParams({ from: "/_authenticated/projects/accept-invite/$token" });
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "ok" | "err">("working");
  const [message, setMessage] = useState<string>("Checking your invitation…");
  const [isMismatch, setIsMismatch] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await acceptPmInvite({ data: { token } });
        if (!active) return;
        setStatus("ok");
        setMessage("You're in. Taking you to the project…");
        setTimeout(() => {
          navigate({ to: "/projects/$projectId", params: { projectId: (res as any).project_id } });
        }, 900);
      } catch (e: any) {
        if (!active) return;
        setStatus("err");
        const msg = e?.message ?? "Could not accept this invitation.";
        setMessage(msg);
        setIsMismatch(/invitation is for/i.test(msg));
      }
    })();
    return () => {
      active = false;
    };
  }, [token, navigate]);

  async function signOutAndRetry() {
    try {
      // Stash the current URL so the auth page bounces back after sign-in.
      sessionStorage.setItem("postAuthNext", `/projects/accept-invite/${token}`);
    } catch { /* ignore */ }
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: `/projects/accept-invite/${token}` }, replace: true });
  }

  return (
    <div className="venture-projects min-h-screen bg-paper">
      <SiteNav />
      <section className="py-24">
        <div className="mx-auto max-w-md px-6 text-center">
          <p className="text-[10px] uppercase tracking-[0.25em] text-velvet">Invitation</p>
          <h1 className="mt-3 font-serif text-3xl">
            {status === "ok" ? "Welcome aboard" : status === "err" ? "We hit a snag" : "One moment"}
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">{message}</p>
          {status === "err" && (
            <div className="mt-6 flex flex-col items-center gap-3">
              {isMismatch && (
                <button
                  onClick={signOutAndRetry}
                  className="rounded-full bg-velvet px-5 py-2 text-sm font-medium text-white"
                >
                  Sign out and use the invited email
                </button>
              )}
              <button
                onClick={() => navigate({ to: "/projects" })}
                className={
                  isMismatch
                    ? "text-xs text-muted-foreground hover:text-ink hover:underline"
                    : "rounded-full bg-velvet px-5 py-2 text-sm font-medium text-white"
                }
              >
                Go to Projects
              </button>
            </div>
          )}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
