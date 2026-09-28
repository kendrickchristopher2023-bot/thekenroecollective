import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { deleteEcard, duplicateEcard, listMyEcards } from "@/lib/ecards.functions";
import { confirmEcardDelete } from "@/lib/ecards-danger";
import { useAuthReady } from "@/hooks/use-auth-ready";
import { getEcardTheme } from "@/lib/ecard-themes";
import { ECARD_SEND_PRICE_LABEL } from "@/lib/ecards-pricing";
import { VentureBackLink } from "@/components/venture-back-link";
import { EcardsFirstRun } from "@/components/ecards-first-run";
import { VentureWhatsNewLink } from "@/components/venture-whats-new-link";
import { RevealCountdownBadge } from "@/components/ecard-countdown";
import { formatDateTimeInZone, useViewerTimeZone } from "@/lib/ecards-time";


export const Route = createFileRoute("/_authenticated/ecards/")({
  head: () => ({
    meta: [
      { title: "Group eCards — The Kenroe Collective" },
      {
        name: "description",
        content:
          "Create a group greeting card, share one link, and collect messages from everyone. Unlimited contributors.",
      },
      { property: "og:title", content: "Group eCards — The Kenroe Collective" },
      {
        property: "og:description",
        content: "One link, unlimited contributors, revealed on the day.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EcardsIndex,
});

function EcardsIndex() {
  const list = useServerFn(listMyEcards);
  const dropCard = useServerFn(deleteEcard);
  const copyCard = useServerFn(duplicateEcard);
  const navigate = useNavigate();
  const { user } = useAuthReady();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["ecards", "mine"],
    queryFn: () => list(),
  });

  const viewerZone = useViewerTimeZone();

  // Soonest upcoming reveal first, then already revealed keepsakes, newest first.
  const cards = useMemo(() => {
    const rows = [...(data?.cards ?? [])];
    const now = Date.now();
    return rows.sort((a, b) => {
      const at = new Date(a.reveal_date).getTime();
      const bt = new Date(b.reveal_date).getTime();
      const aPast = at <= now;
      const bPast = bt <= now;
      if (aPast !== bPast) return aPast ? 1 : -1;
      return aPast ? bt - at : at - bt;
    });
  }, [data?.cards]);

  const onDuplicate = async (id: string) => {
    setBusyId(id);
    setErr(null);
    try {
      const res = await copyCard({ data: { id } });
      await navigate({ to: "/ecards/$id", params: { id: res.card.id } });
    } catch {
      setErr("We could not duplicate that card. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (args: {
    id: string;
    occasion: string;
    recipientName: string;
    paid: boolean;
    messageCount: number;
  }) => {
    const ok = await confirmEcardDelete({
      occasion: args.occasion,
      recipientName: args.recipientName,
      paid: args.paid,
      messageCount: args.messageCount,
    });
    if (!ok) return;
    setBusyId(args.id);
    setErr(null);
    try {
      await dropCard({ data: { id: args.id } });
      await refetch();
    } catch {
      setErr("We could not delete that card. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="venture-ecards mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <EcardsFirstRun />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <VentureBackLink to="/" label="Back to The Kenroe Collective" />
        <VentureWhatsNewLink tone="walnut" storageKey="kenroe.ecards.whatsnew.seen" />
      </div>


      {user?.email && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-xs text-ink/60">
            Signed in as <span className="font-medium text-ink/80">{user.email}</span>. You are
            seeing the cards that belong to this account.
          </p>
          <button
            type="button"
            onClick={async () => {
              const { supabase } = await import("@/integrations/supabase/client");
              await supabase.auth.signOut();
              navigate({ to: "/auth", search: { redirect: undefined } as any, replace: true });
            }}
            className="rounded-full px-3 py-1 text-xs font-medium text-velvet ring-1 ring-velvet/25 transition-colors hover:bg-velvet/5"
          >
            Sign out
          </button>
        </div>
      )}

      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}

      <div className="mt-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-velvet">Venture 02</p>
          <h1 className="mt-1 font-display text-3xl text-ink sm:text-4xl">Group eCards</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/70">
            One card, one link, everyone signs it. Messages and photos stay hidden until the reveal
            date, and there is no limit on how many people can add to it.
          </p>
        </div>
        <Link
          to="/ecards/new"
          className="inline-flex min-h-11 items-center rounded-full bg-velvet px-6 py-3 text-sm font-medium text-paper transition hover:opacity-90"
        >
          Start a card free
        </Link>
      </div>


      {/* Pricing panel, mirroring the Projects venture pattern on /pricing.
          Shown for transparency only: creating and collecting stays free, and
          the per-card fee is charged at the send step. */}
      <div className="mt-8 rounded-3xl bg-card p-5 ring-1 ring-velvet/20 sm:p-6">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">
          Pricing
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <h2 className="font-display text-2xl leading-tight text-ink sm:text-3xl">
            {ECARD_SEND_PRICE_LABEL} per card, unlimited contributors
          </h2>
          <span className="rounded-full bg-velvet/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-velvet">
            Free to start
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-ink/70">
          Creating a card and collecting messages is free. You only pay {ECARD_SEND_PRICE_LABEL}
          {" "}when you choose to send it to the recipient.
        </p>
        <ul className="mt-3 grid gap-1.5 text-xs text-ink/65 sm:grid-cols-2">
          <li>Unlimited messages, GIFs, photos and video</li>
          <li>AI "help me write" for contributors</li>
          <li>Scheduled reveal-day delivery by email</li>
          <li>Organizer moderation before the reveal</li>
          <li>Permanent keepsake page</li>
          <li>Priced per card, never per month</li>
        </ul>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            to="/ecards/new"
            className="inline-flex min-h-11 items-center rounded-full bg-velvet px-6 py-3 text-sm font-medium text-paper transition hover:opacity-90"
          >
            Start a card free
          </Link>
          <Link
            to="/pricing"
            search={{ category: "ecards" }}
            className="inline-flex min-h-11 items-center text-sm font-medium text-velvet underline underline-offset-4"
          >
            See it alongside our other pricing
          </Link>
        </div>

      </div>


      <div className="mt-8">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-secondary" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-3xl border border-velvet/30 bg-paper p-10 text-center">
            <h2 className="font-display text-2xl text-ink">We could not load your cards</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink/70">
              Nothing has been lost. This is usually a connection hiccup, so try again in a moment.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-6 inline-flex min-h-11 items-center rounded-full bg-velvet px-6 py-3 text-sm font-medium text-paper transition hover:opacity-90"
            >
              Try again
            </button>
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-velvet/30 bg-paper p-10 text-center">
            <p className="text-5xl" aria-hidden>
              💌
            </p>
            <h2 className="mt-4 font-display text-2xl text-ink">No cards yet</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink/70">
              Start one for a birthday, a leaving do, or a thank you. It takes about a minute, and
              you only pay when you send it.
            </p>
            <Link
              to="/ecards/new"
              className="mt-6 inline-flex min-h-11 items-center rounded-full bg-velvet px-6 py-3 text-sm font-medium text-paper transition hover:opacity-90"
            >
              Create your first card
            </Link>
          </div>

        ) : (
          <ul className="space-y-3">
            {cards.map((c) => {
              const theme = getEcardTheme(c.theme);
              const count = data?.counts[c.id] ?? 0;
              const reveal = new Date(c.reveal_date);
              const revealed = c.status === "revealed" || reveal.getTime() <= Date.now();
              const sent = Boolean(c.delivered_at);
              const paid = Boolean(c.is_paid);
              const isDraft = !paid && count === 0;
              return (
                <li key={c.id}>
                  <Link
                    to="/ecards/$id"
                    params={{ id: c.id }}
                    className="flex items-start gap-4 rounded-2xl border border-ink/10 bg-paper p-4 transition hover:border-velvet/40 hover:shadow-sm"
                  >
                    <span
                      className="grid h-14 w-14 shrink-0 place-items-center rounded-xl text-2xl"
                      style={{ background: theme.bg }}
                      aria-hidden
                    >
                      {theme.motif}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold text-ink sm:text-lg">
                        {c.occasion} for {c.recipient_name}
                      </span>
                      <span className="mt-1 block text-base font-semibold text-velvet">
                        {count} {count === 1 ? "message" : "messages"}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink/70">
                        <span
                          className={
                            sent || paid
                              ? "rounded-full bg-velvet/10 px-2.5 py-0.5 text-sm font-medium text-velvet"
                              : "rounded-full bg-ink/5 px-2.5 py-0.5 text-sm font-medium text-ink/70"
                          }
                        >
                          {sent ? "Sent" : paid ? "Paid" : "Not sent yet"}
                        </span>
                        {isDraft && (
                          <span className="rounded-full border border-ink/20 px-2.5 py-0.5 text-sm font-medium text-ink/70">
                            Draft, no messages yet
                          </span>
                        )}
                        <span>
                          {revealed
                            ? "Revealed"
                            : `Reveals ${formatDateTimeInZone(c.reveal_date, viewerZone)}`}
                        </span>
                        <RevealCountdownBadge revealDate={c.reveal_date} revealed={revealed} />

                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-sm font-medium text-ink/70">
                      {revealed ? "Keepsake" : "Collecting"}
                    </span>
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-2 pl-1">
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => void onDuplicate(c.id)}
                      className="rounded-full border border-ink/20 px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-velvet/50 hover:text-velvet disabled:opacity-60"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() =>
                        void onDelete({
                          id: c.id,
                          occasion: c.occasion,
                          recipientName: c.recipient_name,
                          paid,
                          messageCount: count,
                        })
                      }
                      className="rounded-full border border-destructive/30 px-4 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

        )}
      </div>
    </div>
  );
}
