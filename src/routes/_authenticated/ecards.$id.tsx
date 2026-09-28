import { useEffect, useMemo, useRef, useState } from "react";
import { localTimeZone, revealInputToUtcIso, utcIsoToLocalInput } from "@/lib/ecards-reveal-time";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { EcardMusicPanel } from "@/components/ecard-music-panel";
import {
  addOrganizerContribution,
  confirmEcardPayment,
  createEcardCheckout,
  deleteContribution,
  deleteEcard,
  duplicateEcard,
  getMyEcard,
  curateEcardMontagePreview,
  previewEcardReveal,
  reorderContributions,
  sendEcardNow,
  setContributionHidden,
  setEcardOrganizerTimezone,
  removeContributionMediaAsOrganizer,
  updateContributionAsOrganizer,
  updateEcard,
} from "@/lib/ecards.functions";
import {
  confirmRemoveMedia,
  removeMediaLabel,
  type EcardMediaSlot,
} from "@/lib/ecard-media-slots";
import { ECARD_OCCASIONS, getEcardTheme, groupedEcardThemes } from "@/lib/ecard-themes";

import { EcardMontage, type MontageCuration } from "@/components/ecard-montage";
import { ContributionMedia } from "@/components/ecard-media";
import { ECARD_SEND_PRICE_LABEL } from "@/lib/ecards-pricing";
import { GiphyPicker } from "@/components/giphy-picker";
import { VoiceNoteRecorder } from "@/components/ecard-voice-recorder";
import { VentureBackLink } from "@/components/venture-back-link";
import { confirmEcardDelete } from "@/lib/ecards-danger";
import { RevealCountdown } from "@/components/ecard-countdown";
import { AddRevealToCalendarButton } from "@/components/add-to-calendar-button";
import { useLocalDateTime, useLocalMonthDay } from "@/lib/ecards-time";

