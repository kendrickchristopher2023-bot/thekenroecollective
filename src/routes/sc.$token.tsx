import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPersonPage, submitRsvp } from "@/lib/schedules.functions";
import { toUserMessage } from "@/lib/user-error";

export const Route = createFileRoute("/sc/$token")({
  loader: async ({ params }) => {
    if (!/^[a-f0-9]{48}$/.test(params.token)) throw notFound();
    const page = await getPersonPage({ data: { token: params.token } });
    if (!page) throw notFound();
    return page;
  },
  head: () => ({
    meta: [
      { title: "Your call details, The Kenroe Collective" },
      { name: "description", content: "See the next date and let your host know if you can make it." },
      { property: "og:title", content: "Your call details" },
      { property: "og:description", content: "See the next date and let your host know if you can make it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PersonPage,
  notFoundComponent: () => (
    <main className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="font-serif text-2xl">This link isn't active</h1>
      <p className="mt-2 text-sm text-muted-foreground">Ask your host to send you a new one.</p>
    </main>
  ),
  errorComponent: () => (
    <main className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="font-serif text-2xl">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">Please try again in a moment.</p>
    </main>
  ),
});

const CHOICES = [
  { v: "yes", label: "I will attend" },
  { v: "maybe", label: "I may attend" },
  { v: "no", label: "I cannot attend" },
] as const;

function PersonPage() {
  const page = Route.useLoaderData();
  const { token } = Route.useParams();
  const submit = useServerFn(submitRsvp);
  const [answer, setAnswer] = useState<string | null>(page.answer);
  const [note, setNote] = useState(page.note ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const label = CHOICES.find((c) => c.v === answer)?.label;

  async function save(v: "yes" | "maybe" | "no") {
    if (!page.occurrenceId) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      await submit({ data: { token, occurrenceId: page.occurrenceId, answer: v, note } });
      setAnswer(v);
      setMsg("Thank you. Your answer is saved. You can change it any time before the call starts.");
    } catch (e) { setErr(toUserMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-paper px-5 py-10">
      <div className="mx-auto max-w-md space-y-5">
        <section aria-labelledby="schedule-title">
          {page.firstName ? <p className="text-sm text-muted-foreground">Hi {page.firstName},</p> : null}
          <h1 id="schedule-title" className="font-serif text-3xl">{page.title}</h1>
          {page.nextLabel ? <p className="mt-2 text-lg">{page.nextLabel}</p> : <p className="mt-2 text-muted-foreground">No upcoming date yet.</p>}
        </section>

        {page.joinUrl || page.dialIn || page.location || page.description ? (
          <section className="rounded-3xl bg-card p-5 ring-1 ring-ink/5" aria-labelledby="join-details">
            <h2 id="join-details" className="font-serif text-xl">How to join</h2>
            {page.joinUrl ? <a href={page.joinUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-primary-foreground">Join the call</a> : null}
            {page.description ? <p className="mt-4 whitespace-pre-wrap break-words text-sm">{page.description}</p> : null}
            {page.dialIn ? <p className="mt-3 text-sm">Dial in: <a className="underline" href={`tel:${page.dialIn}`}>{page.dialIn}</a>{page.dialPin ? `, PIN ${page.dialPin}` : ""}</p> : null}
            {page.location ? <p className="mt-2 text-sm">{page.location}</p> : null}
          </section>
        ) : null}

        {page.occurrenceId ? (
          <section className="rounded-3xl bg-card p-5 ring-1 ring-ink/5">
            <h2 className="font-serif text-xl">Can you make it?</h2>
            {page.locked ? (
              <p className="mt-2 text-sm">{label ? `Your answer: ${label}.` : "You didn't answer for this date."} This call has started, so answers are closed.</p>
            ) : (
              <>
                <div className="mt-3 grid gap-2">
                  {CHOICES.map((c) => (
                    <button key={c.v} type="button" disabled={busy} aria-pressed={answer === c.v} onClick={() => void save(c.v)}
                      className={`rounded-2xl px-4 py-3 text-left text-base ring-1 disabled:opacity-60 ${answer === c.v ? "bg-velvet text-primary-foreground ring-velvet" : "bg-background ring-ink/10"}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
                <label className="mt-4 block text-sm"><span className="text-xs text-muted-foreground">Add a note for your host (optional)</span>
                  <textarea className="mt-1 w-full rounded-xl border border-ink/10 bg-background px-3 py-2 text-sm" rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
                <p className="text-xs text-muted-foreground">{note.length}/200. Your note is saved when you tap an answer.</p>
              </>
            )}
            {msg ? <p className="mt-3 rounded-xl bg-emerald-100 p-3 text-sm text-emerald-900" role="status">{msg}</p> : null}
            {err ? <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">{err}</p> : null}
          </section>
        ) : null}

        {page.host ? (
          <section className="rounded-3xl bg-card p-5 text-sm ring-1 ring-ink/5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Your host</p>
            {page.host.name ? <p className="mt-1 font-medium">{page.host.name}</p> : null}
            {page.host.phone ? <p><a className="underline" href={`tel:${page.host.phone}`}>{page.host.phoneLabel}</a></p> : null}
            {page.host.email ? <p><a className="underline" href={`mailto:${page.host.email}`}>{page.host.email}</a></p> : null}
            {page.host.note ? <p className="mt-1 text-muted-foreground">{page.host.note}</p> : null}
          </section>
        ) : null}
        <p className="text-center text-xs text-muted-foreground">Sent with The Kenroe Collective</p>
      </div>
    </main>
  );
}
