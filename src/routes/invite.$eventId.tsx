import { InviteEntranceOverlay } from "@/components/invite-entrance";
import type { InviteAnimation } from "@/lib/invite-entrances";
import { toast } from "sonner";
import { captureAppError } from "@/lib/error-capture-client";
import { playlistEmbed, playlistLink } from "@/lib/playlist-embed";

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { KenroesWatermark } from "@/components/kenroes-watermark";
import { InviteFrame } from "@/components/invite-frame";
import { InviteDateBlock, InviteWhereBlock } from "@/components/invite-date-block";
import { withAlpha } from "@/lib/color-contrast";
import { ThemeArtLayer, resolveThemeArt } from "@/components/theme-art";
import { FocalImage } from "@/components/image-focal-control";


import { TipJarSection } from "@/components/tip-jar-section";
import { ViewToggle } from "@/components/view-toggle";
import { useEventRealtime } from "@/hooks/use-event-realtime";
import {
  computeOwed,
  kidsAllowed,
  petsAllowed,

  confirmedHeadcount,
  MAX_PARTY_COUNT,
  clampPartyCount,
  clampPets,
  maxPetsPerGuest,
  maxPartyHeads,
  partyHeadcount,
  partyHeadsFrom,
  fetchPublicEvent,
  formatEventDate,
  findGuestTable,
  guestOwedAmount,
  shirtPricingOn,
  shirtPriceForSize,
  shirtUnitPrice,
  maxExtraShirts,
  MAX_EXTRA_SHIRTS,

  rsvpCounts,
  setRsvp,
  updateGuest,
  useEvent,
  zonedWallClockToUtc,
  type Guest,
  type GuestCategory,
  type KEvent,
  type MediaItem,
  type PlusOne,
  type RsvpStatus,
} from "@/lib/events-store";
import { fetchPublicWellWishes, postWellWish, type WellWish } from "@/lib/well-wishes.functions";
import { InviteComments } from "@/components/invite-comments";
import { BringSheetGuest } from "@/components/bring-sheet-guest";
import { InvitePhotoWall } from "@/components/invite-photo-wall";
import { type CandidateLabel } from "@/lib/guest-lookup";
import { GuestCandidatePicker, GuestLookupFallback } from "@/components/guest-lookup-fallback";

import { EventTimeWithViewerHint } from "@/components/event-time";

import {
  eventInstant,
  timeWithZone,
  viewerTimeHint,
} from "@/lib/event-time";
import { AddEventToCalendarButton } from "@/components/add-to-calendar-button";
import { logAffiliateClick } from "@/lib/events-store";
import { rewriteAffiliate } from "@/lib/affiliate";
import { getMediaEmbedUrl } from "@/lib/media-embed";
import { useLanguage } from "@/lib/i18n";
import { capturePublicRsvpContact } from "@/lib/contacts.functions";
import { submitGuestRsvp, lookupGuestOnEvent } from "@/lib/events-sync.functions";
import { quickRsvp } from "@/lib/rsvp-quick.functions";
import { InviteOpenBeacon } from "@/components/invite-open-beacon";

import { recordShowcaseInteraction } from "@/lib/showcase.functions";
import { EXAMPLE_HOST_PATH } from "@/lib/example-host-view";
import { InvitePerformanceControl } from "@/components/invite-performance";


import { answerLabel, isQuickRsvpAnswer, type QuickRsvpAnswer } from "@/lib/invite-links";
import { SHIRT_SIZES, SHIRT_SIZE_LABELS, shirtSizeLabel, selectableShirtSizes } from "@/lib/tshirt-sizes";
import { GlobalErrorFallback } from "@/components/global-error-fallback";
import { greetingNameOrNull, shortGuestNameOr } from "@/lib/guest-name";

import QRCode from "qrcode";
import { formatStampDate, formatStampLongDate } from "@/lib/datetime";
import { EventSongCard } from "@/components/event-song";
import { InviteAudioMiniBar, InviteTrackPlayer } from "@/components/invite-audio-controls";
import { stopAudio, useSilenceOnEmbedFocus } from "@/lib/invite-audio";
import { isShowcaseEvent, SHOWCASE_READONLY_MESSAGE, SHOWCASE_SAMPLE_NOTE } from "@/lib/showcase";
import { countShowcase, ShowcaseOpenBeacon } from "@/components/showcase-beacon";



export const Route = createFileRoute("/invite/$eventId")({
  /**
   * `g` identifies the guest the link was sent to, so a personal invitation
   * never asks someone to search for their own name. `rsvp` carries a one-tap
   * answer from the emailed Yes / Maybe / No buttons.
   */
  validateSearch: (
    search: Record<string, unknown>,
  ): { g?: string; rsvp?: QuickRsvpAnswer; from?: string } => ({
    g: typeof search.g === "string" && search.g.length <= 60 ? search.g : undefined,
    rsvp: isQuickRsvpAnswer(search.rsvp) ? search.rsvp : undefined,
    from: typeof search.from === "string" && search.from.length <= 40 ? search.from : undefined,
  }),
  loader: async ({ params }) => {
    const ev = await fetchPublicEvent(params.eventId).catch(() => undefined);
    if (!ev) return { meta: null as null | { title: string; description: string; image?: string } };
    const title = ev.title || "You're Invited";
    const host = ev.hosts?.[0]?.name || "";
    const dateStr = ev.date ? formatEventDate(ev.date) : "";
    const locationStr = ev.venue || ev.address || "";
    const descParts = [host && `Hosted by ${host}`, dateStr, locationStr].filter(Boolean);
    const description = descParts.length
      ? `${descParts.join(" • ")}. RSVP and view all the details.`
      : (ev.message?.slice(0, 160) || "You're cordially invited. RSVP and view all the details.");
    // Only absolute http(s) images can be fetched by social crawlers. Hosts who
    // upload artwork can end up with a base64 data: URI here, which makes
    // Facebook/LinkedIn/X previews fail (and bloats the document head), so those
    // fall back to the brand image.
    // Strip any focal-point fragment so crawlers get a clean fetchable URL.
    // Prefer the event's own artwork, then its theme art, then a host logo, so
    // an invitation previews as itself wherever any picture exists.
    const rawImage = (ev.image || (ev as { themeArt?: string }).themeArt || ev.logo || "")
      .split("#f=")[0] ?? "";
    const image = /^https?:\/\//i.test(rawImage) ? rawImage : undefined;


    return { meta: { title, description, image } };
  },
  head: ({ params, loaderData }) => {
    const url = `https://thekenroecollective.com/invite/${params.eventId}`;
    const fallbackImage = "https://storage.googleapis.com/gpt-engineer-file-uploads/c3oDp46bbYQdmeEYaFb58Q1HarG2/social-images/social-1783546918142-the-kenroe-collective-logo_(2).webp";
    const meta = loaderData?.meta;
    const title = meta ? `You're invited to ${meta.title}` : "You're Invited — The Kenroe Collective";
    const description = meta?.description ?? "You are cordially invited to a special gathering. RSVP and view the event details here.";
    const image = meta?.image || fallbackImage;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:site_name", content: "The Kenroe Collective" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  errorComponent: GlobalErrorFallback,
  notFoundComponent: () => (
    <div className="grid min-h-[60vh] place-items-center px-6 py-16 text-center">
      <div className="max-w-md">
        <h1 className="font-serif text-3xl text-ink">We couldn't find this invitation</h1>
        <p className="mt-3 text-base text-muted-foreground">
          The link may be incomplete or out of date. Ask whoever sent it to share it again.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-full border border-ink/15 px-6 py-2.5 text-sm font-medium text-ink hover:bg-ink/5"
        >
          Go to the home page
        </a>
      </div>
    </div>
  ),
  component: InvitePage,
});


/**
 * The strip above the showcase invitation. Every visitor sees it, including
 * someone arriving from a business card, because the host's view is the most
 * persuasive page for a would-be host. Only visitors who came from their own
 * events list also get the way back there.
 */
function ShowcaseBackToEventsBar({ eventId, from }: { eventId: string; from?: string }) {
  const show = isShowcaseEvent(eventId);
  const fromEvents = from === "events";
  const firedRef = useRef(false);

  useEffect(() => {
    if (!show || !fromEvents || firedRef.current) return;
    firedRef.current = true;
    try {
      void recordShowcaseInteraction({ data: { kind: "example_invite" } });
    } catch {
      // Never let this block or break the invitation.
    }
  }, [show, fromEvents]);

  if (!show) return null;

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-ink px-4 py-2 text-center text-xs text-white print:hidden">
      <span>This is a finished example.</span>
      <Link
        to={EXAMPLE_HOST_PATH}
        className="font-medium underline underline-offset-2"
        onClick={() => {
          try {
            void recordShowcaseInteraction({ data: { kind: "example_host_link" } });
          } catch {
            // Counting must never get in the way of the click.
          }
        }}
      >
        See the host's view
      </Link>
      {fromEvents ? (
        <Link to="/events" className="font-medium underline underline-offset-2">
          Back to my events
        </Link>
      ) : null}
    </div>
  );
}

function InvitePage() {
  const { eventId } = Route.useParams();
  const search = Route.useSearch();
  const localEvent = useEvent(eventId);
  const [remoteEvent, setRemoteEvent] = useState<KEvent | null | undefined>(undefined);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (localEvent) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    fetchPublicEvent(eventId).then((ev) => {
      if (!cancelled) setRemoteEvent(ev ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, localEvent]);
  const handleRealtime = useCallback((next: KEvent | null) => {
    if (next === null) setRemoteEvent(null);
    else setRemoteEvent(next);
  }, []);
  useEventRealtime(eventId, handleRealtime);

  const event = localEvent ?? (remoteEvent || undefined);

  if (!event) {
    // Still attempting to fetch from cloud
    if (remoteEvent === undefined) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-paper px-6">
          <div className="text-center text-sm text-muted-foreground">Loading your invitation…</div>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-6">
        <div className="text-center">
          <h1 className="font-serif text-3xl">We couldn't find this invitation</h1>
          <p className="mx-auto mt-2 max-w-md text-base text-muted-foreground">
            The link may be incomplete, or the host may have taken it down. Ask whoever invited you
            to send it again.
          </p>
          <Link
            to="/"
            className="mt-6 inline-block rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white"
          >
            Go home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <ShowcaseBackToEventsBar eventId={eventId} from={search.from} />
      <InviteWatermark eventId={eventId} />
      <InviteEntrance event={event} />
      <Invitation event={event} eventId={eventId} />
      <OwnerOnlyViewToggle eventId={eventId} />
    </>
  );
}

/**
 * Only render the admin/guest/owner switcher for the event owner or an admin.
 * Recipients of an invitation must never see internal switchers.
 */
function OwnerOnlyViewToggle({ eventId }: { eventId: string }) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData.session?.user?.id;
        if (!uid) return;
        // Owner check
        const { data: ownerRow } = await supabase.rpc("get_event_owner_id", { _id: eventId });
        if (!cancelled && ownerRow && ownerRow === uid) { setAllowed(true); return; }
        // Admin check
        const { data: adminRow } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
        if (!cancelled && adminRow === true) setAllowed(true);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [eventId]);
  if (!allowed) return null;
  return <ViewToggle mode="guest" eventId={eventId} />;
}

function InviteWatermark({ eventId }: { eventId: string }) {
  const [actual, setActual] = useState(false);
  const [override, setOverride] = useState<"on" | "off" | null>(null);
  const [canPreview, setCanPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("@/lib/branding.functions").then(({ getEventBrandingState }) =>
      getEventBrandingState({ data: { eventId } } as any)
        .then((r: { watermark: boolean }) => { if (!cancelled) setActual(!!r?.watermark); })
        .catch(() => {}),
    );
    // Show preview switcher to signed-in users (host/owner). Guests won't see it.
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.auth.getSession();
        if (!cancelled) setCanPreview(!!data.session);
      } catch {}
    })();
    // URL override e.g. ?wm=on or ?wm=off
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("wm");
      if (p === "on" || p === "off") setOverride(p);
    }
    return () => { cancelled = true; };
  }, [eventId]);

  const show = override ? override === "on" : actual;

  return (
    <>
      <KenroesWatermark show={show} />
      {canPreview && (
        <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 print:hidden">
          <div className="flex items-center gap-1 rounded-full border border-ink/10 bg-paper/95 p-1 shadow-lg backdrop-blur-md">
            <span className="px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Watermark
            </span>
            <button
              type="button"
              onClick={() => setOverride("on")}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition ${show ? "bg-velvet text-white shadow-sm" : "text-ink/60 hover:text-ink"}`}
            >
              On
            </button>
            <button
              type="button"
              onClick={() => setOverride("off")}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition ${!show ? "bg-velvet text-white shadow-sm" : "text-ink/60 hover:text-ink"}`}
            >
              Off
            </button>
            <button
              type="button"
              onClick={() => setOverride(null)}
              className="whitespace-nowrap rounded-full px-2 py-1 text-[10px] text-muted-foreground hover:text-ink"
              title="Use the actual tier setting"
            >
              Reset
            </button>
          </div>
          <p className="mt-1 text-center text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            Preview only — guests see your real tier
          </p>
        </div>
      )}
    </>
  );
}