import { getStripeEnvironment } from "@/lib/stripe";
import { ClientSecretCheckout } from "@/components/client-secret-checkout";
import { supabase } from "@/integrations/supabase/client";
import { confirmDialog } from "@/lib/confirm-dialog";
import { viewerTimeZone } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/ecards/$id")({
  validateSearch: (search: Record<string, unknown>): { ecard_session?: string } => ({
    ecard_session: typeof search.ecard_session === "string" ? search.ecard_session : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Manage your group card — The Kenroe Collective" },
      {
        name: "description",
        content: "Share the contribution link, watch messages arrive, and set the reveal.",
      },
      { property: "og:title", content: "Manage your group card" },
      {
        property: "og:description",
        content: "Share the contribution link, watch messages arrive, and set the reveal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EcardDashboard,
});

// Stored reveal_date is a UTC instant. The datetime-local field is the
// organizer's own wall clock, so both directions go through the shared helpers.
const toLocalInput = utcIsoToLocalInput;

function EcardDashboard() {
  const { id } = Route.useParams();
  const { ecard_session: ecardSession } = Route.useSearch();
  const navigate = useNavigate();
  const load = useServerFn(getMyEcard);
  const hide = useServerFn(setContributionHidden);
  const remove = useServerFn(deleteContribution);
  const reorder = useServerFn(reorderContributions);
  const patch = useServerFn(updateEcard);
  const dropCard = useServerFn(deleteEcard);
  const copyCard = useServerFn(duplicateEcard);
  const addMine = useServerFn(addOrganizerContribution);
  const editMessage = useServerFn(updateContributionAsOrganizer);
  const dropMedia = useServerFn(removeContributionMediaAsOrganizer);
  const loadPreview = useServerFn(previewEcardReveal);
  const confirmPayment = useServerFn(confirmEcardPayment);
  const sendNow = useServerFn(sendEcardNow);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["ecards", id],
    queryFn: () => load({ data: { id } }),
    refetchInterval: 30000,
  });

  const [copied, setCopied] = useState<"share" | "reveal" | "reminder" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "mine" | "edit" | "preview">("none");
  /**
   * Checkout has its own toggle so opening it never closes (and throws away)
   * a message the organizer is still writing in the "mine" panel.
   */
  const [payOpen, setPayOpen] = useState(false);
  const mineRef = useRef<HTMLDivElement | null>(null);
  /** Which message the organizer is editing right now, if any. */
  const [editingId, setEditingId] = useState<string | null>(null);

  /** Open the organizer's own message form and bring it into view. */
  const openMine = () => {
    setPanel("mine");
    window.setTimeout(() => {
      mineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };
  /** Post-checkout confirmation screen, so nobody is left on a dead end. */
  const [paidConfirmation, setPaidConfirmation] = useState<"none" | "paid" | "pending">("none");


  const card = data?.card ?? null;
  const contributions = data?.contributions ?? [];
  const theme = getEcardTheme(card?.theme);

  // Older cards were created before we stored the organizer's zone. Fill it in
  // quietly from the browser on the first dashboard visit, so reminder emails
  // can be held to this organizer's daytime hours. Nothing else is written.
  const saveTimezone = useServerFn(setEcardOrganizerTimezone);
  const timezoneSaved = useRef(false);
  useEffect(() => {
    if (!card || card.organizer_timezone || timezoneSaved.current) return;
    timezoneSaved.current = true;
    let zone = "";
    try {
      zone = viewerTimeZone();
    } catch {
      zone = "";
    }
    if (!zone) return;
    void saveTimezone({ data: { id: card.id, timezone: zone } });
  }, [card, saveTimezone]);


  /** Delete this card (and only this card's messages), always with confirmation. */
  const handleDeleteCard = async () => {
    if (!card) return;
    const ok = await confirmEcardDelete({
      occasion: card.occasion,
      recipientName: card.recipient_name,
      paid: Boolean(card.is_paid),
      messageCount: contributions.length,
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await dropCard({ data: { id } });
      await navigate({ to: "/ecards" });
    } catch {
      setErr("We could not delete that card. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  /** Make a fresh copy of this card, with no messages and nothing paid. */
  const handleDuplicateCard = async () => {
    if (!card) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await copyCard({ data: { id } });
      await navigate({ to: "/ecards/$id", params: { id: res.card.id } });
    } catch {
      setErr("We could not duplicate that card. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = card ? `${origin}/c/${card.public_slug}` : "";
  const revealUrl = card ? `${origin}/r/${card.public_slug}` : "";

  /** Friendly, prefilled reminder the organizer re-shares with their group. */
  const revealMonthDay = useLocalMonthDay(card?.reveal_date);
  const revealLocal = useLocalDateTime(card?.reveal_date);
  const deliveredLocal = useLocalDateTime(card?.delivered_at ?? null);
  const reminderText = useMemo(() => {
    if (!card) return "";
    const deadline = revealMonthDay;
    const count = contributions.length;
    const so_far =
      count === 0
        ? "No messages yet, so yours would be the first."
        : `We have ${count} ${count === 1 ? "message" : "messages"} so far.`;
    return `Quick reminder: we are putting together a group card for ${card.recipient_name}. ${so_far} Please add your message before ${deadline}, when the card is revealed (${revealLocal}). It stays a secret until then. Add yours here: ${shareUrl}`;
  }, [card, contributions.length, shareUrl, revealMonthDay, revealLocal]);

  /** Native sharing is only offered where the browser actually supports it. */
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  /** Hand the reminder to the phone or desktop share sheet. */
  const shareReminder = async () => {
    if (!card) return;
    try {
      await navigator.share({
        title: `A group card for ${card.recipient_name}`,
        text: reminderText,
      });
    } catch {
      // Cancelled or unsupported, nothing to report.
    }
  };

  const revealed = useMemo(() => {
    if (!card) return false;
    return card.status === "revealed" || new Date(card.reveal_date).getTime() <= Date.now();
  }, [card]);

  // Payment return: verify with Stripe, then clear the query param.
  useEffect(() => {
    if (!ecardSession) return;
    let alive = true;
    (async () => {
      try {
        const res = await confirmPayment({
          data: { sessionId: ecardSession, environment: getStripeEnvironment() },
        });
        if (!alive) return;
        if (res.paid) {
          setPaidConfirmation("paid");
          setPanel("none");
        } else {
          setPaidConfirmation("pending");
        }
        await refetch();
      } catch {
        if (alive) setErr("We could not confirm that payment. Please try again.");
      } finally {
        if (alive) void navigate({ to: "/ecards/$id", params: { id }, search: {}, replace: true });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ecardSession]);

  const copy = async (text: string, which: "share" | "reveal" | "reminder") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...contributions];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    const a = next[index]!;
    next[index] = next[target]!;
    next[target] = a;
    setBusy(true);
    try {
      await reorder({ data: { ecardId: id, orderedIds: next.map((c) => c.id) } });
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="venture-ecards mx-auto w-full max-w-3xl px-4 py-12">
        <div className="h-40 animate-pulse rounded-2xl bg-secondary" />
      </div>
    );
  }

  // A failed load used to fall through to "Card not found ... it may have been
  // deleted", which tells the organiser their card is gone when the connection
  // simply dropped. Keep the two apart.
  if (isError) {
    return (
      <div className="venture-ecards mx-auto w-full max-w-3xl px-4 py-12 text-center">
        <h1 className="font-display text-2xl text-ink">We could not load this card</h1>
        <p className="mt-2 text-sm text-ink/70">
          Your card and every message on it are safe. This is usually a connection hiccup.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex min-h-11 items-center rounded-full bg-velvet px-6 py-3 text-sm font-medium text-paper transition hover:opacity-90"
          >
            Try again
          </button>
          <VentureBackLink to="/ecards" label="Back to Group eCards" />
        </div>
      </div>
    );
  }



  if (!card) {
    return (
      <div className="venture-ecards mx-auto w-full max-w-3xl px-4 py-12 text-center">
        <h1 className="font-display text-2xl text-ink">Card not found</h1>
        <p className="mt-2 text-sm text-ink/70">It may have been deleted.</p>
        <div className="mt-6 flex justify-center">
          <VentureBackLink to="/ecards" label="Back to Group eCards" />
        </div>
      </div>
    );
  }

  if (paidConfirmation !== "none") {
    const paid = paidConfirmation === "paid";
    return (
      <div className="venture-ecards mx-auto w-full max-w-2xl px-4 py-12">
        <div
          className="ecard-slide rounded-3xl border border-velvet/25 bg-card p-8 text-center sm:p-10"
          role="status"
        >
          <p className="text-5xl" aria-hidden>
            {paid ? "🎉" : "⏳"}
          </p>
          <h1 className="mt-4 font-display text-2xl text-ink sm:text-3xl">
            {paid ? "Payment received. Thank you." : "We are still confirming your payment"}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink/70">
            {paid
              ? `Your card for ${card.recipient_name} is paid and ready. We will email it on the reveal date, or you can send it now from the card page.`
              : "This usually takes a few seconds. Head back to your card and it will update by itself."}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => {
                setPaidConfirmation("none");
                void refetch();
              }}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-velvet px-7 py-3 text-base font-medium text-paper transition hover:opacity-90"
            >
              Back to your card
            </button>
            <Link
              to="/ecards"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-ink/20 px-7 py-3 text-base font-medium text-ink transition-colors hover:border-velvet/50 hover:text-velvet"
            >
              Back to Group eCards home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="venture-ecards mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <VentureBackLink to="/ecards" label="Back to Group eCards" />

      <div
        className="mt-6 overflow-hidden rounded-3xl border border-ink/10 p-6 sm:p-8"
        style={{ background: theme.bg }}
      >
        <p className="text-3xl" aria-hidden>
          {theme.motif}
        </p>
        <h1 className="mt-2 font-display text-2xl sm:text-3xl" style={{ color: theme.ink }}>
          {card.occasion} for {card.recipient_name}
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: theme.ink, opacity: 0.78 }}>
          {card.delivered_at
            ? `Delivered ${deliveredLocal}`
            : revealed
              ? "Revealed. The keepsake page is live."
              : `Reveals ${revealLocal}`}
        </p>
      </div>

      <div className="mt-4">
        <RevealCountdown
          revealDate={card.reveal_date}
          revealed={revealed}
          messageCount={contributions.length}
        />
      </div>

      {/* The reveal is one global instant, so the .ics is anchored in UTC and
          each calendar shows it in that person's own time zone. */}
      {!revealed && (
        <div className="mt-4">
          <AddRevealToCalendarButton
            cardId={card.id}
            occasion={card.occasion}
            recipientName={card.recipient_name}
            revealDate={card.reveal_date}
            cardHref={`/ecards/${card.id}`}
          />
          <p className="mt-2 text-sm text-ink/65">
            Downloads a calendar file for the reveal moment, shown in your own time zone.
          </p>
        </div>
      )}





      {notice && (
        <p className="mt-4 rounded-xl border border-ink/10 bg-secondary/60 px-4 py-3 text-sm text-ink">
          {notice}
        </p>
      )}
      {err && <p className="mt-4 text-sm text-destructive">{err}</p>}

      {contributions.length === 0 && !card.delivered_at && !revealed && (
        <section className="mt-5 rounded-2xl border-2 border-velvet/25 bg-velvet/[0.06] p-5 sm:p-6">
          <h2 className="font-display text-xl text-ink sm:text-2xl">
            Start by adding your own message
          </h2>
          <p className="mt-2 max-w-prose text-base leading-relaxed text-ink/75">
            You can write on this card right here, in the app. There is no need to open the share
            link. Add yours first, then invite everyone else to sign it too.
          </p>
          <button
            type="button"
            onClick={openMine}
            className="mt-4 inline-flex min-h-14 w-full items-center justify-center rounded-full bg-velvet px-8 py-4 text-lg font-medium text-paper transition hover:opacity-90 sm:w-auto"
          >
            Write your message
          </button>
        </section>
      )}

      <div className="mt-5 flex flex-wrap gap-2.5">
        {!revealed && (
          <button
            type="button"
            onClick={() => (panel === "mine" ? setPanel("none") : openMine())}
            aria-expanded={panel === "mine"}
            className="inline-flex min-h-12 items-center rounded-full bg-velvet px-6 py-3 text-base font-medium text-paper shadow-sm transition hover:opacity-90"
          >
            Write your message
          </button>
        )}
        <button
          type="button"
          onClick={() => setPanel(panel === "edit" ? "none" : "edit")}
          aria-expanded={panel === "edit"}
          className="inline-flex min-h-12 items-center rounded-full border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-velvet/50 hover:text-velvet"
        >
          Edit card
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === "preview" ? "none" : "preview")}
          aria-expanded={panel === "preview"}
          className="inline-flex min-h-12 items-center rounded-full border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-velvet/50 hover:text-velvet"
        >
          Preview the reveal
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleDuplicateCard}
          className="inline-flex min-h-12 items-center rounded-full border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-velvet/50 hover:text-velvet disabled:opacity-60"
        >
          Duplicate this card
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleDeleteCard}
          className="inline-flex min-h-12 items-center rounded-full border border-destructive/30 px-5 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-60"
        >
          Delete this card
        </button>
      </div>

      <p className="mt-2.5 text-sm text-ink/65">
        {revealed
          ? "This card has already been sent, so messages are locked for everyone."
          : "Write your message posts it straight onto this card, no need to open the share link."}
      </p>

      <div ref={mineRef}>
        {panel === "mine" && (
          <OwnMessagePanel
            themeAccent={theme.accent}
            busy={busy}
            onCancel={() => setPanel("none")}
            onSave={async (payload) => {
              setBusy(true);
              setErr(null);
              try {
                await addMine({ data: { ecardId: id, ...payload } });
                await refetch();
                setPanel("none");
                setNotice("Your message has been added to the card.");
              } catch {
                setErr("We could not add your message. Please try again.");
              } finally {
                setBusy(false);
              }
            }}
            slug={card.public_slug}
          />
        )}
      </div>


      {panel === "edit" && (
        <EditCardPanel
          initial={{
            occasion: card.occasion,
            recipientName: card.recipient_name,
            recipientEmail: card.recipient_email ?? "",
            theme: card.theme,
            revealDate: toLocalInput(card.reveal_date),
          }}
          busy={busy}
          onCancel={() => setPanel("none")}
          onSave={async (values) => {
            setBusy(true);
            setErr(null);
            try {
              await patch({ data: { id, ...values } });
              await refetch();
              setPanel("none");
              setNotice("Card updated.");
            } catch {
              setErr("We could not save those changes. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
          onDelete={handleDeleteCard}
        />
      )}

      {panel === "preview" && (
        <RevealPreviewPanel ecardId={id} loadPreview={() => loadPreview({ data: { id } })} />
      )}

      <section className="mt-6 rounded-2xl border border-ink/10 bg-paper p-5">
        <h2 className="text-base font-medium text-ink">Send it to {card.recipient_name}</h2>
        {card.delivered_at ? (
          <p className="mt-1 text-sm text-ink/70">
            Sent on {deliveredLocal}. The keepsake page stays
            live for them.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink/70">
              Collecting messages is free. Sending the finished card is a one-off{" "}
              {ECARD_SEND_PRICE_LABEL}, with unlimited contributors. We email it automatically on
              the reveal date, or you can send it now.
            </p>
            <p className="mt-2 rounded-xl bg-secondary/60 px-3 py-2 text-sm text-ink/80">
              Creating a card and collecting messages is free. You are only charged{" "}
              {ECARD_SEND_PRICE_LABEL} when you choose to send it, and that payment is final, so
              there are no refunds once sent. That is the full price, with no processing fee added.
            </p>
            {!card.recipient_email && (
              <p className="mt-2 rounded-xl bg-secondary/60 px-3 py-2 text-xs text-ink/75">
                Add their email address under Edit card so we know where to send it.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                  card.is_paid ? "bg-velvet/10 text-velvet" : "bg-secondary text-ink/70"
                }`}
              >
                {card.is_paid ? "Paid" : `Not paid, ${ECARD_SEND_PRICE_LABEL}`}
              </span>
              {!card.is_paid && (
                <button
                  type="button"
                  onClick={() => setPayOpen((o) => !o)}
                  aria-expanded={payOpen}
                  className="inline-flex min-h-11 items-center rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-paper"
                >
                  Pay {ECARD_SEND_PRICE_LABEL} to send
                </button>
              )}
              {card.is_paid && (
                <button
                  type="button"
                  disabled={busy || !card.recipient_email}
                  onClick={async () => {
                    setBusy(true);
                    setErr(null);
                    try {
                      const res = await sendNow({ data: { id } });
                      if (res.ok) setNotice("Sent. They have the card in their inbox now.");
                      else setErr(res.error ?? "We could not send it just yet.");
                      await refetch();
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="inline-flex min-h-11 items-center rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-60"
                >
                  Send now
                </button>
              )}
            </div>
          </>
        )}
        {payOpen && !card.is_paid && (
          <div className="mt-4 rounded-2xl border border-ink/10 p-3">
            <ClientSecretCheckout
              loadClientSecret={() =>
                createEcardCheckout({
                  data: {
                    ecardId: id,
                    returnUrl: `${origin}/ecards/${id}?ecard_session={CHECKOUT_SESSION_ID}`,
                    environment: getStripeEnvironment(),
                  },
                })
              }
            />
          </div>
        )}
      </section>

      <EcardMusicPanel
        ecardId={id}
        musicPieceId={(card as { music_piece_id?: string | null }).music_piece_id ?? null}
        musicHeardAt={(card as { music_heard_at?: string | null }).music_heard_at ?? null}
        onChanged={() => void refetch()}
      />

      <section className="mt-4 rounded-2xl border border-velvet/20 bg-paper p-5">
        <h2 className="font-display text-xl text-ink">Remind everyone to sign</h2>
        <p className="mt-1.5 text-base leading-relaxed text-ink/70">
          Contributors do not need an account and we never ask them for an email, so we cannot
          message them. Reminders only reach your group when you share the link again. Here is a
          ready made message you can send.
        </p>

        <div className="mt-4 rounded-2xl border border-velvet/20 bg-velvet/[0.05] p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-ink/55">
            Your reminder message
          </p>
          <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-ink">
            {reminderText}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => copy(reminderText, "reminder")}
              className="inline-flex min-h-14 flex-1 items-center justify-center rounded-full bg-velvet px-6 py-3 text-base font-medium text-paper transition hover:opacity-90"
            >
              {copied === "reminder" ? "Copied" : "Copy reminder"}
            </button>
            {canNativeShare && (
              <button
                type="button"
                onClick={shareReminder}
                className="inline-flex min-h-14 flex-1 items-center justify-center rounded-full border border-velvet/40 px-6 py-3 text-base font-medium text-velvet transition hover:bg-velvet/5"
              >
                Share reminder
              </button>
            )}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink/60">
            Send it by text, WhatsApp, email, or anywhere your group already talks.
          </p>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-ink">Contribution link on its own</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={shareUrl}
              aria-label="Contribution link"
              className="flex-1 rounded-xl border border-ink/15 bg-secondary px-3 py-3 text-sm text-ink"
            />
            <button
              type="button"
              onClick={() => copy(shareUrl, "share")}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-ink/20 px-5 py-2.5 text-base font-medium text-ink"
            >
              {copied === "share" ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="mt-2 text-sm text-ink/60">
            Anyone with this link can add a message. No account needed, and there is no limit on
            contributors.
          </p>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink/60">
          We will also email you one friendly reminder about three days before the reveal, with your
          message count, so you have a chance to collect a few more.
        </p>
      </section>


      <section className="mt-4 rounded-2xl border border-ink/10 bg-paper p-5">
        <h2 className="text-base font-medium text-ink">Recipient reveal link</h2>
        <p className="mt-1 text-sm text-ink/70">
          Send this to {card.recipient_name} on the day. It stays sealed until the reveal moment.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={revealUrl}
            aria-label="Reveal link"
            className="flex-1 rounded-xl border border-ink/15 bg-secondary px-3 py-2.5 text-xs text-ink"
          />
          <button
            type="button"
            onClick={() => copy(revealUrl, "reveal")}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-ink/20 px-5 py-2.5 text-sm font-medium text-ink"
          >
            {copied === "reveal" ? "Copied" : "Copy link"}
          </button>
        </div>
        {!revealed && (
          <button
            type="button"
            disabled={busy || !card.is_paid}
            title={card.is_paid ? undefined : "Pay the sending fee first"}
            onClick={async () => {
              setBusy(true);
              try {
                await patch({ data: { id, status: "revealed" } });
                await refetch();
              } finally {
                setBusy(false);
              }
            }}
            className="mt-3 inline-flex min-h-11 items-center rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-60"
          >
            Reveal now
          </button>
        )}
      </section>

      <section className="mt-6">
        <h2 className="font-display text-xl text-ink">Messages ({contributions.length})</h2>
        <p className="mt-1.5 text-base leading-relaxed text-ink/70">
          {revealed
            ? "This card has already been sent, so messages can no longer be edited."
            : "You can edit any message here until the reveal. After that, messages are locked."}
        </p>
        {contributions.length === 0 ? (
          <div className="mt-3 rounded-2xl border-2 border-dashed border-velvet/25 bg-velvet/[0.04] p-6 text-center">
            <p className="text-lg font-medium text-ink">Start by adding your own message</p>
            <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-ink/70">
              Write yours here in the app, no share link needed. Then send the link above so
              everyone else can sign the card too.
            </p>
            <button
              type="button"
              onClick={openMine}
              className="mt-4 inline-flex min-h-14 w-full items-center justify-center rounded-full bg-velvet px-8 py-4 text-lg font-medium text-paper transition hover:opacity-90 sm:w-auto"
            >
              Write your message
            </button>
          </div>
        ) : (

          <ul className="mt-3 space-y-3">
            {contributions.map((c, i) => (
              <li
                key={c.id}
                className={`rounded-2xl border border-ink/10 bg-paper p-4 ${c.is_hidden ? "opacity-50" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-ink">{c.contributor_name}</p>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={busy || i === 0}
                      aria-label="Move up"
                      className="rounded-lg border border-ink/15 px-2 py-1 text-xs text-ink/70 disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={busy || i === contributions.length - 1}
                      aria-label="Move down"
                      className="rounded-lg border border-ink/15 px-2 py-1 text-xs text-ink/70 disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await hide({ data: { contributionId: c.id, hidden: !c.is_hidden } });
                          await refetch();
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="rounded-lg border border-ink/15 px-2 py-1 text-xs text-ink/70"
                    >
                      {c.is_hidden ? "Show" : "Hide"}
                    </button>
                    {!revealed && (
                      <button
                        type="button"
                        onClick={() => setEditingId(editingId === c.id ? null : c.id)}
                        aria-expanded={editingId === c.id}
                        className="rounded-lg border border-velvet/40 px-2.5 py-1 text-xs font-medium text-velvet"
                      >
                        {editingId === c.id ? "Close" : "Edit"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        if (
                          !(await confirmDialog({
                            title: "Delete this message?",
                            body: "It will be removed from the card for everyone. This cannot be undone.",
                            confirmLabel: "Yes, delete it",
                          }))
                        )
                          return;
                        setBusy(true);
                        try {
                          await remove({ data: { contributionId: c.id } });
                          await refetch();
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="rounded-lg border border-destructive/30 px-2 py-1 text-xs text-destructive"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {c.message && (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                    {c.message}
                  </p>
                )}
                <ContributionMedia
                  item={c}
                  name={c.contributor_name}
                  mediaClassName="max-h-56 w-full rounded-xl object-contain"
                />
                {editingId === c.id && !revealed && (
                  <OwnMessagePanel
                    key={`edit-${c.id}`}
                    slug={card.public_slug}
                    themeAccent={theme.accent}
                    busy={busy}
                    title="Edit this message"
                    description="Fix the wording or swap the attachment. Changes are saved to the card straight away, and everything locks once the card is sent."
                    submitLabel="Save changes"
                    initial={{
                      contributorName: c.contributor_name,
                      message: c.message,
                      mediaType: c.media_type,
                      gifUrl: c.gif_url,
                      mediaUrl: c.media_url,
                      imageUrl: c.image_url,
                      videoUrl: c.video_url,
                      audioUrl: c.audio_url,
                    }}
                    onCancel={() => setEditingId(null)}
                    onRemoveMedia={async (slot) => {
                      setBusy(true);
                      setErr(null);
                      try {
                        const res = await dropMedia({ data: { contributionId: c.id, slot } });
                        if (!res.ok) {
                          setErr(res.error ?? "We could not remove that attachment.");
                          return false;
                        }
                        await refetch();
                        setNotice("That attachment has been removed.");
                        return true;
                      } catch {
                        setErr("We could not remove that attachment. Please try again.");
                        return false;
                      } finally {
                        setBusy(false);
                      }
                    }}
                    onSave={async (payload) => {
                      setBusy(true);
                      setErr(null);
                      try {
                        const res = await editMessage({
                          data: { contributionId: c.id, ...payload },
                        });
                        if (res.ok) {
                          await refetch();
                          setEditingId(null);
                          setNotice("That message has been updated.");
                        } else {
                          setErr(res.error ?? "We could not save that change.");
                        }
                      } catch {
                        setErr("We could not save that change. Please try again.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type OwnMessagePayload = {
  contributorName: string;
  message: string;
  mediaType: "none" | "gif" | "image" | "video" | "audio";
  gifUrl: string | null;
  mediaUrl: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
};

function OwnMessagePanel({
  slug,
  busy,
  onSave,
  onCancel,
  initial,
  title = "Write your message",
  description = "This posts your message straight onto the card, no need to open the share link. You can add a voice note, a GIF, a photo, or a video too.",
  submitLabel = "Add to the card",
  onRemoveMedia,
}: {
  slug: string;
  themeAccent: string;
  busy: boolean;
  onSave: (payload: OwnMessagePayload) => Promise<void>;
  onCancel: () => void;
  initial?: OwnMessagePayload;
  title?: string;
  description?: string;
  submitLabel?: string;
  /**
   * Persisted removal for a message that already exists on the card. Clears
   * only that one column and deletes the uploaded file. Left undefined while
   * writing a brand new message, where clearing the slot locally is enough.
   */
  onRemoveMedia?: (slot: EcardMediaSlot) => Promise<boolean>;
}) {
  const [name, setName] = useState(initial?.contributorName ?? "");
  const [message, setMessage] = useState(initial?.message ?? "");
  const [gifUrl, setGifUrl] = useState<string | undefined>(initial?.gifUrl ?? undefined);
  const [imageUrl, setImageUrl] = useState<string | undefined>(
    initial?.imageUrl ?? (initial?.mediaType === "image" ? (initial.mediaUrl ?? undefined) : undefined),
  );
  const [videoUrl, setVideoUrl] = useState<string | undefined>(
    initial?.videoUrl ?? (initial?.mediaType === "video" ? (initial.mediaUrl ?? undefined) : undefined),
  );
  const [audioUrl, setAudioUrl] = useState<string | undefined>(
    initial?.audioUrl ?? (initial?.mediaType === "audio" ? (initial.mediaUrl ?? undefined) : undefined),
  );
  // Independent slots: opening or closing one never clears another attachment.
  const [open, setOpen] = useState<{ gif: boolean; image: boolean; video: boolean; audio: boolean }>(
    { gif: false, image: false, video: false, audio: false },
  );
  const toggleSlot = (k: "gif" | "image" | "video" | "audio") =>
    setOpen((o) => ({ ...o, [k]: !o[k] }));

  /** Remove one attachment only, never the text or the other attachments. */
  const removeSlot = async (slot: EcardMediaSlot) => {
    if (!(await confirmRemoveMedia(slot))) return;
    if (onRemoveMedia) {
      const ok = await onRemoveMedia(slot);
      if (!ok) return;
    }
    if (slot === "gif") setGifUrl(undefined);
    if (slot === "image") setImageUrl(undefined);
    if (slot === "video") setVideoUrl(undefined);
    if (slot === "audio") setAudioUrl(undefined);
    setOpen((o) => ({ ...o, [slot]: false }));
  };
  const [uploading, setUploading] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const upload = async (file: File, kind: "image" | "video") => {
    const cap = kind === "video" ? 40 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > cap) {
      setLocalErr(kind === "video" ? "Keep videos under 40MB." : "Keep photos under 10MB.");
      return;
    }
    setUploading(true);
    setLocalErr(null);
    try {
      const ext = (file.name.split(".").pop() || (kind === "video" ? "mp4" : "jpg"))
        .toLowerCase()
        .slice(0, 5);
      const path = `${slug}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("ecard-media").upload(path, file, {
        contentType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
        upsert: false,
      });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("ecard-media").getPublicUrl(path);
      if (kind === "video") setVideoUrl(data.publicUrl);
      else setImageUrl(data.publicUrl);
    } catch {
      setLocalErr("That file would not upload. Please try another one.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="mt-4 rounded-2xl border-2 border-velvet/25 bg-paper p-5">
      <h2 className="font-display text-xl text-ink">{title}</h2>
      <p className="mt-1.5 text-base leading-relaxed text-ink/70">{description}</p>


      <div className="mt-3">
        <label htmlFor="ownName" className="block text-xs font-medium text-ink">
          Sign it as
        </label>
        <input
          id="ownName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="e.g. Mum and Dad"
          className="mt-1.5 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink"
        />
      </div>

      <div className="mt-3">
        <label htmlFor="ownMsg" className="block text-xs font-medium text-ink">
          Your message
        </label>
        <textarea
          id="ownMsg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={2000}
          className="mt-1.5 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink"
        />
      </div>

      <div className="mt-3">
        <span className="block text-xs font-medium text-ink">
          Attachments, add as many as you like
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["audio", "gif", "image", "video"] as const).map((t) => {
            const added =
              t === "audio" ? audioUrl : t === "gif" ? gifUrl : t === "image" ? imageUrl : videoUrl;
            const label =
              t === "audio" ? "Voice note" : t === "gif" ? "GIF" : t === "image" ? "Photo" : "Video";
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleSlot(t)}
                aria-pressed={open[t]}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium ${
                  open[t] || added ? "border-velvet bg-velvet text-paper" : "border-ink/15 text-ink"
                }`}
              >
                {`${label}${added ? " (added)" : ""}`}
              </button>
            );
          })}
        </div>

        {(open.audio || audioUrl) && (
          <div className="mt-3">
            <VoiceNoteRecorder
              slug={slug}
              value={audioUrl}
              onChange={setAudioUrl}
              onRemove={() => void removeSlot("audio")}
            />
            <p className="mt-1.5 text-[11px] text-ink/60">
              To swap a voice note, remove this one and record a new one.
            </p>
          </div>
        )}
        {(open.gif || gifUrl) && (
          <div className="mt-3">
            <GiphyPicker
              value={gifUrl}
              onChange={setGifUrl}
            />
            {gifUrl && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeSlot("gif")}
                className="mt-2 rounded-full border border-ink/15 px-4 py-1.5 text-xs font-medium text-ink disabled:opacity-60"
              >
                {removeMediaLabel("gif")}
              </button>
            )}
          </div>
        )}
        {(open.image || imageUrl) && (
          <div className="mt-3">
            <input
              type="file"
              accept="image/*"
              aria-label="Upload a photo"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f, "image");
              }}
              className="block w-full text-xs"
            />
            {imageUrl && (
              <>
                <img
                  src={imageUrl}
                  alt="Your upload"
                  className="mt-3 max-h-48 rounded-xl object-cover"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeSlot("image")}
                  className="mt-2 rounded-full border border-ink/15 px-4 py-1.5 text-xs font-medium text-ink disabled:opacity-60"
                >
                  {removeMediaLabel("image")}
                </button>
              </>
            )}
          </div>
        )}
        {(open.video || videoUrl) && (
          <div className="mt-3">
            <input
              type="file"
              accept="video/*"
              aria-label="Upload a short video"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f, "video");
              }}
              className="block w-full text-xs"
            />
            {videoUrl && (
              <>
                <video
                  src={videoUrl}
                  controls
                  playsInline
                  className="mt-3 max-h-48 w-full rounded-xl bg-black object-contain"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeSlot("video")}
                  className="mt-2 rounded-full border border-ink/15 px-4 py-1.5 text-xs font-medium text-ink disabled:opacity-60"
                >
                  {removeMediaLabel("video")}
                </button>
              </>
            )}
          </div>
        )}
        {uploading && <p className="mt-2 text-sm text-ink/70">Uploading...</p>}
      </div>


      {localErr && <p className="mt-3 text-xs text-destructive">{localErr}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy || uploading}
          onClick={async () => {
            if (!name.trim()) {
              setLocalErr("Add a name to sign it with.");
              return;
            }
            if (!message.trim() && !gifUrl && !imageUrl && !videoUrl && !audioUrl) {
              setLocalErr("Write something, record a voice note, or add media.");
              return;
            }
            await onSave({
              contributorName: name.trim(),
              message: message.trim(),
              mediaType: gifUrl
                ? "gif"
                : audioUrl
                  ? "audio"
                  : videoUrl
                    ? "video"
                    : imageUrl
                      ? "image"
                      : "none",
              gifUrl: gifUrl ?? null,
              mediaUrl: audioUrl ?? videoUrl ?? imageUrl ?? null,
              imageUrl: imageUrl ?? null,
              videoUrl: videoUrl ?? null,
              audioUrl: audioUrl ?? null,
            });
          }}
          className="inline-flex min-h-14 items-center justify-center rounded-full bg-velvet px-8 py-4 text-lg font-medium text-paper disabled:opacity-60"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-ink/15 px-5 py-2.5 text-sm font-medium text-ink"
        >
          Cancel
        </button>

      </div>
    </section>
  );
}

function EditCardPanel({
  initial,
  busy,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: {
    occasion: string;
    recipientName: string;
    recipientEmail: string;
    theme: string;
    revealDate: string;
  };
  busy: boolean;
  onSave: (values: {
    occasion: string;
    recipientName: string;
    recipientEmail: string;
    theme: string;
    revealDate: string;
    timezone: string;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  onCancel: () => void;
}) {
  const [occasion, setOccasion] = useState(initial.occasion);
  const [recipientName, setRecipientName] = useState(initial.recipientName);
  const [recipientEmail, setRecipientEmail] = useState(initial.recipientEmail);
  const [theme, setTheme] = useState(initial.theme);
  const [revealDate, setRevealDate] = useState(initial.revealDate);

  const occasionOptions = ECARD_OCCASIONS.includes(occasion)
    ? ECARD_OCCASIONS
    : [occasion, ...ECARD_OCCASIONS];

  return (
    <section className="mt-4 rounded-2xl border border-ink/10 bg-paper p-5">
      <h2 className="text-base font-medium text-ink">Edit this card</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="eOccasion" className="block text-xs font-medium text-ink">
            Occasion
          </label>
          <select
            id="eOccasion"
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink"
          >
            {occasionOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="eName" className="block text-xs font-medium text-ink">
            Recipient name
          </label>
          <input
            id="eName"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            maxLength={120}
            className="mt-1.5 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink"
          />
        </div>
        <div>
          <label htmlFor="eEmail" className="block text-xs font-medium text-ink">
            Recipient email
          </label>
          <input
            id="eEmail"
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            maxLength={320}
            placeholder="priya@example.com"
            className="mt-1.5 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink"
          />
        </div>
        <div>
          <label htmlFor="eReveal" className="block text-xs font-medium text-ink">
            Reveal date and time
          </label>
          <input
            id="eReveal"
            type="datetime-local"
            value={revealDate}
            onChange={(e) => setRevealDate(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink"
          />
        </div>
      </div>

      <div className="mt-4">
        <span className="block text-xs font-medium text-ink">Design</span>
        <div className="mt-2 max-h-80 space-y-4 overflow-y-auto pr-1">
          {groupedEcardThemes().map((g) => (
            <div key={g.group}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-ink/55">
                {g.group}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {g.themes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    aria-pressed={theme === t.id}
                    className={`min-h-[76px] overflow-hidden rounded-xl border ${
                      theme === t.id ? "border-velvet ring-2 ring-velvet/30" : "border-ink/10"
                    }`}
                    title={t.blurb}
                  >
                    <span
                      className="flex h-12 items-center justify-center text-lg"
                      style={{ background: t.bg }}
                      aria-hidden
                    >
                      {t.motif}
                    </span>
                    <span className="block px-1 py-1.5 text-xs font-medium text-ink">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSave({
              occasion,
              recipientName: recipientName.trim(),
              recipientEmail: recipientEmail.trim(),
              theme,
              revealDate: revealInputToUtcIso(revealDate, localTimeZone()),
              timezone: localTimeZone(),
            })
          }
          className="inline-flex min-h-11 items-center rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-60"
        >
          Save changes
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-ink/15 px-4 py-2 text-xs font-medium text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="rounded-full border border-destructive/30 px-4 py-2 text-xs font-medium text-destructive disabled:opacity-60"
        >
          Delete this card
        </button>
      </div>
    </section>
  );
}

function RevealPreviewPanel({
  ecardId,
  loadPreview,
}: {
  ecardId: string;
  loadPreview: () => Promise<{ reveal: import("@/lib/ecards.schemas").RevealPayload | null }>;
}) {
  const curate = useServerFn(curateEcardMontagePreview);
  const [montage, setMontage] = useState(false);
  const [curation, setCuration] = useState<MontageCuration | null>(null);
  const [curating, setCurating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["ecard-preview", loadPreview],
    queryFn: loadPreview,
  });
  const [index, setIndex] = useState(0);
  const reveal = data?.reveal ?? null;
  const theme = getEcardTheme(reveal?.theme);
  const items = reveal?.contributions ?? [];
  const current = items[index];

  if (isLoading) {
    return <div className="mt-4 h-40 animate-pulse rounded-2xl bg-secondary" />;
  }

  return (
    <section className="mt-4 rounded-2xl border border-ink/10 p-5" style={{ background: theme.bg }}>
      <p
        className="text-[11px] font-medium uppercase tracking-wider"
        style={{ color: theme.ink, opacity: 0.6 }}
      >
        Preview, exactly what they will see. Nothing is sent.
      </p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: theme.ink, opacity: 0.75 }}>
          There are no visible messages yet, so there is nothing to preview.
        </p>
      ) : montage && reveal ? (
        <div className="mt-4">
          {curating ? (
            <p className="py-12 text-center text-base" style={{ color: theme.ink, opacity: 0.75 }}>
              Setting the scene...
            </p>
          ) : (
            <EcardMontage reveal={reveal} curation={curation} onExit={() => setMontage(false)} />
          )}
        </div>
      ) : (
        <>
          <div
            className="mt-3 rounded-2xl p-6 shadow-sm ecard-slide"
            key={current?.id}
            style={{ background: theme.surface, color: theme.ink }}
          >
            <p className="text-xs font-medium uppercase tracking-wider" style={{ opacity: 0.55 }}>
              {current?.contributor_name}
            </p>
            {current?.message && (
              <p
                className="mt-2 whitespace-pre-wrap text-base leading-relaxed"
                style={{ fontFamily: theme.display }}
              >
                {current.message}
              </p>
            )}
            {current && (
              <ContributionMedia
                item={current}
                name={current.contributor_name}
                mediaClassName="max-h-56 w-full rounded-xl object-contain"
              />
            )}

          </div>
          <button
            type="button"
            onClick={async () => {
              setMontage(true);
              if (curation || curating) return;
              setCurating(true);
              try {
                const res = await curate({ data: { id: ecardId } });
                setCuration(res.curation ?? null);
              } catch {
                setCuration(null);
              } finally {
                setCurating(false);
              }
            }}
            className="mt-4 inline-flex min-h-12 items-center justify-center rounded-full px-6 text-base font-semibold"
            style={{ background: theme.accent, color: theme.accentInk }}
          >
            Play the montage
          </button>
          <div className="mt-3 flex items-center justify-between" style={{ color: theme.ink }}>
            <span className="text-xs" style={{ opacity: 0.65 }}>
              {index + 1} of {items.length}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                className="rounded-full border px-4 py-1.5 text-xs font-medium disabled:opacity-40"
                style={{ borderColor: `${theme.ink}33` }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
                disabled={index + 1 >= items.length}
                className="rounded-full px-4 py-1.5 text-xs font-medium disabled:opacity-40"
                style={{ background: theme.accent, color: theme.accentInk }}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
