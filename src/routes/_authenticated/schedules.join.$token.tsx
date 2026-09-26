import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { acceptCohostInvite, getCohostInvite } from "@/lib/schedules.functions";
import { toUserMessage } from "@/lib/user-error";

export const Route = createFileRoute("/_authenticated/schedules/join/$token")({
  head: () => ({
    meta: [
      { title: "Co-host invitation, The Kenroe Collective" },
      { name: "description", content: "Accept an invitation to help with a Kenroe schedule." },
      { property: "og:title", content: "Co-host invitation, The Kenroe Collective" },
      { property: "og:description", content: "Accept an invitation to help with a Kenroe schedule." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const get = useServerFn(getCohostInvite);
  const accept = useServerFn(acceptCohostInvite);
  const [info, setInfo] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = /^[a-f0-9]{48}$/.test(token);

  useEffect(() => {
    if (!valid) { setInfo({ state: "invalid" }); return; }
    void get({ data: { token } }).then(setInfo).catch((e) => setErr(toUserMessage(e)));
  }, [get, token, valid]);

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <main className="mx-auto max-w-lg px-5 py-12">
        <section className="rounded-3xl bg-card p-8 ring-1 ring-ink/5">
          <h1 className="font-serif text-2xl">Co-host invitation</h1>
          {err ? <p className="mt-4 text-sm text-destructive">{err}</p> : null}
          {!info && !err ? <p className="mt-4 text-sm text-muted-foreground">Checking your invitation...</p> : null}
          {info?.state === "invalid" ? <p className="mt-4 text-sm">This invitation is no longer active. Ask the owner for a new one.</p> : null}
          {info?.state === "used" ? <p className="mt-4 text-sm">This invitation has already been used.</p> : null}
          {info?.state === "wrong_email" ? <p className="mt-4 text-sm">This invitation is for {info.forEmail}. Sign out and sign in with that email to accept it.</p> : null}
          {info?.state === "accepted" ? (
            <p className="mt-4 text-sm">You already accepted. <Link to="/schedules/$id" params={{ id: info.scheduleId }} className="underline">Open the schedule</Link></p>
          ) : null}
          {info?.state === "ready" ? (
            <>
              <p className="mt-4 text-sm">
                {info.ownerName} invited you to {info.role === "edit" ? "edit the people and messages for" : "see the attendance report for"} <span className="font-medium">{info.title}</span>.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">You will see only this schedule and the people on it.</p>
              <button type="button" disabled={busy} className="mt-6 rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50" onClick={async () => {
                setBusy(true);
                try { const r = await accept({ data: { token } }); navigate({ to: "/schedules/$id", params: { id: r.scheduleId } }); }
                catch (e) { setErr(toUserMessage(e)); setBusy(false); }
              }}>Accept invitation</button>
            </>
          ) : null}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