function InviteEntrance({ event }: { event: KEvent }) {
  // ?anim=xxx previews another entrance, ?preview=1 replays it every time.
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const override = params?.get("anim") as InviteAnimation | null;
  const forcePreview = params?.get("preview") === "1";
  const animation = (override || event.inviteAnimation || "envelope") as InviteAnimation;
  const artUrl = resolveThemeArt(event)?.url ?? null;

  return (
    <InviteEntranceOverlay
      eventId={event.id}
      title={event.title}
      accent={event.color}
      animation={animation}
      artUrl={artUrl}
      forcePreview={forcePreview}
      pace={event.entrancePace}
      
    />
  );
}

function InviteQrBlock({ eventId, hashtag }: { eventId: string; hashtag?: string }) {
  const [qr, setQr] = useState<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/invite/${eventId}`;
    QRCode.toDataURL(url, { width: 320, margin: 1 }).then(setQr).catch(() => {});
  }, [eventId]);
  if (!qr) return null;
  return (
    <div className="mt-10 flex flex-col items-center gap-2 print:mt-4">
      <img src={qr} alt="Scan to RSVP" className="h-32 w-32 rounded-md bg-white p-2 ring-1 ring-ink/10" />
      <p className="text-[10px] uppercase tracking-[0.3em] text-velvet">Scan to RSVP</p>
      {hashtag && (
        <p className="text-xs italic text-muted-foreground">
          {hashtag.startsWith("#") ? hashtag : `#${hashtag}`}
        </p>
      )}
    </div>
  );
}

function Invitation({ event, eventId }: { event: KEvent; eventId: string }) {
  
  const counts = rsvpCounts(event);
  /** Named plus-ones among attending parties — folded into counts.adults. */
  const namedPlusOnesAttending = (event.guests || []).reduce(
    (n, g) =>
      g.status === "yes" || g.status === "maybe"
        ? n + (Array.isArray(g.plusOnes) ? g.plusOnes.length : 0)
        : n,
    0,
  );
  const accent = event.color || "#5c1d1d";
  // The curated theme gallery was retired. Any legacy `event.theme` value is
  // simply ignored: the invitation renders off the card/border colors, so no
  // migration is needed and an old theme id can never produce an error state.


  const [email, setEmail] = useState("");
  const [matchedGuest, setMatchedGuest] = useState<Guest | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [candidateRows, setCandidateRows] = useState<CandidateLabel[]>([]);
  const [looking, setLooking] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [personalLinkDismissed, setPersonalLinkDismissed] = useState(false);
  // The answer the guest just tapped in the single RSVP block. The optional
  // details form below follows it, so there is only ever one place to answer.
  const [quickAnswer, setQuickAnswer] = useState<QuickRsvpAnswer | null>(null);

  const lookupFn = useServerFn(lookupGuestOnEvent);

  // A personal link (?g=) already says who this is. Skip the lookup entirely:
  // asking an elderly guest to search for their own name is what cost us
  // RSVPs. The name search stays for shared/forwarded links only.
  //
  // The public payload only carries the identified guest's own record in full,
  // so identifying (by link or by picking themselves out of the masked list)
  // triggers a refetch with their id attached.
  const search = Route.useSearch();
  const [identifiedId, setIdentifiedId] = useState<string | null>(search.g ?? null);
  const [identifiedGuest, setIdentifiedGuest] = useState<Guest | null>(null);

  useEffect(() => {
    if (!identifiedId) {
      setIdentifiedGuest(null);
      return;
    }
    // The host's own copy is already complete locally.
    const local = (event.guests || []).find((g) => g.id === identifiedId);
    if (local?.email || local?.phone) {
      setIdentifiedGuest(local);
      return;
    }
    let cancelled = false;
    fetchPublicEvent(eventId, identifiedId).then((ev) => {
      if (cancelled) return;
      const own = (ev?.guests || []).find((g) => g.id === identifiedId) ?? local ?? null;
      setIdentifiedGuest(own);
    });
    return () => {
      cancelled = true;
    };
  }, [identifiedId, eventId, event.guests]);

  const linkedGuest = search.g ? identifiedGuest : null;
  const identifiedRef = useRef(false);
  useEffect(() => {
    if (identifiedRef.current) return;
    if (!identifiedGuest) return;
    identifiedRef.current = true;
    setMatchedGuest(identifiedGuest);
  }, [identifiedGuest]);
  // Keep the band in step with realtime guest updates.
  const bandGuest = personalLinkDismissed ? matchedGuest : linkedGuest ?? matchedGuest;

  async function findGuest(e: React.FormEvent) {
    e.preventDefault();
    setLookupError("");
    setCandidateRows([]);
    if (!email.trim()) {
      setLookupError("Please enter your name, email, or phone number.");
      return;
    }
    setLooking(true);
    let result: Awaited<ReturnType<typeof lookupFn>>;
    try {
      result = await lookupFn({ data: { eventId, query: email } });
    } catch {
      setLooking(false);
      setLookupError("We couldn't check the guest list just now. Please try again.");
      return;
    }
    setLooking(false);
    switch (result.kind) {
      case "empty":
        setLookupError("Please enter your name, email, or phone number.");
        return;
      case "match":
        setShowFallback(false);
        setIdentifiedId(result.guestId ?? null);
        return;
      case "candidates":
        setCandidateRows(result.rows ?? []);
        return;
      case "too_many":
        setLookupError(
          "That matches several guests — please add your last name, or use your email or phone number.",
        );
        return;
      default:
        setLookupError(
          "We couldn't find you on the guest list. Check for a different spelling, or try your email or phone number.",
        );

        setShowFallback(true);
    }
  }



  return (
    <div className="min-h-screen bg-paper pb-40 sm:pb-24" data-frame={event.frame ?? "none"}>
      {/* Top bar */}
      <nav className="sticky top-0 z-30 border-b border-ink/5 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6 2xl:max-w-7xl">
          <span className="font-serif text-lg italic tracking-tight text-velvet">The Kenroe Collective</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            You're Invited
          </span>
        </div>
      </nav>

      {/* Every demo invitation is unmistakably fictional to an outside visitor. */}
      {event._isDemo && (
        <div className="border-b border-velvet/15 bg-velvet/[0.06]">
          <p className="mx-auto max-w-5xl px-6 py-2.5 text-center text-xs text-ink/70 2xl:max-w-7xl">
            {isShowcaseEvent(eventId) ? SHOWCASE_SAMPLE_NOTE : "This is a demo, not a real invitation."}
          </p>
        </div>
      )}

      {/* Personal link opened: record it once for the host's follow-up list.
          Never fires for shared links, host previews or link-preview bots. */}
      {search.g && linkedGuest ? <InviteOpenBeacon eventId={eventId} guestId={linkedGuest.id} /> : null}

      {/* The public sample keeps its own tally of opens, kept apart from every
          customer's numbers so it can never inflate a report. */}
      {isShowcaseEvent(eventId) ? <ShowcaseOpenBeacon /> : null}

      {/* The offer to have the invitation read aloud. Above the fold, never a
          gate: the page below is already readable without pressing anything. */}
      <InvitePerformanceControl
        eventId={eventId}
        hostName={event.hosts?.[0]?.name ?? null}
        accent={accent}
        onStart={isShowcaseEvent(eventId) ? () => void countShowcase("play") : undefined}
      />



      {/* Hero — full-bleed, layered, animated */}
      <header className="relative overflow-hidden">
        {/* Decoration: the host's own artwork if they uploaded one, otherwise a
            clean flat-color invitation drawn from the card and border colors. */}
        <ThemeArtLayer event={event} />
        {!resolveThemeArt(event) ? (
          <InviteFrame frame={event.frame} accent={accent} color={event.frameColor} />
        ) : null}

        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(1200px 600px at 50% -20%, ${accent}25, transparent 60%), radial-gradient(700px 500px at 90% 110%, ${accent}1f, transparent 60%)`,
          }}
        />
        <div className="pointer-events-none absolute -top-20 left-1/4 h-72 w-72 animate-pulse rounded-full bg-velvet/10 blur-3xl" />
        <div
          className="pointer-events-none absolute bottom-0 right-10 h-80 w-80 rounded-full blur-3xl"
          style={{ backgroundColor: accent + "20" }}
        />

        <div className="relative mx-auto max-w-3xl px-6 pb-20 pt-16 text-center sm:pt-24 2xl:max-w-5xl 2xl:pt-32">
          {/* Host's uploaded logo, as a crest above the invitation line. It was
              stored on the event and shown on the host dashboard, but the guest
              invite never rendered it. Sized in proportion to the hero (never a
              banner) and separated by a hairline rule. */}
          {event.logo ? (
            <div className="mb-8 flex flex-col items-center gap-4">
              {/* Most uploads are JPEG/PNG with a white ground, so the mark is
                  seated in a soft card rather than floating as a bare white
                  rectangle on the ivory wash. */}
              <span className="inline-flex max-w-[80%] items-center justify-center rounded-xl bg-white/90 px-4 py-3 shadow-sm ring-1 ring-ink/10 backdrop-blur">
                <img
                  src={event.logo}
                  alt={`${event.title} logo`}
                  className="h-12 w-auto max-w-full object-contain sm:h-14 2xl:h-16"
                />
              </span>
              <span className="h-px w-16 bg-ink/15 2xl:w-24" aria-hidden="true" />
            </div>
          ) : null}

          <span className="inline-flex items-center gap-2 rounded-full bg-paper/70 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.25em] text-velvet ring-1 ring-velvet/20 backdrop-blur">
            ✨ A personal invitation
          </span>

          {event.image ? (
            <FocalImage
              url={event.image}
              alt={event.title}
              className="mx-auto mt-8 h-56 w-56 rounded-full 2xl:h-80 2xl:w-80 shadow-2xl ring-8 ring-paper animate-[scale-in_0.5s_ease-out]"
            />

          ) : (
            <div
              className="mx-auto mt-8 flex h-40 w-40 items-center justify-center rounded-full text-6xl shadow-2xl ring-8 ring-paper"
              style={{ backgroundColor: accent + "20" }}
            >
              🎉
            </div>
          )}

          <h1
            className="mt-10 font-serif text-5xl font-medium leading-tight tracking-tight sm:text-6xl 2xl:text-7xl"
            style={{
              fontFamily: event.font ? `${event.font}, serif` : undefined,
              color: event.textColor,
            }}
          >
            {event.title}
          </h1>
          {/* The date is the hero's second voice, not a caption: weekday
              eyebrow, date in the display serif, time as a tracked line. */}
          <InviteDateBlock
            date={event.date}
            timezone={event.timezone}
            textColor={event.textColor}
            font={event.font}
            className="mt-6"
          />
          <InviteWhereBlock
            venue={event.venue}
            address={event.address}
            textColor={event.textColor}
            font={event.font}
            className="mt-5"
          />


          {counts.attendees > 0 && (
            <p className="mt-4 text-xs uppercase tracking-[0.22em] text-muted-foreground">
              {counts.attendees} attending · {counts.adults} adult{counts.adults === 1 ? "" : "s"}
              {/* rsvpCounts() folds named plus-ones into adults, while the host
                  step itemizes them. Say so here so the two surfaces don't look
                  like they disagree. */}
              {namedPlusOnesAttending > 0 ? ` (incl. ${namedPlusOnesAttending} plus-one${namedPlusOnesAttending === 1 ? "" : "s"})` : ""}
              {counts.children > 0 ? ` · ${counts.children} kid${counts.children === 1 ? "" : "s"}` : ""}
              {counts.pets > 0 ? ` · ${counts.pets} pet${counts.pets === 1 ? "" : "s"}` : ""}
            </p>
          )}



          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <a
              href="#rsvp"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("rsvp")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="rounded-full bg-velvet px-6 py-3 text-sm font-medium text-white shadow-lg shadow-velvet/20 transition hover:opacity-90"
            >
              RSVP now →
            </a>
            <a
              href={googleCalUrl(event)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-paper px-5 py-3 text-sm font-medium text-ink ring-1 ring-ink/10 hover:bg-secondary"
            >
              Save the date
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  const { exportInviteOnePagerPdf } = await import("@/lib/invite-pdf-export");
                  await exportInviteOnePagerPdf(event, { sizeId: "letter" });
                } catch (err) {
                  console.error("PDF export failed", err);
                  toast.error("Couldn't build the PDF. Please try again.");
                }
              }}
              aria-label="Download printable invitation as PDF"
              className="rounded-full bg-paper px-5 py-3 text-sm font-medium text-ink ring-1 ring-ink/10 hover:bg-secondary"
            >
              ⬇ Download PDF
            </button>
            <button
              type="button"
              onClick={() => { if (typeof window !== "undefined") window.print(); }}
              aria-label="Print this invitation"
              className="rounded-full bg-paper px-5 py-3 text-sm font-medium text-ink ring-1 ring-ink/10 hover:bg-secondary print:hidden"
            >
              🖨 Print
            </button>
          </div>


          <InviteQrBlock eventId={eventId} hashtag={event.hashtag} />
        </div>
      </header>

      {/* Welcome quote */}
      {event.welcomeQuote && (
        <section className="mx-auto max-w-2xl px-6 pt-10 text-center">
          <p className="font-serif text-xl italic text-velvet">“{event.welcomeQuote}”</p>
        </section>
      )}

      {/* Countdown. Shown unless the host explicitly turned it off: an event
          created before this toggle existed leaves the flag undefined, and
          treating that as "off" is what silently removed it from live invites. */}
      {event.countdownEnabled !== false && (
        <CountdownStrip target={event.date} timezone={event.timezone} />
      )}

      {/* Voice greeting */}
      {event.voiceMessage && (
        <section className="mx-auto max-w-2xl px-6 pt-10">
          <div className="rounded-2xl border border-velvet/20 bg-gradient-to-br from-velvet/10 to-transparent p-5 text-center shadow-sm">
            <div className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">
              🎙️ A voice note from your host
            </div>
            <VoiceNotePlayer src={event.voiceMessage} accent={accent} />
          </div>
        </section>
      )}

      {/* Host message */}
      {event.message && (
        <section className="mx-auto max-w-2xl px-6 py-14 text-center">
          <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">
            A note from the host
          </span>
          <p
            className="mt-4 font-serif text-2xl italic leading-relaxed text-ink/85"
            style={{ fontFamily: event.font ? `${event.font}, serif` : undefined }}
          >
            "{event.message}"
          </p>
        </section>
      )}

      {/* Custom invitation design */}
      {event.canvaUrl && (
        <section className="mx-auto max-w-2xl px-6 pb-10 text-center">
          <a
            href={event.canvaUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-5 py-2 text-sm font-medium text-ink/80 hover:border-velvet/40 hover:text-ink"
          >
            View invitation design ↗
          </a>
        </section>
      )}

      {/* Vibe gallery */}
      {(event.inviteMedia?.length ?? 0) > 0 && <InviteGallery items={event.inviteMedia!} />}

      {/* Hosts */}
      {(event.hosts?.length ?? 0) > 0 && (
        <section className="mx-auto max-w-4xl px-6 pb-10 2xl:max-w-6xl">
          <div className="text-center">
            <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">
              Hosted by
            </span>
          </div>
          {/* One or two hosts stay centered under the "Hosted by" label
              instead of hanging on the left edge of a 3-column grid. */}
          <div
            className={
              (event.hosts!.length ?? 0) <= 2
                ? "mt-6 flex flex-wrap justify-center gap-4"
                : "mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            }
          >
            {event.hosts!.map((h) => (
              <div key={h.id} className={`rounded-2xl border border-ink/5 bg-card/80 p-5 text-center shadow-sm backdrop-blur${(event.hosts!.length ?? 0) <= 2 ? " w-full max-w-sm" : ""}`}>

                {h.photo ? (
                  <FocalImage url={h.photo} alt={h.name} className="mx-auto h-20 w-20 rounded-full ring-2 ring-velvet/30" />
                ) : (
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-velvet/10 font-serif text-2xl text-velvet">
                    {h.name?.[0]?.toUpperCase() ?? "★"}
                  </div>
                )}
                <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">
                  {h.role}
                </div>
                <div className="mt-1 font-serif text-lg text-ink">{h.name}</div>
                {h.relationship && (
                  <div className="text-xs italic text-ink/60">{h.relationship}</div>
                )}
                {h.bio && <p className="mt-2 text-sm text-ink/75">{h.bio}</p>}
                {h.showContact && (h.email || h.phone) && (
                  <div className="mt-3 space-y-1 border-t border-ink/5 pt-3 text-sm text-ink/70">
                    {h.email && (
                      <div>
                        <a href={`mailto:${h.email}`} className="inline-flex min-h-11 items-center text-velvet hover:underline">{h.email}</a>
                      </div>
                    )}
                    {h.phone && (
                      <div>
                        <a href={`tel:${h.phone}`} className="inline-flex min-h-11 items-center text-velvet hover:underline">{h.phone}</a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* The guest reads the invitation first, then reaches one personalized
          answer card. Personal links resolve directly; lookup is only the
          escape hatch for shared links or someone switching person. */}
      {bandGuest ? (
        <QuickAnswerBand
          event={event}
          eventId={eventId}
          guest={bandGuest}
          fromLink={search.rsvp}
          counts={{ yes: counts.yes, total: counts.total }}
          onAnswer={setQuickAnswer}
          onNotYou={() => {
            identifiedRef.current = true;
            setPersonalLinkDismissed(true);
            setMatchedGuest(null);
            setShowFallback(false);
            setQuickAnswer(null);
          }}
        />
      ) : (
        <section id="rsvp" className="mx-auto max-w-2xl scroll-mt-16 px-6 pb-14">
          <div className="overflow-hidden rounded-3xl bg-card shadow-xl ring-1 ring-ink/5">
            <div className="px-8 pb-6 pt-8 text-center">
              <h3 className="font-serif text-2xl">Find your invitation</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter your name to see your invitation and answer.
              </p>
            </div>
            <div className="p-8">
              {candidateRows.length > 0 ? (
                <GuestCandidatePicker
                  rows={candidateRows}
                  onPick={(id) => {
                    setCandidateRows([]);
                    setShowFallback(false);
                    setIdentifiedId(id);
                  }}
                  onCancel={() => {
                    setCandidateRows([]);
                    setShowFallback(true);
                  }}
                />
              ) : (
                <>
                  <form onSubmit={findGuest} className="space-y-3">

                    <input
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="First name, last name, email, or phone"
                      className="w-full rounded-lg border border-ink/10 bg-secondary px-4 py-3 text-sm focus:border-velvet focus:outline-none"
                    />
                    {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}
                    <button
                      type="submit"
                      className="w-full rounded-full bg-velvet px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
                    >
                      Find my invitation
                    </button>
                    {!showFallback && (
                      <p className="text-center text-sm text-muted-foreground">
                        Shared invite?{" "}
                        <button
                          type="button"
                          onClick={() => setShowFallback(true)}
                          className="inline-flex min-h-11 items-center underline underline-offset-4"
                        >
                          Can&apos;t find your name?
                        </button>
                      </p>
                    )}
                  </form>
                  {showFallback && (
                    <GuestLookupFallback
                      eventId={eventId}
                      hosts={event.hosts}
                      openGuestList={event.openGuestList}
                      pricing={{
                        paymentEnabled: (event as any).paymentEnabled,
                        paymentAmount: (event as any).paymentAmount,
                        paymentAmountChild: (event as any).paymentAmountChild,
                      }}
                      typedName={email}
                      onSelfAdded={(g) => {
                        setShowFallback(false);
                        setMatchedGuest({
                          id: g.id,
                          name: g.name,
                          email: g.email || "",
                          phone: g.phone || "",
                          status: "pending",
                        } as any);
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      )}



      {/* Details grid */}
      <section className="mx-auto max-w-3xl px-6 pb-14 2xl:max-w-5xl">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailCard
            icon="📅"
            title="When"
            body={
              <>
                <EventTimeWithViewerHint
                  date={event.date}
                  timezone={event.timezone}
                  primaryClassName="text-base font-medium leading-snug"
                  hintClassName="mt-1 text-sm text-muted-foreground"
                />
                {/* Anchored to the venue's time zone, so the calendar keeps the
                    venue's local clock time even if the guest travels. */}
                <AddEventToCalendarButton
                  className="mt-3"
                  eventId={event.id}
                  title={event.title}
                  date={event.date}
                  timezone={event.timezone}
                  venue={event.venue}
                  address={event.address}
                  description={event.message || event.description}
                  inviteHref={`/invite/${event.id}`}
                />
              </>
            }
          />

          <LocationCard event={event} />
          {event.transit && <DetailCard icon="🚇" title="Getting there" body={event.transit} />}
          {event.dressCode && <DetailCard icon="👗" title="Dress code" body={event.dressCode} />}
          {event.hashtag && <DetailCard icon="#️⃣" title="Hashtag" body={event.hashtag} />}
          {event.accommodations && <DetailCard icon="🏨" title="Stay" body={event.accommodations} />}
          {event.livestreamUrl && (
            <DetailCard
              icon="📺"
              title="Livestream"
              body={
                <a
                  href={/^https?:\/\//i.test(event.livestreamUrl) ? event.livestreamUrl : `https://${event.livestreamUrl.replace(/^\/+/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center text-base text-velvet underline underline-offset-4"
                >
                  Watch online →
                </a>
              }
            />
          )}
          {event.songUrl && (
            <EventSongCard
              song={{
                url: event.songUrl,
                title: event.songTitle,
                artist: event.songArtist,
                allowDownload: event.songAllowDownload,
              }}
              accent={accent}
            />
          )}
          {event.playlistUrl && <PlaylistCard url={event.playlistUrl} />}

        </div>
      </section>

      {/* Schedule */}
      {event.schedule && (
        <section className="mx-auto max-w-2xl px-6 pb-14">
          <h3 className="mb-4 text-center font-serif text-2xl">Schedule</h3>
          <div className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink/80">
              {event.schedule}
            </pre>
          </div>
        </section>
      )}

      {/* Optional follow-ups appear only after an answer is saved. They never
          repeat the RSVP status or ask the guest to navigate elsewhere. */}
      {matchedGuest && (quickAnswer || matchedGuest.status !== "pending") ? (
        <section id="rsvp-details" className="mx-auto max-w-2xl scroll-mt-16 px-6 pb-14">
          <div className="overflow-hidden rounded-3xl bg-card shadow-xl ring-1 ring-ink/5">
            <div
              className="px-8 pb-6 pt-8 text-center"
              style={{ background: `linear-gradient(180deg, ${accent}12, transparent)` }}
            >
              <h3 className="font-serif text-2xl">Optional details</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Add any plus-ones, dietary needs, or shirt sizes that apply.
              </p>
            </div>
            <div className="p-8">
              <GuestRsvpForm
                event={event}
                eventId={eventId}
                guest={matchedGuest}
                answeredStatus={quickAnswer}
              />
            </div>
          </div>
        </section>
      ) : null}

      {/* Schedule — read-only run-of-show for guests. Time and title only, no
          owners or admin controls, and collapsed by default so it never
          competes with the RSVP action above it. */}
      {(event.timelineBlocks ?? []).length > 0 ? (
        <section className="mx-auto max-w-2xl px-6 pb-10">
          <details className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-base font-medium">
              <span>Schedule for the day</span>
              <span className="text-sm text-muted-foreground">Tap to see times</span>
            </summary>
            <ol className="mt-4 space-y-3 border-t border-ink/5 pt-4">
              {[...(event.timelineBlocks ?? [])]
                .sort((a, b) => a.time.localeCompare(b.time))
                .map((b) => (
                  <li key={b.id} className="flex items-baseline gap-4 text-base">
                    <span className="w-24 shrink-0 font-medium tabular-nums" style={{ color: accent }}>
                      {formatClock(b.time)}
                    </span>
                    <span className="text-ink/85">{b.title}</span>
                  </li>
                ))}
            </ol>
          </details>
        </section>
      ) : null}

      {/* Gift fund */}
      {event.giftFund?.enabled && (
        <section className="mx-auto max-w-2xl px-6 pb-10">
          <div className="rounded-2xl bg-card p-6 ring-1 ring-ink/5 text-center">
            <p className="text-[10px] uppercase tracking-widest text-velvet">Contribute</p>
            <h3 className="mt-1 font-serif text-2xl">{event.giftFund.label}</h3>
            {event.giftFund.description && (
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {event.giftFund.description}
              </p>
            )}
            <Link
              to="/gift/$eventId"
              params={{ eventId }}
              search={{ session_id: undefined }}
              className="mt-4 inline-block rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              Send a gift →
            </Link>
          </div>
        </section>
      )}

      {/* Tip jar */}
      <TipJarSection event={event} />

      {/* Registry */}
      {event.registry && event.registry.length > 0 && (
        <section className="mx-auto max-w-2xl px-6 pb-14">
          <h3 className="mb-4 text-center font-serif text-2xl">Gift Registry</h3>
          <div className="grid gap-3">
            {event.registry.map((r) => {
              const finalUrl = rewriteAffiliate(r.url);
              return (
                <a
                  key={r.id}
                  href={finalUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => logAffiliateClick(eventId, { store: r.store, url: finalUrl, registryId: r.id })}
                  className="group flex items-center justify-between rounded-2xl bg-card p-5 ring-1 ring-ink/5 transition hover:shadow-md"
                >
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {r.store}
                    </p>
                    <p className="mt-1 font-medium">{r.label || r.store}</p>
                    {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
                  </div>
                  <span className="text-sm text-velvet transition group-hover:translate-x-0.5">
                    View →
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* What to bring (potluck sign-up sheet — self-hides when the host has it off) */}
      <section className="mx-auto max-w-2xl px-6 pb-14">
        <BringSheetGuest eventId={eventId} defaultName={matchedGuest?.name} compact />
      </section>

      {/* Photo Wall (self-hides unless the event has it) */}
      <InvitePhotoWall eventId={eventId} />

      {/* Reviews */}
      <WellWishesSection eventId={eventId} guest={matchedGuest} />

      {/* Comments — guests choose private (default) or public per comment */}
      <InviteComments
        eventId={eventId}
        guest={matchedGuest ? { id: matchedGuest.id, name: matchedGuest.name } : null}
        publicCommentsEnabled={!!event.publicCommentsEnabled}
      />

      {/* Save the date */}
      <section className="mx-auto max-w-2xl px-6 pb-14">
        <h3 className="mb-4 text-center font-serif text-2xl">Save the Date</h3>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href={googleCalUrl(event)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 py-3 text-base font-medium text-white hover:bg-velvet"
          >
            Google Calendar
          </a>
          <a
            href={outlookCalUrl(event)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-full bg-secondary px-5 py-3 text-base font-medium text-ink ring-1 ring-ink/10 hover:bg-secondary/80"
          >
            Outlook
          </a>
          <button
            onClick={() => downloadIcs(event)}
            className="inline-flex min-h-11 items-center rounded-full bg-secondary px-5 py-3 text-base font-medium text-ink ring-1 ring-ink/10 hover:bg-secondary/80"
          >
            Apple / iCal
          </button>
        </div>
      </section>

      {/* QR */}
      <section className="mx-auto max-w-2xl px-6 pb-14 text-center">
        <p className="text-xs text-muted-foreground">Share this invitation</p>
        <img
          alt="QR code"
          src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
            typeof window !== "undefined" ? window.location.href : "",
          )}`}
          className="mx-auto mt-3 h-28 w-28 rounded-lg border border-ink/10 bg-white p-1"
        />
      </section>

      {/* Sign-up CTA */}
      <section className="mx-auto max-w-3xl px-6 pb-16 2xl:max-w-5xl">
        <div className="relative overflow-hidden rounded-3xl bg-ink p-10 text-center text-paper shadow-2xl">
          <div
            className="pointer-events-none absolute -top-24 right-0 h-64 w-64 rounded-full blur-3xl"
            style={{ backgroundColor: accent + "60" }}
          />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-velvet/40 blur-3xl" />
          <span className="relative text-[10px] font-medium uppercase tracking-[0.3em] text-paper/60">
            {isShowcaseEvent(eventId) ? "Everything you just saw" : "Love this invitation?"}
          </span>
          <h3 className="relative mt-3 font-serif text-3xl sm:text-4xl">
            {isShowcaseEvent(eventId) ? "Make one for your own day." : "Send your own beautiful invites."}
          </h3>
          <p className="relative mx-auto mt-3 max-w-md text-sm text-paper/70">
            {isShowcaseEvent(eventId)
              ? "The reading, the song, the photo wall, the seating and the RSVPs are all part of it. Plans start at $7."
              : "Build yours in minutes, with RSVPs, registries, reminders, and well wishes all in one place. Plans start at $7."}
          </p>
          <div className="relative mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/signup"
              search={{ plan: "host", from: eventId, invite: undefined, email: undefined }}
              onClick={isShowcaseEvent(eventId) ? () => void countShowcase("cta") : undefined}
              className="rounded-full bg-velvet px-6 py-3 text-sm font-medium text-white hover:opacity-90"
            >
              Create my account →
            </Link>
            <Link
              to="/pricing"
              className="rounded-full bg-paper/10 px-6 py-3 text-sm font-medium text-paper ring-1 ring-paper/20 hover:bg-paper/20"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-ink/5 py-8 text-center">
        <p className="text-xs text-muted-foreground">
          Made with{" "}
          <a
            href="https://thekenroecollective.com/?utm_source=rsvp&utm_medium=invite_footer&utm_campaign=powered_by"
            target="_blank"
            rel="noopener noreferrer"
            className="text-velvet underline underline-offset-4"
          >
            The Kenroe Collective
          </a>{" "}
          — create your free invite
        </p>
      </footer>

      {/* The control that follows the guest down the page. On a phone the panel
          at the top scrolls away in a second, so Stop has to live here too. */}
      <InviteAudioMiniBar accent={accent} />
    </div>
  );
}


/**
 * Playlist card. A pasted Apple Music or Spotify link now plays in place
 * instead of only offering a "Listen" link that a phone opened in a new tab,
 * or worse, silently did nothing. Streaming services only allow full playback
 * for signed-in listeners, so the preview note sets that expectation.
 */
function PlaylistCard({ url }: { url: string }) {
  const shell = useRef<HTMLDivElement | null>(null);
  useSilenceOnEmbedFocus(shell);
  const embed = playlistEmbed(url);
  const href = playlistLink(url);
  if (!embed) {
    return (
      <DetailCard
        icon="🎵"
        title="Playlist"
        body={
          href ? (
            <a href={href} target="_blank" rel="noreferrer" className="text-velvet underline underline-offset-4">
              Listen →
            </a>
          ) : null
        }
      />
    );
  }
  return (
    <div ref={shell} className="rounded-2xl bg-card p-5 ring-1 ring-ink/5 sm:col-span-2">
      <div className="flex items-center gap-2">
        <span aria-hidden>🎵</span>
        <h4 className="font-serif text-lg">Playlist</h4>
      </div>
      {/* The service owns its own player, so we cannot control or blend it.
          When a guest starts it, we go silent rather than talk over it. */}
      <iframe
        onPointerDownCapture={() => stopAudio()}
        title="Event playlist"
        src={embed.src}
        height={embed.height}
        loading="lazy"
        allow="autoplay *; encrypted-media *; clipboard-write; fullscreen *"
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
        className="mt-3 w-full rounded-xl border-0 bg-transparent"
      />
      <p className="mt-2 text-[11px] text-muted-foreground">
        {embed.note}{" "}
        {href && (
          <a href={href} target="_blank" rel="noreferrer" className="text-velvet underline underline-offset-4">
            Open the full playlist →
          </a>
        )}
      </p>
    </div>
  );
}

function DetailCard({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl bg-card p-5 ring-1 ring-ink/5 transition hover:shadow-sm">
      <span className="text-2xl">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <div className="mt-0.5 text-sm text-ink/80">{body}</div>
      </div>
    </div>
  );
}

function LocationCard({ event }: { event: KEvent }) {
  const full = [event.venue, event.address].filter(Boolean).join(", ");
  const q = encodeURIComponent(full || event.venue || "");
  const isApple =
    typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  const google = `https://www.google.com/maps/search/?api=1&query=${q}`;
  const googleDir = `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  const apple = `https://maps.apple.com/?q=${q}`;
  const appleDir = `https://maps.apple.com/?daddr=${q}`;
  const waze = `https://waze.com/ul?q=${q}&navigate=yes`;
  const embed = q ? `https://www.google.com/maps?q=${q}&output=embed` : null;
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-start gap-4 rounded-2xl bg-card p-5 ring-1 ring-ink/5 transition hover:shadow-sm sm:col-span-1">
      <span className="text-2xl">📍</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Where</p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-0.5 flex min-h-11 items-center text-left text-base font-medium text-velvet underline decoration-velvet/40 underline-offset-4 hover:decoration-velvet"
        >
          {full || "Tap for map & directions"}
        </button>
        {open && (
          <div className="mt-3 space-y-3">
            {embed && (
              <div className="overflow-hidden rounded-xl ring-1 ring-ink/10">
                <iframe
                  title="Map"
                  src={embed}
                  loading="lazy"
                  className="h-44 w-full"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <a
                href={isApple ? appleDir : googleDir}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-velvet px-3 py-2 text-center font-medium text-white hover:opacity-90"
              >
                🧭 Directions
              </a>
              <a
                href={google}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-3 py-2 text-center font-medium text-white hover:opacity-90"
              >
                Google Maps
              </a>
              <a
                href={apple}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-paper px-3 py-2 text-center font-medium text-ink ring-1 ring-ink/10 hover:bg-secondary"
              >
                Apple Maps
              </a>
              <a
                href={waze}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-paper px-3 py-2 text-center font-medium text-ink ring-1 ring-ink/10 hover:bg-secondary"
              >
                Waze
              </a>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Choose your favorite app — we'll open it with the venue ready to navigate.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The single most important thing on the page: the question, answered in one
 * tap. Shown only when we already know who the visitor is (personal link, or
 * after a successful name lookup), and rendered above the hero so it is visible
 * without scrolling on a 375px phone.
 *
 * The answer is recorded the moment it is tapped. Plus-ones, dietary needs and
 * shirt sizes are asked further down and are optional, so an abandoned form
 * never loses the RSVP. No account, password or verification is involved.
 */
function QuickAnswerBand({
  event,
  eventId,
  guest,
  fromLink,
  counts,
  onAnswer,
  onNotYou,
}: {
  event: KEvent;
  eventId: string;
  guest: Guest;
  fromLink?: QuickRsvpAnswer;
  counts: { yes: number; total: number };
  onAnswer: (a: QuickRsvpAnswer) => void;
  onNotYou: () => void;
}) {
  const navigate = useNavigate();
  const accent = event.color || "#5c1d1d";
  // Hosts type titles and suffixes into the name field. A guest greeted as
  // "Hi Ms.," assumes the invitation is not theirs, so a title is never used
  // as a name and a nameless row is greeted generically.
  const greetingName = greetingNameOrNull(guest.name);
  const stored = isQuickRsvpAnswer(guest.status) ? (guest.status as QuickRsvpAnswer) : null;
  const [answer, setAnswer] = useState<QuickRsvpAnswer | null>(stored);
  const [busy, setBusy] = useState<QuickRsvpAnswer | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [editing, setEditing] = useState(false);
  const autoRef = useRef(false);

  const deadlineDate = event.rsvpDeadline ? new Date(event.rsvpDeadline) : null;
  const deadlineValid = !!(deadlineDate && !isNaN(deadlineDate.getTime()));
  const deadlinePassed = !!(deadlineValid && deadlineDate!.getTime() < Date.now());
  const deadlineLabel = deadlineValid ? formatStampLongDate(deadlineDate!) : null;
  const daysLeft = deadlineValid
    ? Math.ceil((deadlineDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const whenLine = event.date ? formatEventDate(event.date, event.timezone).full : "";


  const record = useCallback(
    async (a: QuickRsvpAnswer, cameFromEmail = false) => {
      setBusy(a);
      try {
        const res = await quickRsvp({ data: { eventId, guestId: guest.id, answer: a } });
        if (!res?.ok) {
          // Guest-side failures are invisible to the host: nobody reports "the
          // button didn't work", they just stop. Log it to the monitor.
          captureAppError(new Error(`Quick RSVP rejected (answer=${a})`), {
            source: "guest_rsvp",
          });
          toast.error("We could not save that answer. Please check your connection and try again.");
          return;
        }
        setAnswer(a);
        onAnswer(a);
        setEditing(false);

        setConfirmation(
          res.confirmation ||
            (a === "yes"
              ? `You're confirmed.${whenLine ? ` We'll see you ${whenLine}.` : ""}`
              : "Thank you. Your answer has been saved."),
        );
      } catch (err) {
        captureAppError(err, { source: "guest_rsvp" });
        toast.error("We could not save that answer. Please check your connection and try again.");

      } finally {
        setBusy(null);
        if (cameFromEmail) {
          // Drop the one-tap answer from the address bar so a later refresh
          // cannot silently overwrite a changed answer.
          navigate({
            to: "/invite/$eventId",
            params: { eventId },
            search: (prev: Record<string, unknown>) =>
              ({ ...prev, rsvp: undefined }) as never,
            replace: true,
          });
        }
      }
    },
    [eventId, guest.id, whenLine, navigate, onAnswer],
  );

  useEffect(() => {
    if (autoRef.current) return;
    if (!fromLink || deadlinePassed) return;
    autoRef.current = true;
    void record(fromLink, true);
  }, [fromLink, deadlinePassed, record]);

  const answered = answer && !editing;

  return (
    <section
      id="rsvp"
      className="relative z-30 scroll-mt-16 px-5 py-6 sm:py-10"
      style={{ background: `linear-gradient(180deg, ${withAlpha(accent, 0.1)}, transparent)` }}
      aria-label="Your answer"
    >

      <div className="mx-auto max-w-md rounded-3xl bg-card p-6 shadow-xl ring-1 ring-ink/5 sm:p-8">
        {/* One hierarchy: who you are, the question, three buttons, quiet escape. */}
        <p className="text-center font-serif text-[26px] leading-tight sm:text-3xl">
          {greetingName ? `Hi ${greetingName},` : "Hi there,"}
        </p>
        {guest.name?.trim() && (
          <p className="mt-1 text-center text-sm text-muted-foreground">
            Responding as {guest.name.trim()}
          </p>
        )}
        {/* The event has to be identifiable in the same view as the buttons,
            so a guest never taps an answer without knowing what they answered. */}
        {(event.title || whenLine) && (
          <p className="mt-3 text-center text-sm font-medium text-ink">
            {event.title}
            {event.title && whenLine ? " · " : ""}
            {whenLine}
          </p>
        )}



        {answered ? (
          <div className="mt-5 text-center">
            <p className="text-4xl" aria-hidden="true">
              {answer === "no" ? "💛" : "✓"}
            </p>
            <p className="mt-3 text-lg font-medium leading-snug text-ink">
              {confirmation ||
                (answer === "yes"
                  ? `You're confirmed.${whenLine ? ` We'll see you ${whenLine}.` : ""}`
                  : answer === "maybe"
                    ? "You are marked as a maybe. You can change this at any time."
                    : "You told us you can't make it. Your answer has been saved.")}
            </p>
            <p className="mt-2 text-base text-muted-foreground">
              Nothing else is needed. We have emailed you a copy.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              {answer !== "no" && (
                <a
                  href="#rsvp-details"
                  className="flex min-h-12 w-full items-center justify-center rounded-full px-5 text-base font-medium text-white"
                  style={{ background: accent }}
                >
                  Add details (optional)
                </a>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex min-h-12 w-full items-center justify-center rounded-full bg-secondary px-5 text-base font-medium text-ink ring-1 ring-ink/10"
              >
                Change my answer
              </button>
            </div>
          </div>
        ) : deadlinePassed ? (
          <p className="mt-4 text-center text-base text-muted-foreground">
            Answers for this event are now closed. Please contact your host.
          </p>
        ) : (
          <>
            <p className="mt-2 text-center text-xl font-medium text-ink">Will you join us?</p>
            <div className="mt-6 flex flex-col gap-3">
              {(["yes", "maybe", "no"] as QuickRsvpAnswer[]).map((a) => {
                const label = answerLabel(a);

                const isPrimary = a === "yes";
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => void record(a)}
                    disabled={!!busy}
                    className={`flex min-h-14 w-full items-center justify-center rounded-full px-6 text-lg font-medium transition disabled:opacity-70 ${
                      isPrimary
                        ? "text-white shadow-sm"
                        : "bg-card text-ink ring-2 ring-ink/15 hover:bg-secondary"
                    }`}
                    style={isPrimary ? { background: accent } : undefined}
                  >
                    {busy === a ? "Saving…" : label}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              One tap saves your answer. You can change it later.
            </p>
            {answer && (
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Your answer right now is{" "}
                <strong>{answer === "yes" ? "yes" : answer === "maybe" ? "maybe" : "no"}</strong>.
              </p>
            )}
          </>
        )}

        {/* Social proof and deadline: motivating, so they live with the one
            RSVP block instead of a second widget further down. */}
        {(counts.yes > 0 || deadlineLabel) && (
          <div className="mt-6 border-t border-ink/5 pt-4 text-center text-sm text-muted-foreground">
            {counts.yes > 0 && (
              <p>
                {counts.yes} {counts.yes === 1 ? "person has" : "people have"} already said yes
                {counts.total > 0 ? ` · ${counts.total} invited` : ""}
              </p>
            )}
            {deadlineLabel && (
              <p className={counts.yes > 0 ? "mt-1" : ""}>
                {deadlinePassed
                  ? "Responses are now closed."
                  : daysLeft !== null && daysLeft <= 7
                    ? `RSVP by ${deadlineLabel} — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
                    : `RSVP by ${deadlineLabel}`}
              </p>
            )}
          </div>
        )}

        {/* The escape hatch: one wording, quiet, beneath everything else. */}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {greetingName ? `Not ${greetingName}? ` : "Not you? "}
          <button
            type="button"
            onClick={onNotYou}
            className="inline-flex min-h-9 items-center underline underline-offset-4"
          >
            Switch person
          </button>
        </p>
      </div>
    </section>
  );
}


/**
 * The OPTIONAL follow-ups: party, dietary needs, shirt sizes, payment. It never
 * asks "will you be there?" — that question is answered once, in one tap, in
 * QuickAnswerBand in the middle of the page. This form only follows that answer.
 */
function GuestRsvpForm({
  event,
  eventId,
  guest,
  answeredStatus,
}: {
  event: KEvent;
  eventId: string;
  guest: Guest;
  /** The answer just tapped above, so the details follow it without a refetch. */
  answeredStatus?: QuickRsvpAnswer | null;
}) {
  const [status, setStatus] = useState<RsvpStatus>(answeredStatus ?? guest.status);
  useEffect(() => {
    if (answeredStatus) setStatus(answeredStatus);
  }, [answeredStatus]);

  // The old "I'm coming as: Guest / Pet" switch is gone: it duplicated the
  // pets counter and zeroed out the people counts, which is what made a
  // pets-only RSVP look like it owed a full adult fare. The stored category
  // now just follows the counts.
  const category: GuestCategory = guest.category === "pet" ? "pet" : "adult";
  // Adults are DERIVED, not typed: the guest themselves plus every named
  // plus-one. `extraAdults` only exists for parties the host recorded larger
  // than one before anyone was named, so those heads are never lost.
  const [extraAdults, setExtraAdults] = useState(Math.max(0, (guest.adults ?? 1) - 1));
  const adults = 1 + extraAdults;
  const [children, setChildren] = useState(guest.children ?? 0);
  const [pets, setPets] = useState(guest.pets ?? 0);
  const kidsOn = kidsAllowed(event);
  const petsOn = petsAllowed(event);
  const petsCeiling = maxPetsPerGuest(event);

  const [dietary, setDietary] = useState(guest.dietary ?? "");
  const [accessibility, setAccessibility] = useState(guest.accessibilityNotes ?? "");
  const [plusOnes, setPlusOnes] = useState<PlusOne[]>(
    Array.isArray(guest.plusOnes) ? guest.plusOnes : [],
  );
  const [shirtSize, setShirtSize] = useState<string>(guest.shirtSize ?? "");
  const [extraShirts, setExtraShirts] = useState<{ size: string; qty: number }[]>(
    Array.isArray(guest.extraShirts) ? guest.extraShirts : [],
  );
  const [saved, setSaved] = useState(false);
  const { lang } = useLanguage();

  const shirtSizesOn = !!event.tshirtSizesEnabled;
  const shirtSizesLocked = !!event.tshirtSizesLocked;
  const shirtSizeEditable = shirtSizesOn && !shirtSizesLocked;
  // Shirt charges only exist when the host priced them AND payments are on.
  const shirtPriced = shirtPricingOn(event);
  const sizeChoices = selectableShirtSizes(shirtPriced);
  const extrasOn = shirtSizesOn && !!event.extraShirtsEnabled && shirtSizeEditable;
  const extrasCap = maxExtraShirts(event);
  const extrasUsed = extraShirts.reduce((s, l) => s + Math.max(0, l.qty || 0), 0);

  const plusOnesAllowed = Math.max(0, Number(event.plusOnesAllowed ?? 0));

  // The plus-ones allowance is a HEADCOUNT rule: one guest may represent
  // themselves plus their allowance, whether those extra heads are named
  // plus-ones or quietly typed into Adults / Kids. Without this, "1 plus-one
  // per guest" could be turned into a party of three on the Adults counter.
  // A party the HOST already recorded larger than the allowance is respected
  // (the ceiling never drags an existing number down), it just cannot grow.
  const allowanceHeads = maxPartyHeads(event);
  const initialHeads = useMemo(() => partyHeadcount(guest), [guest]);
  const headCeiling = Math.max(allowanceHeads, initialHeads);
  const namedPlusOnes = plusOnes.length;
  const namedFilled = plusOnes.filter((p) => p.name.trim().length > 0).length;
  /** What the guest sees as "adults": themselves, named guests, plus any unnamed heads. */
  const displayAdults = adults + namedFilled;
  const extraAdultsMax = clampPartyCount(headCeiling - 1 - children - namedPlusOnes);
  const childrenMax = clampPartyCount(headCeiling - adults - namedPlusOnes);
  const headsUsed = partyHeadsFrom(adults, children, namedPlusOnes);

  // Named plus-ones are billable adults (mirrors billableAdults() in the store
  // and the reconciliation report), so the fare follows the derived count.
  const attendanceOwed = useMemo(
    () => computeOwed(event, displayAdults, children, guest.payment?.amount),
    [event, displayAdults, children, guest.payment?.amount],
  );

  // Shirt lines priced off what's on the form right now, so the total moves as
  // the guest picks sizes. Once the host has billed this RSVP the frozen
  // snapshot wins, matching what the payment link was raised for.
  const ownShirts = useMemo(() => {
    if (!shirtPriced || status === "no") return [] as { label: string; amount: number }[];
    const rows: { label: string; amount: number }[] = [];
    if (shirtSize) rows.push({ label: `${shortGuestNameOr(guest.name, "Guest")} shirt`, amount: shirtPriceForSize(event, shirtSize) });
    plusOnes.forEach((p) => {
      if (p.shirtSize && p.name.trim()) {
        rows.push({ label: `${shortGuestNameOr(p.name, "Guest")} shirt`, amount: shirtPriceForSize(event, p.shirtSize) });
      }
    });
    extraShirts.forEach((l) => {
      const qty = Math.max(0, Math.floor(l.qty || 0));
      if (!l.size || qty <= 0) return;
      rows.push({
        label: `${qty} extra ${shirtSizeLabel(l.size)} shirt${qty === 1 ? "" : "s"}`,
        amount: qty * shirtPriceForSize(event, l.size),
      });
    });
    return rows;
  }, [shirtPriced, status, shirtSize, plusOnes, extraShirts, event, guest.name]);

  const liveShirtTotal = ownShirts.reduce((s, r) => s + r.amount, 0);
  const frozenShirtTotal = guest.payment?.shirtAmount;
  const shirtOwed = typeof frozenShirtTotal === "number" ? frozenShirtTotal : liveShirtTotal;
  const owed = attendanceOwed + shirtOwed;

  const paymentEnabled = !!event.paymentEnabled && owed > 0;
  const perAdult = guest.payment?.amount ?? event.paymentAmount ?? 0;
  const perChild = event.paymentAmountChild ?? perAdult;
  const cur = event.paymentCurrency || "USD";

  const deadlineDate = event.rsvpDeadline ? new Date(event.rsvpDeadline) : null;
  const deadlinePassed = !!(deadlineDate && !isNaN(deadlineDate.getTime()) && deadlineDate.getTime() < Date.now());
  const deadlineLabel = deadlineDate && !isNaN(deadlineDate.getTime())
    ? formatStampLongDate(deadlineDate)
    : null;

  // Capacity + waitlist gates. Capacity blocks new "yes" RSVPs on all tiers;
  // waitlist (Host+) routes overflow to the waitlist instead of blocking.
  const capacity = Number(event.capacity ?? 0);
  // Host override: the host has deliberately accepted going over the cap, so
  // guests are neither blocked nor waitlisted. The host-side warning stays.
  const capOverridden = !!event.allowOverCapacity;
  const waitlistOn = !!event.waitlistEnabled && capacity > 0 && !capOverridden;
  const capacityOn = capacity > 0 && !capOverridden;

  // Exclude this guest from the "others" total so re-editing an existing RSVP
  // never double-counts their own party (same rule the server applies).
  const othersConfirmed = useMemo(() => confirmedHeadcount(event, guest.id), [event, guest.id]);
  const wouldBeConfirmed = othersConfirmed + adults + children + plusOnes.length;
  const overCapacity = capacityOn && wouldBeConfirmed > capacity;
  const spotsRemaining = capacityOn ? Math.max(0, capacity - othersConfirmed) : null;

  function onSave() {
    if (deadlinePassed) {
      toast("RSVPs for this event are now closed. Contact the host if you'd still like to attend.");
      return;
    }
    let finalStatus: RsvpStatus = status;
    if (status === "yes" && overCapacity && guest.status !== "waitlisted") {
      if (waitlistOn) {
        finalStatus = "waitlisted";
        toast("This event is at capacity — you're on the waitlist. We'll email you if space opens up.");
      } else {
        toast("Sorry, this event is at capacity. Please contact the host.");
        return;
      }
    }



    // Categories the host switched off never leave the form, so a stale value
    // can't sneak back in after a toggle change.
    const submittedKids = kidsOn ? children : 0;
    // Drop blank/zero rows and re-clamp to the host ceiling before sending, so
    // what the guest sees on the total is exactly what gets stored.
    const cleanExtras = extraShirts
      .map((l) => ({ size: l.size, qty: Math.max(0, Math.floor(Number(l.qty) || 0)) }))
      .filter((l) => l.size && l.qty > 0)
      .reduce<{ size: string; qty: number }[]>((acc, l) => {
        const used = acc.reduce((s2, x) => s2 + x.qty, 0);
        const room = Math.max(0, extrasCap - used);
        if (room > 0) acc.push({ size: l.size, qty: Math.min(l.qty, room) });
        return acc;
      }, []);
    const submittedPets = petsOn ? clampPets(pets, event) : 0;
    setRsvp(eventId, guest.id, finalStatus);
    updateGuest(eventId, guest.id, {
      category,
      adults,
      children: submittedKids,
      pets: submittedPets,

      dietary,
      accessibilityNotes: accessibility.trim() || undefined,
      plusOnes: plusOnes.filter((p) => p.name.trim().length > 0),
      preferredLanguage: lang,
      ...(shirtSizeEditable ? { shirtSize: shirtSize || undefined } : {}),
      ...(extrasOn ? { extraShirts: cleanExtras } : {}),
    });
    // The calls above only update THIS device's local cache — they only reach
    // Supabase if this browser happens to be signed in as the owner (see
    // events-store.ts's flushPush). A guest's browser never is, so without
    // this call their RSVP would silently never leave their own device.
    //
    // The server re-runs the capacity check under a row lock, so its verdict
    // wins over the optimistic check above: two guests submitting at the same
    // moment can no longer both squeeze past the cap.
    void submitGuestRsvp({
      data: {
        eventId,
        guestId: guest.id,
        patch: {
          status: finalStatus,
          category,
          adults,
          children: submittedKids,
          pets: submittedPets,

          dietary,
          accessibilityNotes: accessibility.trim() || undefined,
          plusOnes: plusOnes.filter((p) => p.name.trim().length > 0) as never,
          preferredLanguage: lang,
          ...(shirtSizeEditable && shirtSize ? { shirtSize: shirtSize as never } : {}),
          ...(extrasOn ? { extraShirts: cleanExtras as never } : {}),
        },
      },
    })
      .then((res) => {
        if (!res) return;
        if (res.ok === false && res.reason === "over_allowance") {
          // The server enforces the plus-ones allowance as a headcount rule, so
          // it also catches a crafted request that skipped the form's limits.
          setExtraAdults(Math.max(0, (guest.adults ?? 1) - 1));
          setChildren(guest.children ?? 0);
          setPlusOnes(Array.isArray(guest.plusOnes) ? guest.plusOnes : []);
          setStatus(guest.status);
          setRsvp(eventId, guest.id, guest.status);
          setSaved(false);
          const maxParty = res.maxParty ?? headCeiling;
          toast(
            `This invitation covers up to ${maxParty} ${maxParty === 1 ? "person" : "people"}. Adjust your numbers or contact the host.`,
          );
          return;
        }
        if (res.ok === false && res.reason === "over_capacity") {
          setStatus(guest.status);
          setRsvp(eventId, guest.id, guest.status);
          setSaved(false);
          const left = res.remaining ?? 0;
          toast(
            left > 0
              ? `Only ${left} spot${left === 1 ? "" : "s"} left, so this party could not be confirmed. Adjust your numbers or contact the host.`
              : "Sorry, this event just reached capacity. Please contact the host.",
          );
          return;
        }
        if (res.outcome === "waitlisted" && finalStatus !== "waitlisted") {
          setStatus("waitlisted");
          setRsvp(eventId, guest.id, "waitlisted");
          toast("This event is at capacity — you're on the waitlist. We'll email you if space opens up.");
        }
      })
      .catch((err) => {
        console.warn("[rsvp] remote sync failed", err);
        // A guest who fills the whole form and never reaches the server is the
        // most expensive failure in the product; surface it in the monitor.
        captureAppError(err, { source: "guest_rsvp_form" });
      });

    // Fire-and-forget capture into event owner's CRM (Atelier-only, silent no-op otherwise)
    void capturePublicRsvpContact({
      data: {
        eventId,
        guest: {
          name: guest.name,
          email: guest.email ?? null,
          phone: guest.phone ?? null,
          rsvpStatus: finalStatus,
        },
      },
    }).catch(() => undefined);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }




  return (
    <div className="space-y-6">
      {(() => {
        const seatedAt = findGuestTable(event, guest.id);
        if (!seatedAt) return null;
        return (
          <div className="rounded-xl border border-velvet/20 bg-velvet/5 px-4 py-3 text-center">
            <div className="text-[10px] uppercase tracking-[0.25em] text-velvet/70">Your seat</div>
            <p className="mt-0.5 font-serif text-lg text-velvet">
              You're seated at <span className="italic">{seatedAt.label}</span>
            </p>
          </div>
        );
      })()}



      {(status === "yes" || status === "maybe") && (
        <div className="space-y-4">
          {/* Party size. Adults are derived from you plus the guests you name
              below, so the old "Adults" counter can no longer fight the named
              plus-ones list. Kids and pets stay simple counts. */}
          <div className="space-y-3 rounded-xl border border-ink/10 bg-secondary/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Your party
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {headsUsed} of {headCeiling}
              </span>
            </div>
            <p className="text-sm text-ink/80">
              <span className="font-medium">
                {displayAdults} adult{displayAdults === 1 ? "" : "s"}
              </span>{" "}
              (you
              {namedFilled > 0 ? ` plus ${namedFilled} named guest${namedFilled === 1 ? "" : "s"}` : ""}
              {extraAdults > 0 ? ` and ${extraAdults} unnamed` : ""})
              {kidsOn && children > 0 ? `, ${children} kid${children === 1 ? "" : "s"}` : ""}
              {petsOn && pets > 0 ? `, ${pets} pet${pets === 1 ? "" : "s"}` : ""}
            </p>
            <p className="text-[11px] text-muted-foreground">
              The adult count follows the people you name below, so there are never two numbers to
              keep in step.
            </p>

            {(kidsOn || petsOn) && (
              <div className={`grid gap-3 ${kidsOn && petsOn ? "grid-cols-2" : "grid-cols-1"}`}>
                {kidsOn && (
                  <label className="flex flex-col gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Kids
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={childrenMax}
                      value={children}
                      onChange={(e) =>
                        setChildren(Math.min(childrenMax, clampPartyCount(Number(e.target.value) || 0)))
                      }
                      className="min-h-[44px] w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm focus:border-velvet focus:outline-none"
                    />
                  </label>
                )}
                {petsOn && (
                  <label className="flex flex-col gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Pets
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={petsCeiling}
                      value={pets}
                      onChange={(e) => setPets(clampPets(Number(e.target.value) || 0, event))}
                      className="min-h-[44px] w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm focus:border-velvet focus:outline-none"
                    />
                  </label>
                )}
              </div>
            )}

            {extraAdults > 0 && (
              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Other adults (not named)
                </span>
                <input
                  type="number"
                  min={0}
                  max={extraAdultsMax}
                  value={extraAdults}
                  onChange={(e) =>
                    setExtraAdults(
                      Math.min(extraAdultsMax, clampPartyCount(Number(e.target.value) || 0)),
                    )
                  }
                  className="min-h-[44px] w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm focus:border-velvet focus:outline-none"
                />
                <span className="text-[11px] text-muted-foreground">
                  Your host recorded these. Name them below instead and their shirt size and dietary
                  notes travel with them.
                </span>
              </label>
            )}

            <p className="text-[11px] text-muted-foreground">
              {headCeiling === 1
                ? `This invitation is for you only, so please keep your party at one person.${petsOn ? " Pets are counted separately." : ""}`
                : `Your invitation covers up to ${headCeiling} ${headCeiling === 1 ? "person" : "people"} in total (you${plusOnesAllowed > 0 ? ` plus ${plusOnesAllowed} guest${plusOnesAllowed === 1 ? "" : "s"}` : ""}), counting adults${kidsOn ? ", kids" : ""} and any named guests below. You've used ${headsUsed} of ${headCeiling}.${petsOn ? " Pets are counted separately." : ""}`}
            </p>
            {petsOn && (
              <p className="text-[11px] text-muted-foreground">
                Up to {petsCeiling} {petsCeiling === 1 ? "pet" : "pets"} per guest. The pets count is
                for casual pets joining you. If you need a service or assistance animal, note it in
                the accessibility notes below and the host will take care of it.
              </p>
            )}
          </div>

          {(() => {
            // One shared headroom number for the capacity notice, the
            // "add another guest" button, and whether an empty plus-one
            // name field is still worth offering.
            const capacityHeadroom =
              capacityOn && spotsRemaining !== null
                ? Math.max(
                    0,
                    Math.min(spotsRemaining, headCeiling) - 1 - extraAdults - children - namedFilled,
                  )
                : Number.POSITIVE_INFINITY;
            const nameEntryBlocked = capacityHeadroom <= 0;

            const sizeSelect = (
              value: string,
              onPick: (v: string) => void,
              who: string,
            ) => (
              <label className="block">
                <span className="text-[11px] font-medium text-ink/80">
                  T-shirt size {shirtPriced ? "" : "(optional)"}
                </span>
                {shirtSizeEditable ? (
                  <select
                    value={value}
                    onChange={(e) => onPick(e.target.value)}
                    aria-label={`T-shirt size for ${who}`}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm focus:border-velvet focus:outline-none"
                  >
                    <option value="">{shirtPriced ? "No shirt" : "Prefer not to say"}</option>
                    {sizeChoices.map((sz) => (
                      <option key={sz} value={sz}>
                        {SHIRT_SIZE_LABELS[sz]}
                        {shirtPriced ? ` — ${cur} ${shirtPriceForSize(event, sz).toFixed(2)}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-1 text-sm text-ink/80">
                    {shirtSizeLabel(value) || "No size on file"}
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      Sizes are locked, the host has placed the order.
                    </span>
                  </p>
                )}
              </label>
            );

            return (
              <>
                {capacityOn && status === "yes" && (
                  overCapacity ? (
                    <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-800">
                      {waitlistOn
                        ? `This event is at capacity — accepting will place you on the waitlist. We'll email you if space opens up.`
                        : `This event is at capacity. Please contact the host if you'd still like to attend.`}
                    </div>
                  ) : spotsRemaining !== null && spotsRemaining > 0 && spotsRemaining <= 10 ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                      Only {spotsRemaining} spot{spotsRemaining === 1 ? "" : "s"} remaining,{" "}
                      {capacityHeadroom > 0
                        ? `you can bring up to ${capacityHeadroom} more guest${capacityHeadroom === 1 ? "" : "s"}.`
                        : "so your party is full at its current size."}
                    </div>
                  ) : null
                )}

                {/* Per-person cards: each person's name sits with their own
                    shirt size and dietary notes, instead of one list of names
                    and separate lists of sizes and diets further down. */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Who's coming
                    </span>
                    {plusOnesAllowed > 0 && status === "yes" && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {plusOnes.length}/{plusOnesAllowed} guests named
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 rounded-xl border border-ink/10 bg-secondary/30 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 font-serif text-base text-ink">{guest.name}</p>
                      <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">
                        That's you
                      </span>
                    </div>
                    {shirtSizesOn && sizeSelect(shirtSize, setShirtSize, shortGuestNameOr(guest.name, "you"))}
                    <label className="block">
                      <span className="text-[11px] font-medium text-ink/80">
                        Dietary restrictions or allergies
                      </span>
                      <textarea
                        rows={2}
                        value={dietary}
                        onChange={(e) => setDietary(e.target.value)}
                        aria-label={`Dietary notes for ${shortGuestNameOr(guest.name, "you")}`}
                        placeholder="e.g. Vegetarian, gluten-free, nut allergy..."
                        className="mt-1 w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm focus:border-velvet focus:outline-none"
                      />
                    </label>
                  </div>

                  {plusOnesAllowed > 0 && status === "yes" && (
                    <>
                      {plusOnes.map((p, idx) => {
                        const who = shortGuestNameOr(p.name, `Guest ${idx + 1}`);
                        const rowBlocked = nameEntryBlocked && p.name.trim().length === 0;
                        const named = p.name.trim().length > 0;
                        return (
                          <div
                            key={idx}
                            className="space-y-3 rounded-xl border border-ink/10 bg-secondary/30 p-3"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                value={p.name}
                                disabled={rowBlocked}
                                onChange={(e) => {
                                  const next = [...plusOnes];
                                  next[idx] = { ...next[idx], name: e.target.value };
                                  setPlusOnes(next);
                                }}
                                placeholder={rowBlocked ? "No spots remaining" : `e.g. Guest ${idx + 1} name`}
                                aria-label={`Name for guest ${idx + 1}`}
                                className={`min-h-[44px] min-w-0 flex-1 rounded-lg border border-ink/10 px-3 py-2 text-sm focus:border-velvet focus:outline-none ${
                                  rowBlocked ? "cursor-not-allowed bg-secondary/60 text-ink/40" : "bg-paper"
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => setPlusOnes(plusOnes.filter((_, i) => i !== idx))}
                                aria-label={`Remove ${who}`}
                                className="min-h-[44px] shrink-0 rounded-full px-3 py-1 text-sm text-muted-foreground hover:bg-ink/5"
                              >
                                Remove
                              </button>
                            </div>
                            {rowBlocked && (
                              <p className="text-[11px] text-amber-800">
                                There's no room left for another guest. Lower your kids count, or
                                remove this row.
                              </p>
                            )}
                            {named && (
                              <>
                                <div className="flex items-center gap-1 rounded-lg bg-paper p-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = [...plusOnes];
                                      next[idx] = { ...next[idx], isChild: false };
                                      setPlusOnes(next);
                                    }}
                                    aria-pressed={!p.isChild}
                                    className={`min-h-11 flex-1 rounded-md px-3 py-1 text-sm font-medium transition ${
                                      !p.isChild
                                        ? "bg-velvet text-paper"
                                        : "text-ink/60 hover:bg-ink/5"
                                    }`}
                                  >
                                    Adult
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = [...plusOnes];
                                      next[idx] = { ...next[idx], isChild: true };
                                      setPlusOnes(next);
                                    }}
                                    aria-pressed={!!p.isChild}
                                    className={`min-h-11 flex-1 rounded-md px-3 py-1 text-sm font-medium transition ${
                                      p.isChild
                                        ? "bg-velvet text-paper"
                                        : "text-ink/60 hover:bg-ink/5"
                                    }`}
                                  >
                                    Child
                                  </button>
                                </div>
                                {shirtSizesOn &&
                                  sizeSelect(
                                    p.shirtSize ?? "",
                                    (v) => {
                                      const next = [...plusOnes];
                                      next[idx] = { ...next[idx], shirtSize: v || undefined };
                                      setPlusOnes(next);
                                    },
                                    who,
                                  )}
                                <label className="block">
                                  <span className="text-[11px] font-medium text-ink/80">
                                    Dietary restrictions or allergies
                                  </span>
                                  <textarea
                                    rows={2}
                                    value={p.dietary ?? ""}
                                    onChange={(e) => {
                                      const next = [...plusOnes];
                                      next[idx] = { ...next[idx], dietary: e.target.value || undefined };
                                      setPlusOnes(next);
                                    }}
                                    aria-label={`Dietary notes for ${who}`}
                                    placeholder="e.g. Vegetarian, gluten-free, nut allergy..."
                                    className="mt-1 w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm focus:border-velvet focus:outline-none"
                                  />
                                </label>
                              </>
                            )}
                          </div>
                        );
                      })}

                      {kidsOn && (
                        <p className="text-[11px] text-muted-foreground">
                          Use the KIDS counter above for unnamed children, or name a guest below and
                          mark them as a child so they're billed at the child rate.
                        </p>
                      )}



                      {plusOnes.length < plusOnesAllowed && headsUsed < headCeiling && !nameEntryBlocked && (
                        <button
                          type="button"
                          onClick={() => setPlusOnes([...plusOnes, { name: "" }])}
                          className="min-h-[44px] w-full rounded-full border border-dashed border-ink/20 py-2 text-sm text-ink/70 hover:bg-ink/5"
                        >
                          + Add another guest
                        </button>
                      )}
                      {plusOnes.length < plusOnesAllowed && headsUsed >= headCeiling && (
                        <p className="text-[11px] text-muted-foreground">
                          Your party is already at {headCeiling}{" "}
                          {headCeiling === 1 ? "person" : "people"}. Lower the kids count above to
                          name another guest here.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </>
            );
          })()}

          {shirtSizesOn && (
            <div className="space-y-3 rounded-xl border border-ink/10 bg-secondary/30 p-3">
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  About the event shirts
                </span>
                <p className="mt-1 text-[11px] text-ink/70">
                  {shirtPriced ? (
                    <>
                      Your host is ordering event shirts at{" "}
                      {cur} {shirtUnitPrice(event, "adult").toFixed(2)} each
                      {shirtUnitPrice(event, "youth") !== shirtUnitPrice(event, "adult")
                        ? `, youth sizes ${cur} ${shirtUnitPrice(event, "youth").toFixed(2)}`
                        : ""}
                      . Pick a size on a person's card only if they want a shirt, it's added to your
                      total below.
                    </>
                  ) : (
                    <>
                      Your host is ordering event shirts. Sharing a size is optional, and everyone in
                      your party gets their own.
                    </>
                  )}
                </p>
              </div>

              {extrasOn && status === "yes" && (
                <div className="rounded-lg border border-ink/10 bg-paper/70 p-3">
                  <p className="text-[11px] font-medium text-ink/80">
                    Extra shirts {shirtPriced ? `(${cur} each, same price)` : ""}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Spare shirts on top of your party's own. Extras don't add anyone to the guest
                    list. {extrasCap - extrasUsed} of {extrasCap} still available.
                  </p>
                  <div className="mt-2 space-y-2">
                    {extraShirts.map((line, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-2">
                        <select
                          value={line.size}
                          aria-label={`Extra shirt size ${idx + 1}`}
                          onChange={(e) => {
                            const next = [...extraShirts];
                            next[idx] = { ...next[idx], size: e.target.value };
                            setExtraShirts(next);
                          }}
                          className="min-h-[44px] flex-1 rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm"
                        >
                          {sizeChoices.map((sz) => (
                            <option key={sz} value={sz}>{SHIRT_SIZE_LABELS[sz]}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          max={extrasCap}
                          value={line.qty}
                          aria-label={`Extra shirt quantity ${idx + 1}`}
                          onChange={(e) => {
                            const others = extraShirts.reduce(
                              (s, l, i) => (i === idx ? s : s + Math.max(0, l.qty || 0)),
                              0,
                            );
                            const want = Math.max(1, Math.floor(Number(e.target.value) || 1));
                            const next = [...extraShirts];
                            // Clamp against the host's ceiling here as well as on the
                            // server, so the total on screen is never a number the
                            // server will quietly reduce.
                            next[idx] = { ...next[idx], qty: Math.min(want, Math.max(1, extrasCap - others)) };
                            setExtraShirts(next);
                          }}
                          className="min-h-[44px] w-20 rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setExtraShirts(extraShirts.filter((_, i) => i !== idx))}
                          className="min-h-[44px] rounded-lg px-3 text-sm text-ink/60 hover:text-velvet"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  {extrasUsed < extrasCap && (
                    <button
                      type="button"
                      onClick={() =>
                        setExtraShirts([
                          ...extraShirts,
                          {
                            size: sizeChoices.includes("adult_m" as never)
                              ? "adult_m"
                              : (sizeChoices[0] ?? "adult_m"),
                            qty: 1,
                          },
                        ])
                      }
                      className="mt-2 min-h-[44px] rounded-full border border-velvet/30 px-4 text-sm font-medium text-velvet hover:bg-velvet/5"
                    >
                      + Add an extra shirt
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {!!event.paymentEnabled && owed > 0 && (
            <div className="rounded-xl bg-velvet/5 px-4 py-3 text-xs ring-1 ring-velvet/15">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-ink/70">
                  {displayAdults} adult{displayAdults === 1 ? "" : "s"} × {cur}{" "}
                  {perAdult.toFixed(2)}
                  {children > 0 && (
                    <>
                      {" + "}
                      {children} child{children === 1 ? "" : "ren"} × {cur}{" "}
                      {perChild.toFixed(2)}
                    </>
                  )}
                </span>
                <span className="shrink-0 text-ink/70">{cur} {attendanceOwed.toFixed(2)}</span>
              </div>

              {shirtOwed > 0 && (
                <div className="mt-2 space-y-1 border-t border-velvet/15 pt-2">
                  {typeof frozenShirtTotal === "number" ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink/70">Shirts (as billed by your host)</span>
                      <span className="text-ink/70">{cur} {shirtOwed.toFixed(2)}</span>
                    </div>
                  ) : (
                    ownShirts.map((row, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-ink/70">{row.label}</span>
                        <span className="shrink-0 text-ink/70">{cur} {row.amount.toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="mt-2 flex items-center justify-between gap-2 border-t border-velvet/20 pt-2">
                <span className="font-medium text-ink">Total</span>
                <span className="shrink-0 font-serif text-base text-ink">
                  {cur} {owed.toFixed(2)}
                </span>
              </div>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                Updates automatically as you change your headcount{shirtPriced ? " or shirts" : ""}
              </p>
            </div>
          )}

          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Accessibility needs for your party (optional)
            </span>
            <textarea
              rows={2}
              value={accessibility}
              onChange={(e) => setAccessibility(e.target.value)}
              placeholder="e.g. Wheelchair access, ASL interpreter, sensory-friendly seating..."
              className="w-full rounded-lg border border-ink/10 bg-secondary px-3 py-2 text-sm focus:border-velvet focus:outline-none"
            />
          </label>


          {overCapacity && status === "yes" && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              This event is at capacity. Saving will place you on the waitlist — we'll email you if space opens up.
            </div>
          )}
        </div>
      )}

      {guest.status === "waitlisted" && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-center text-sm text-amber-800">
          You're currently on the waitlist. We'll email you the moment a spot opens.
        </div>
      )}

      {paymentEnabled && (status === "yes" || status === "maybe") && (
        <PaymentBlock event={event} guest={guest} owed={owed} />
      )}

      <button
        onClick={onSave}
        className="w-full rounded-full bg-velvet py-3 text-sm font-medium text-white transition hover:opacity-90"
      >
        {saved ? "✓ Saved!" : "Save my details"}
      </button>
    </div>
  );
}

function PaymentBlock({ event, guest, owed }: { event: KEvent; guest: Guest; owed: number }) {
  const ccy = event.paymentCurrency || "USD";
  const amount = owed.toFixed(2);
  const note = encodeURIComponent(`${event.title} — ${guest.name}`);

  type Option = { label: string; href?: string; copy?: string; emoji: string };
  const options: Option[] = [];
  // No card option: money never flows through the platform here. The host's
  // own payment handles below are the real, working destinations.
  if (event.payPaypal) {
    options.push({
      label: "PayPal",
      href: `https://paypal.me/${event.payPaypal.replace(/^@/, "")}/${amount}`,
      emoji: "🅿️",
    });
  }
  if (event.payVenmo) {
    options.push({
      label: "Venmo",
      href: `https://venmo.com/${event.payVenmo.replace(/^@/, "")}?txn=pay&amount=${amount}&note=${note}`,
      emoji: "💸",
    });
  }
  if (event.payCashapp) {
    options.push({
      label: "CashApp",
      href: `https://cash.app/$${event.payCashapp.replace(/^\$/, "")}/${amount}`,
      emoji: "💵",
    });
  }
  if (event.payZelle) {
    options.push({ label: "Zelle", copy: event.payZelle, emoji: "🏦" });
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-gradient-to-br from-secondary/60 to-secondary/20 p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">Amount requested</p>
        <p className="font-serif text-2xl">
          {ccy} {amount}
        </p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {event.paymentPurpose || "Contribution for the event"}
      </p>

      {options.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          The host hasn't added a payment method yet. They'll send you a link.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {options.map((o) =>
            o.href ? (
              <a
                key={o.label}
                href={o.href}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-paper px-3 py-2.5 text-sm font-medium text-ink ring-1 ring-ink/10 transition hover:bg-ink hover:text-paper"
              >
                <span>{o.emoji}</span> {o.label}
              </a>
            ) : (
              <button
                key={o.label}
                onClick={() => {
                  navigator.clipboard?.writeText(o.copy || "");
                  toast(`Zelle handle copied: ${o.copy}`);
                }}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-paper px-3 py-2.5 text-sm font-medium text-ink ring-1 ring-ink/10 transition hover:bg-ink hover:text-paper"
              >
                <span>{o.emoji}</span> {o.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "18:30" -> "6:30 PM". Guests should never read a 24-hour clock on an
 * invitation. Anything unexpected is passed through untouched.
 */
function formatClock(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time || "");
  if (!m) return time;
  const h = Number(m[1]);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

function WellWishesSection({
  eventId,
  guest,
}: {
  eventId: string;
  guest: Guest | null;
}) {
  const [wishes, setWishes] = useState<WellWish[]>([]);
  const [name, setName] = useState(guest?.name ?? "");
  const [message, setMessage] = useState("");
  const [posted, setPosted] = useState(false);
  const [sending, setSending] = useState(false);
  // The public sample shows real-looking wishes but takes no new ones.
  const readOnly = isShowcaseEvent(eventId);

  const reload = useCallback(() => {
    fetchPublicWellWishes({ data: { eventId } })
      .then((rows) => setWishes(rows ?? []))
      .catch(() => {});
  }, [eventId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      const res = await postWellWish({
        data: { eventId, name: name.trim() || undefined, message: message.trim() },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setMessage("");
      setPosted(true);
      setTimeout(() => setPosted(false), 2500);
      reload();
    } catch {
      toast.error("Could not post that message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-6 pb-14 2xl:max-w-5xl">
      <div className="rounded-3xl bg-card p-8 ring-1 ring-ink/5">
        <div>
          <h3 className="font-serif text-2xl">Well wishes</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {readOnly ? SHOWCASE_READONLY_MESSAGE : "Leave a message for the guest of honor."}
          </p>
        </div>

        {!readOnly && (
        <form onSubmit={submit} className="mt-6 space-y-3 border-t border-ink/5 pt-6">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            className="w-full rounded-lg border border-ink/10 bg-secondary px-3 py-3 text-base focus:border-velvet focus:outline-none"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            required
            placeholder="Share a memory or a kind word..."
            className="w-full rounded-lg border border-ink/10 bg-secondary px-3 py-3 text-base focus:border-velvet focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending}
            className="min-h-11 rounded-full bg-velvet px-6 py-3 text-base font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {posted ? "✓ Thanks for sharing!" : sending ? "Posting…" : "Post well wish"}
          </button>
        </form>
        )}

        <div className="mt-8 space-y-4 border-t border-ink/5 pt-6">
          {wishes.length === 0 ? (
            <p className="text-base text-muted-foreground">Be the first to leave a message.</p>
          ) : (
            wishes.map((w) => (
              <div key={w.id} className="rounded-2xl bg-secondary/40 p-5">
                <p className="font-medium">{w.name || "A guest"}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {formatStampDate((w.createdAt))}
                </p>
                <p className="mt-3 text-base leading-relaxed text-ink/80">{w.message}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}


/* Calendar helpers */
function icsContent(event: KEvent) {
  const d = zonedWallClockToUtc(event.date, event.timezone);
  const end = new Date(d.getTime() + 2 * 3600 * 1000);
  const fmt = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) =>
    (s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kenroe//Events//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@kenroe`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(d)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(event.title)}`,
    `DESCRIPTION:${esc(event.message || event.description || "")}`,
    `LOCATION:${esc([event.venue, event.address].filter(Boolean).join(", "))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadIcs(event: KEvent) {
  const blob = new Blob([icsContent(event)], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${event.title.replace(/[^a-z0-9]+/gi, "-")}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function googleCalUrl(event: KEvent) {
  const d = zonedWallClockToUtc(event.date, event.timezone);
  const end = new Date(d.getTime() + 2 * 3600 * 1000);
  const fmt = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${fmt(d)}/${fmt(end)}`,
    details: event.message || event.description || "",
    location: [event.venue, event.address].filter(Boolean).join(", "),
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

function outlookCalUrl(event: KEvent) {
  const d = zonedWallClockToUtc(event.date, event.timezone);
  const end = new Date(d.getTime() + 2 * 3600 * 1000);
  const p = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: d.toISOString(),
    enddt: end.toISOString(),
    body: event.message || event.description || "",
    location: [event.venue, event.address].filter(Boolean).join(", "),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p}`;
}

/**
 * Countdown to the event. The target instant is resolved through the event's
 * VENUE time zone (event.date is stored as a naive wall clock), so a guest in
 * another zone sees the true time remaining instead of their browser's
 * reinterpretation of the same digits. A helper line names the venue time and,
 * when the guest is elsewhere, the same moment in their own time.
 */
function CountdownStrip({ target, timezone }: { target: string; timezone?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  // The remaining duration is absolute: one instant minus another. Every viewer,
  // in any zone, sees the same number. The *displayed* start time stays the
  // venue's wall clock with its zone label (product rule), and both come from
  // the one approved formatter module, never from local date math.
  const targetMs = eventInstant(target, timezone).getTime();
  if (!Number.isFinite(targetMs)) return null;
  const venueLine = `Starts ${timeWithZone(target, timezone)}`;

  // No end time is stored, so treat the four hours after the start as "in
  // progress" rather than showing a negative or zeroed clock.
  const IN_PROGRESS_MS = 4 * 60 * 60 * 1000;
  const remaining = targetMs - now;
  const phase =
    remaining > 0 ? "before" : remaining > -IN_PROGRESS_MS ? "during" : "after";

  let body: React.ReactNode;
  if (phase === "before") {
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const parts = [
      { label: "Days", v: days },
      { label: "Hours", v: hours },
      { label: "Minutes", v: minutes },
    ];
    body = (
      <div className="grid grid-cols-3 gap-3">
        {parts.map((p) => (
          <div key={p.label}>
            <div className="font-serif text-4xl tabular-nums sm:text-5xl">
              {String(p.v).padStart(2, "0")}
            </div>
            <div className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-white/75">
              {p.label}
            </div>
          </div>
        ))}
      </div>
    );
  } else {
    body = (
      <p className="font-serif text-3xl sm:text-4xl">
        {phase === "during" ? "Happening now" : "That's a wrap. Thank you for celebrating with us."}
      </p>
    );
  }

  const srText =
    phase === "before"
      ? `Time remaining until the event: ${Math.floor(remaining / 86400000)} days, ${Math.floor((remaining % 86400000) / 3600000)} hours, ${Math.floor((remaining % 3600000) / 60000)} minutes.`
      : phase === "during"
        ? "The event is happening now."
        : "The event has ended.";

  return (
    <section className="mx-auto max-w-2xl px-6 pt-8">
      <div className="rounded-2xl bg-ink/95 p-6 text-center text-white shadow-xl">
        <div aria-live="polite" aria-atomic="true">
          <span className="sr-only">{srText}</span>
          <div aria-hidden="true">{body}</div>
        </div>
        <p className="mt-4 text-sm tracking-wide text-white/80">{venueLine}</p>
      </div>
    </section>
  );
}



function InviteGallery({ items }: { items: MediaItem[] }) {
  const count = items.length;
  // Small collections should fill the container instead of huddling in the
  // top-left corner of a 4-up grid: scale the column count to what we have.
  const gridCols =
    count <= 1
      ? "grid-cols-1"
      : count === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : count === 3
          ? "grid-cols-2 sm:grid-cols-3"
          : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
  // A lone item should be sized to the artwork, not stretched across the whole
  // page: cap it at a readable width and center it.
  const soloWrap = count <= 1 ? "mx-auto w-full max-w-[30rem]" : "";
  return (
    <section className="mx-auto max-w-5xl px-6 pb-14 2xl:max-w-7xl">
      <div className="text-center">
        <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">
          The vibe
        </span>
        <h2 className="mt-2 font-serif text-2xl text-ink">A little taste of what's coming</h2>
      </div>
      <div className={`mt-6 grid gap-3 ${gridCols} ${soloWrap}`}>
        {items.map((m) => (
          <InviteGalleryTile key={m.id} item={m} />
        ))}
      </div>
    </section>
  );
}

function InviteGalleryTile({ item: m }: { item: MediaItem }) {
  const shell = useRef<HTMLElement | null>(null);
  useSilenceOnEmbedFocus(shell);
  // Let the tile take the image's own proportions (clamped) so nothing is
  // cropped and a lone frame doesn't become a giant slab.
  const [ratio, setRatio] = useState<number | null>(null);
  const embed = getMediaEmbedUrl(m.url);
  const isVideoFile = /\.(mp4|webm|mov)(\?|$)/i.test(m.url);
  const boxStyle = embed
    ? { aspectRatio: "16 / 9" }
    : { aspectRatio: String(ratio ?? 4 / 3) };
  return (
    <figure ref={shell} className="group relative overflow-hidden rounded-2xl ring-1 ring-ink/5 shadow-sm transition hover:shadow-xl">
      <div className="w-full overflow-hidden bg-secondary" style={boxStyle}>
        {embed ? (
          <iframe
            onPointerDownCapture={() => stopAudio()}
            src={embed}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={m.caption ?? "video"}
          />
        ) : isVideoFile ? (
          <video
            src={m.url}
            controls
            className="h-full w-full object-contain"
            playsInline
            onPlay={() => stopAudio()}
          />
        ) : (
          <img
            src={m.url}
            alt={m.caption ?? ""}
            className="h-full w-full object-contain"
            loading="lazy"
            onLoad={(e) => {
              const el = e.currentTarget;
              if (!el.naturalWidth || !el.naturalHeight) return;
              const r = el.naturalWidth / el.naturalHeight;
              setRatio(Math.min(1.9, Math.max(0.6, r)));
            }}
          />
        )}
      </div>
      {(m.caption || m.kind === "ai") && (
        <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-ink/70 to-transparent px-3 py-1.5 text-[11px] text-white">
          <span className="truncate">{m.caption}</span>
          {m.kind === "ai" && (
            <span className="rounded-full bg-velvet/80 px-2 py-0.5 text-[9px] uppercase tracking-widest">
              AI
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}


function VoiceNotePlayer({ src, accent }: { src: string; accent?: string | null }) {
  // Through the page's controller, like everything else, so the voice note can
  // never play underneath the music.
  return (
    <InviteTrackPlayer
      className="mt-3"
      accent={accent ?? null}
      track={{ id: `voice:${src}`, url: src, label: "A voice note from your host" }}
    />
  );
}

