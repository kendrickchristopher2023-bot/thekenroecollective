import { EntrancePreview } from "@/components/entrance-preview";
import { unlockEntranceAudio } from "@/lib/entrance-sound";
import { toUserMessage } from "@/lib/user-error";
import { isMissingSessionError } from "@/lib/expected-outcome";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useGuestNoteCount } from "@/hooks/use-guest-notes";
import { EMAIL_GIF_MAX_BYTES, isBrowserOnlyMediaUrl, isEmailSafeImageUrl } from "@/lib/email/image-url";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { findDuplicateThankYouCardIds } from "@/lib/thankyou-duplicates";
import { useServerFn } from "@tanstack/react-start";
import { regenerateInviteNarration } from "@/lib/invite-narration.functions";
import { InvitationReadingPreview } from "@/components/invitation-reading-panel";
import { assertEventAddonAccess } from "@/lib/addon-access.functions";
import { runPendingThankYousNow } from "@/lib/auto-thankyous.functions";
import { useEventRealtime } from "@/hooks/use-event-realtime";
import { GuestRequestsPanel } from "@/components/guest-requests-panel";
import { OverCapacityBanner } from "@/components/over-capacity-banner";
import { WaitlistPanel } from "@/components/waitlist-panel";

import { GuestListToolbar } from "@/components/guest-list-toolbar";
import {
  DEFAULT_GUEST_FILTERS,
  filterSortGuests,
  parseGuestFilters,
  serializeGuestFilters,
  type GuestFilterState,
} from "@/lib/guest-filters";
import { toast } from "sonner";
import { sendTransactionalEmail } from "@/lib/email/send";
import { INVITE_PAGE_SIZES } from "@/lib/invite-pdf-export";
import {
  SHIRT_SIZES,
  SHIRT_SIZE_LABELS,
  shirtSizeLabel,
  tallyShirtSizes,
} from "@/lib/tshirt-sizes";
import { Users, X } from "lucide-react";

import { SiteFooter, SiteNav } from "@/components/site-nav";
import { TabContentSkeleton } from "@/components/skeletons";
import { supabase } from "@/integrations/supabase/client";
import { ShareHub, EmailInvitationsCard } from "@/components/share-hub";
import { sendEventInvites } from "@/lib/events-invites.functions";
import { PhotoWallPanel } from "@/components/photo-wall-panel";
import { WellWishesPanel } from "@/components/well-wishes-panel";
import { EventCommentsPanel } from "@/components/event-comments-panel";
import { BringSheetPanel } from "@/components/bring-sheet-panel";
import { ViewToggle } from "@/components/view-toggle";
import { GuestImportPanel } from "@/components/guest-import";
import { ContactsPickerButton } from "@/components/contacts-picker";
import { GuestConsentCheckbox, CONSENT_DISABLED_TOOLTIP } from "@/components/guest-consent-checkbox";
import { logHostGuestConsent } from "@/lib/host-consent.functions";
import { upsertContactsFromGuests } from "@/lib/contacts.functions";
import { SeatingChartPanel } from "@/components/seating-chart";
import { EventSeriesPanel } from "@/components/event-series-panel";
import { TimelinePanel } from "@/components/timeline-panel";
import { CheckInPanel } from "@/components/checkin-panel";
import { PostEventWrapUp } from "@/components/post-event-wrapup";
import { GiftFundPanel } from "@/components/gift-fund-panel";
import { TipJarPanel } from "@/components/tip-jar-panel";
import { SmsRemindersPanel } from "@/components/sms-reminders-panel";
import { GuestAudiencePicker } from "@/components/guest-audience-picker";
import { GuestDeliveryChips, refreshPaymentDelivery } from "@/components/payment-delivery-status";
import { sendPaymentSend, previewPaymentSend, reportPaymentSend } from "@/lib/payment-notify";
import { useSmsOptOutSet, normalizePhone } from "@/hooks/use-sms-opt-outs";
import { EventAnnouncementsPanel } from "@/components/event-announcements-panel";
import { GiphyPicker } from "@/components/giphy-picker";
import { ThankYouPiecePicker, type AttachedPiece } from "@/components/thankyou-piece-picker";
import { mintThankYouLinks } from "@/lib/thankyou-print.functions";
import { isShowcaseEvent } from "@/lib/showcase";
import { ThemePhotoPicker } from "@/components/theme-photo-picker";

import { CalendarSyncPanel } from "@/components/calendar-sync-panel";
import { bringCsvRows, toCsv as bringToCsv } from "@/lib/bring-sheet";
import { BrandedDomainPanel } from "@/components/branded-domain-panel";
import { EventAddOnsPanel } from "@/components/event-addons-panel";
import { AiPackagesPanel } from "@/components/ai-packages-panel";
import { OneTimePassAttach } from "@/components/one-time-pass-attach";
import { MediaPickerButton } from "@/components/media-picker-button";
import { exportSummaryPdf, exportReviewsPdf } from "@/lib/report-export";
import { MasterGuestReportPanel } from "@/components/master-guest-report";
import { EmptyState } from "@/components/empty-state";
import { getMediaEmbedUrl, inferMediaKindFromUrl, normalizeExternalMediaUrl } from "@/lib/media-embed";
import { usePreviewTier } from "@/lib/preview-tier";
import { DEFAULT_FRAME_COLOR, EVENT_FRAMES, FRAME_COLORS, FRAMES_ENABLED } from "@/lib/event-frames";
import { ColorField } from "@/components/color-field";
import { DEFAULT_INVITE_BG } from "@/lib/color-contrast";
import { uploadEventMedia, uploadMediaFile } from "@/lib/media-upload-client";
import { SONG_ACCEPT, songFileError } from "@/components/event-song";
import { InviteSongPicker } from "@/components/invite-song-picker";
import { uploadFailedToast } from "@/lib/upload-retry-toast";

import { formatStampDate, formatTimestamp } from "@/lib/datetime";

/** The invitation's ivory paper wash — what invite text actually sits on. */
const INVITE_PAPER = DEFAULT_INVITE_BG;

/** Readable starting points for the invitation text color. */
const INVITE_TEXT_COLORS = ["#2a221b", "#15151a", "#5b1a3a", "#1f3d2b", "#1b3a5b", "#7a4a12"];
import { themeArtUrl } from "@/lib/theme-art-library";

import { InviteFrame } from "@/components/invite-frame";
import { ThemeArtLayer } from "@/components/theme-art";
import { FocalAdjuster, FocalImage } from "@/components/image-focal-control";

import { findDuplicateGuest, describeDuplicate } from "@/lib/guest-duplicates";
import {
  addGuest,
  addRegistry,
  deleteEvent,
  detectRegistryStore,
  fetchViewerEvent,
  formatEventDate,
  guestOwedAmount,
  kidsAllowed,
  petsAllowed,

  guestCollected,
  paymentHistory,
  refundedTotal,
  recordPayment,
  recordRefund,
  setPaymentRemindersOptIn,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  hasPayoutMethod,
  resolvePaymentLink,
  logEventReminder,
  paymentReport,
  removeGuest,
  restoreGuest,
  removeRegistry,
  markPaymentReminderSent,
  markPaymentGroupReminded,
  remindablePaymentGuests,
  rsvpCounts,
  sendPaymentLink,
  setGuestPaidAmount,
  setGuestPaymentAmount,
  setPaymentStatus,
  setRsvp,
  updateEvent,
  updateGuest,
  updateRegistry,
  upcomingReminders,
  setReminderTime,
  setReminderSms,

  saveEventsNow,
  refreshEventsFromCloud,
  useEvent,
  useEventsReady,

  REGISTRY_STORES,
  REMINDER_PRESETS,


  addHost,
  updateHost,
  removeHost,
  addMedia,
  removeMedia,
  updateMedia,
  AI_REGEN_LIMIT,
  setVoiceMessage,
  clearVoiceMessage,
  addThankYouCard,
  setThankYouDraft,
  removeThankYouCard,
  updateThankYouCard,
  markThankYouSent,
  rememberEventSnapshot,
  type Guest,
  type GuestCategory,
  type Host,
  type KEvent,
  type MediaItem,
  type PaymentStatus,
  type PaymentMethod,
  type RegistryLink,
  type RsvpStatus,
  type ThankYouCard,
  type InviteAnimation,
  INVITE_ANIMATIONS,
  ENTRANCE_PACES,
  entrancePhases,
  normalizePace,
  FREE_ANIMATIONS,
  recommendedEntrances,
  isJarringForOccasion,
  reviewStats,
  removeReview,
  confirmedHeadcount,
  committedHeadcount,
  partyHeadcount,
  billableAdults,
  billableChildren,
  partyMemberCount,
  MAX_PLUS_ONES,
  MAX_PARTY_COUNT,
  clampPartyCount,
  clampPets,
  maxPetsPerGuest,
  MAX_PETS_PER_GUEST,
  maxPartyHeads,
  MAX_EXTRA_SHIRTS,
  maxExtraShirts,
  shirtUnitPrice,
} from "@/lib/events-store";
import {
  reminderTimeFor,
  reminderWarning,
  reminderWhenLabel,
} from "@/lib/reminder-schedule";
import { DEFAULT_REMINDER_SMS, REMINDER_SMS_MAX, renderReminderSms } from "@/lib/reminder-sms";

import { EventTimeInline, EventTimeWithViewerHint } from "@/components/event-time";
import { AddEventToCalendarButton } from "@/components/add-to-calendar-button";
import { eventDateTimeLocalInput, eventTimeZone, timeZoneOptions } from "@/lib/event-time";

import { confirmDialog } from "@/lib/confirm-dialog";
import { undoableAction } from "@/lib/undo-toast";
import { getReminderLastSent, sendEventReminderNow } from "@/lib/event-reminders.functions";
import { queueSms } from "@/lib/sms.functions";
import { EventCollaboratorsCard } from "@/components/event-collaborators-card";
import { SaveNowButton } from "@/components/save-now-button";
import { CompletionMoment } from "@/components/completion-moment";
import { buildEventReadyMoment } from "@/lib/completion-moments";
import { useUiMode } from "@/lib/ui-mode";



export const Route = createFileRoute("/events/$eventId/")({
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    step?: string;
    q?: string;
    rsvp?: string;
    rsvp2?: string;
    has?: string;
    pay?: string;
    chk?: string;
    size?: string;
    sort?: string;
    preset?: string;
  } => ({
    step: typeof s.step === "string" ? s.step : undefined,
    ...serializeGuestFilters(parseGuestFilters(s)),
  }),
  head: ({ params }) => ({
    meta: [
      { title: "Event — The Kenroe Collective" },
      { name: "description", content: "Manage your event details, track RSVP counts, and organize guest information for your upcoming gathering." },
      { property: "og:title", content: "Event — The Kenroe Collective" },
      { property: "og:description", content: "Manage event details, track RSVPs, and organize your guest list in one editorial dashboard." },
      { property: "og:url", content: `https://thekenroecollective.com/events/${params.eventId}` },
    ],
    links: [{ rel: "canonical", href: `https://thekenroecollective.com/events/${params.eventId}` }],
  }),
  component: EventDetail,
});

type StepId =
  | "basics"
  | "hosts"
  | "design"
  | "extras"
  | "registry"
  | "payment"
  | "guests"
  | "dayof"
  | "reach"
  | "share"
  | "summary";

type Step = { id: StepId; title: string; blurb: string; atelierOnly?: boolean; hostAndAtelierOnly?: boolean; whisperPlus?: boolean; /** Shown in beginner ("simple") mode. Everything else waits behind "All tools". */ essential?: boolean };

type TierState = "loading" | "postcard" | "whisper" | "host" | "atelier" | "trial" | "owner";

let tierSnapshot: TierState = "loading";
let tierLoadKey: string | null = null;
let tierLoadPromise: Promise<void> | null = null;
let tierLoadedAt = 0;
const tierListeners = new Set<() => void>();
/** How long a resolved tier snapshot stays trusted before we refetch. */
const TIER_TTL_MS = 60_000;

function publishTier(next: TierState) {
  if (tierSnapshot === next) return;
  tierSnapshot = next;
  tierListeners.forEach((listener) => listener());
}

function subscribeTier(listener: () => void) {
  tierListeners.add(listener);
  return () => tierListeners.delete(listener);
}

/** Drop the cached tier so the next loadTier() call hits the server again. */
function invalidateTier() {
  tierLoadKey = null;
  tierLoadPromise = null;
  tierLoadedAt = 0;
}

function loadTier(previewTier: string | null, force = false) {
  const key = previewTier ?? "real";
  const fresh = tierLoadedAt > 0 && Date.now() - tierLoadedAt < TIER_TTL_MS;
  if (!force && tierLoadKey === key && (tierLoadPromise || fresh)) return;
  tierLoadKey = key;
  tierLoadPromise = import("@/lib/entitlements-client").then(async ({ getEntitlements }) => {
    try {
      const r = await getEntitlements();
      if (tierLoadKey !== key) return;
      tierLoadedAt = Date.now();
      if (r.isOwner && !r.previewing) publishTier("owner");
      else {
        const t = (r.tier ?? "").toLowerCase();
        if (r.activePriceId === "atelier_trial_30d") publishTier("trial");
        else if (t === "atelier") publishTier("atelier");
        else if (t === "host") publishTier("host");
        else if (t === "whisper") publishTier("whisper");
        else publishTier("postcard");
      }
    } catch {
      if (tierLoadKey === key) publishTier("postcard");
    }
  }).finally(() => {
    if (tierLoadKey === key) tierLoadPromise = null;
  });
}


const STEPS: Step[] = [
  { id: "basics", title: "The basics", blurb: "What, when, and where.", essential: true },
  { id: "hosts", title: "Hosts", blurb: "Who's throwing this? Guests will see this.", essential: true },
  { id: "design", title: "Make it pretty", blurb: "Photo, logo, colors, font, and your message.", essential: true },
  { id: "extras", title: "Nice touches", blurb: "Dress code, hashtag, music, livestream, hotel, schedule." },
  { id: "registry", title: "Registry & gifts", blurb: "Drop wishlist links and (Atelier) accept gift contributions.", whisperPlus: true },
  { id: "payment", title: "Collect money", blurb: "Only if you need to. Skip otherwise.", hostAndAtelierOnly: true },
  { id: "guests", title: "Guests & reminders", blurb: "Add the people. Track RSVPs. Schedule nudges.", essential: true },
  { id: "dayof", title: "Day-of toolkit", blurb: "Seating, run-of-show, and door check-in.", atelierOnly: true },
  { id: "reach", title: "Reach & calendar", blurb: "Branded URL plus one-tap calendar sync.", atelierOnly: true },
  { id: "share", title: "Share & thanks", blurb: "Send invites out, and follow up with thank-you cards.", whisperPlus: true, essential: true },
  { id: "summary", title: "Review & save", blurb: "Look it over. Tap save when you're happy.", essential: true },
];



function EventDetail() {
  const { eventId } = Route.useParams();
  const { step: stepParam } = Route.useSearch();
  const navigate = useNavigate();
  const { simple: simpleMode, setMode: setUiModeState } = useUiMode();

  const localEvent = useEvent(eventId);
  const eventsReady = useEventsReady();
  const [remoteEvent, setRemoteEvent] = useState<KEvent | null | undefined>(undefined);
  const event = localEvent ?? (remoteEvent || undefined);
  // The wizard step lives in the URL (?step=), so a browser refresh restores
  // the step the host was on instead of bouncing them back to step one.
  const stepIdx = (() => {
    const i = stepParam ? STEPS.findIndex((s) => s.id === stepParam) : -1;
    return i >= 0 ? i : 0;
  })();
  const setStepIdx = useCallback(
    (i: number) => {
      const target = STEPS[Math.max(0, Math.min(STEPS.length - 1, i))];
      if (!target) return;
      void navigate({
        to: "/events/$eventId",
        params: { eventId },
        search: (prev: Record<string, unknown>) => ({ ...prev, step: target.id }),
        replace: true,
      } as never);
    },
    [navigate, eventId],
  );
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const tier = useTier();
  const guestNotes = useGuestNoteCount(eventId);

  // Fetch from cloud only if local cache doesn't have it after hydration.
  // Avoid the 6s timeout — it caused the page to flip to "Event not found"
  // while the store was still hydrating, which the user saw as a reload loop.
  useEffect(() => {
    if (localEvent) {
      setRemoteEvent(localEvent);
      return;
    }
    if (!eventsReady) return; // wait for cache hydration before deciding to fetch
    let cancelled = false;
    fetchViewerEvent(eventId)
      .then((ev) => {
        if (cancelled) return;
        if (ev) rememberEventSnapshot(ev);
        setRemoteEvent(ev ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        // A signed-out visitor, or one whose sign-in has run out, was being
        // told the event did not exist. Send them to sign in and bring them
        // straight back here afterwards.
        const message = err instanceof Error ? err.message : String(err ?? "");
        if (isMissingSessionError(message)) {
          void navigate({
            to: "/auth",
            search: { redirect: `/events/${eventId}` } as never,
            replace: true,
          } as never);
          return;
        }
        setRemoteEvent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, localEvent?.id, eventsReady, navigate]);

  const onRealtime = useCallback((next: KEvent | null) => {
    setRemoteEvent(next);
  }, []);
  useEventRealtime(eventId, onRealtime);


  const firstRender = useRef(true);
  useEffect(() => {
    if (!event) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Mirrors the store's own debounce window so the badge doesn't claim
    // "Saved" before the change has actually had a chance to persist.
    setSaving(true);
    const t = setTimeout(() => {
      setSaving(false);
      setSavedAt(new Date());
    }, 500);
    return () => clearTimeout(t);
  }, [event]);

  // Show the skeleton while the local cache is hydrating OR the remote
  // fetch is still in flight. Only flip to "Event not found" once both
  // signals have resolved with no event.
  const notFound = eventsReady && !localEvent && remoteEvent === null;

  if (!event && !notFound) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="mx-auto max-w-5xl lg:max-w-6xl xl:max-w-7xl px-6 py-16" aria-label="Opening event">
          <div className="h-3 w-28 rounded-full bg-secondary" />
          <div className="mt-7 h-10 w-72 max-w-full rounded-md bg-secondary" />
          <div className="mt-4 h-4 w-52 max-w-full rounded-md bg-secondary" />
          <div className="mt-10 rounded-xl bg-card p-6 ring-1 ring-ink/5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="h-12 rounded-md bg-secondary" />
              <div className="h-12 rounded-md bg-secondary" />
              <div className="h-12 rounded-md bg-secondary" />
              <div className="h-12 rounded-md bg-secondary" />
            </div>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="mx-auto max-w-3xl px-6 py-32 text-center">
          <h1 className="font-serif text-3xl">Event not found</h1>
          <Link to="/events" className="mt-6 inline-block text-sm text-velvet underline underline-offset-4">
            ← Back to dashboard
          </Link>
        </div>
        <SiteFooter />
      </div>
    );
  }


  const step = STEPS[stepIdx];
  const isLast = nextAvailableIndex(stepIdx) == null;
  const hasPrev = prevAvailableIndex(stepIdx) != null;

  function stepAccessible(s: Step): boolean {
    // While tier is loading, hide gated steps so a fast click can't slip past the paywall.
    if (tier === "loading") return !s.atelierOnly && !s.hostAndAtelierOnly && !s.whisperPlus;
    if (s.atelierOnly) return tier === "atelier" || tier === "trial" || tier === "owner";
    if (s.hostAndAtelierOnly) return tier === "host" || tier === "atelier" || tier === "owner";
    if (s.whisperPlus) return tier !== "postcard";
    return true;
  }
  /**
   * Beginner mode shows only the essential steps. It never hides the step the
   * host is standing on, and "All tools" brings everything back instantly.
   */
  function stepVisible(s: Step): boolean {
    if (!stepAccessible(s)) return false;
    if (!simpleMode) return true;
    return !!s.essential || s.id === step?.id;
  }
  const accessibleSteps = STEPS.filter(stepVisible);
  const accessibleIdx = accessibleSteps.findIndex((s) => s.id === step?.id);
  const hiddenStepCount = STEPS.filter((s) => stepAccessible(s) && !stepVisible(s)).length;

  function nextAvailableIndex(from: number): number | null {
    for (let i = from + 1; i < STEPS.length; i++) {
      if (stepVisible(STEPS[i])) return i;
    }
    return null;
  }
  function prevAvailableIndex(from: number): number | null {
    for (let i = from - 1; i >= 0; i--) {
      if (stepVisible(STEPS[i])) return i;
    }
    return null;
  }


  async function onDelete() {
    if (await confirmDialog({ title: "Delete this event? This can't be undone." })) {
      deleteEvent(eventId);
      navigate({ to: "/events" });
    }
  }

  function jumpTo(i: number) {
    if (i === stepIdx) return;
    setDirection(i > stepIdx ? "forward" : "back");
    setStepIdx(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function goNext() {
    const n = nextAvailableIndex(stepIdx);
    if (n != null) jumpTo(n);
  }
  function goBack() {
    const p = prevAvailableIndex(stepIdx);
    if (p != null) jumpTo(p);
  }
  const summaryIdx = STEPS.findIndex((s) => s.id === "summary");

  /**
   * "View reports" must work from every step, including the summary step itself.
   * jumpTo() early-returns when the target step is the current step, so on
   * Review & save the button used to do nothing at all. Always scroll the
   * reports panel into view; only change step when we're not already there.
   */
  function goToReports() {
    const alreadyThere = stepIdx === summaryIdx;
    if (!alreadyThere) jumpTo(summaryIdx);
    window.setTimeout(() => {
      const el = document.getElementById("event-reports");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    }, alreadyThere ? 0 : 260);
  }


  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />

      <section className="border-b border-ink/5 py-8">
        <div className="mx-auto max-w-5xl lg:max-w-6xl xl:max-w-7xl px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to="/events" className="text-xs text-muted-foreground hover:text-ink">
              ← All gatherings
            </Link>
            <div className="flex items-center gap-2">
              <SaveIndicator savedAt={savedAt} saving={saving} />
              <SaveNowButton eventId={eventId} size="sm" />
            </div>

          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
            <div className="min-w-0">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">
                Step {accessibleIdx >= 0 ? accessibleIdx + 1 : stepIdx + 1} of {accessibleSteps.length} · {step.title}
              </span>
              <h1 className="mt-2 truncate font-serif text-2xl font-medium tracking-tight sm:text-4xl">
                {event.title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{step.blurb}</p>
            </div>
            <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2">
              <button
                onClick={() => {
                  refreshEventsFromCloud();
                  toast.success("Refreshing latest data…");
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink/10 hover:bg-secondary"
                title="Pull the latest version from the cloud"
              >
                ↻ Refresh
              </button>
              <button
                onClick={goToReports}
                className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-velvet"
                title="Jump to the summary & reports"
              >
                📊 View reports
              </button>
              <button
                onClick={onDelete}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-ink/10 hover:bg-secondary hover:text-destructive"
              >
                Delete event
              </button>
            </div>
            <details className="relative sm:hidden">
              <summary className="list-none rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white cursor-pointer select-none">
                Actions ▾
              </summary>
              <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl bg-paper p-1 shadow-xl ring-1 ring-ink/10">
                <button
                  onClick={() => {
                    refreshEventsFromCloud();
                    toast.success("Refreshing latest data…");
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs text-ink hover:bg-secondary"
                >
                  ↻ Refresh
                </button>
                <button
                  onClick={(e) => {
                    e.currentTarget.closest("details")?.removeAttribute("open");
                    goToReports();
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs text-ink hover:bg-secondary"
                >
                  📊 View reports
                </button>

                <button
                  onClick={onDelete}
                  className="block w-full rounded-lg px-3 py-2 text-left text-xs text-destructive hover:bg-secondary"
                >
                  Delete event
                </button>
              </div>
            </details>
          </div>


          <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-velvet transition-all"
              style={{
                width: `${(((accessibleIdx < 0 ? 0 : accessibleIdx) + 1) / Math.max(1, accessibleSteps.length)) * 100}%`,
              }}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-1.5 lg:hidden">
            {(simpleMode ? accessibleSteps : STEPS).map((s) => {
              const i = STEPS.findIndex((x) => x.id === s.id);
              const accessible = stepAccessible(s);
              const isActive = i === stepIdx;
              const shownNumber = simpleMode ? accessibleSteps.findIndex((x) => x.id === s.id) + 1 : i + 1;
              const baseClass = "rounded-full px-3 py-1.5 text-xs font-medium transition";
              const activeClass = isActive ? "bg-ink text-white" : i < stepIdx ? "bg-velvet/10 text-velvet hover:bg-velvet/20" : "bg-secondary text-muted-foreground hover:bg-secondary/70";
              const lockedClass = "bg-secondary/50 text-muted-foreground/50 cursor-not-allowed";
              return (
                <button
                  key={s.id}
                  data-tour={s.id === "guests" ? "guests" : s.id === "share" ? "share" : undefined}
                  onClick={() => accessible && jumpTo(i)}
                  disabled={!accessible}
                  title={!accessible ? (s.hostAndAtelierOnly ? "Host & Atelier only" : s.whisperPlus ? "Whisper & up" : "Atelier only") : undefined}
                  className={`${baseClass} ${accessible ? activeClass : lockedClass}`}
                >
                  {shownNumber}. {s.title}
                  {s.id === "share" && accessible && guestNotes.unreadComments > 0 ? (
                    <span
                      className="ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-velvet px-1.5 text-[10px] font-semibold text-white"
                      aria-label={`${guestNotes.unreadComments} new guest comments`}
                    >
                      {guestNotes.unreadComments}
                    </span>
                  ) : null}
                  {!accessible && " 🔒"}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setUiModeState(simpleMode ? "expert" : "simple")}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-velvet underline underline-offset-4"
            >
              {simpleMode
                ? `Show all tools${hiddenStepCount ? ` (+${hiddenStepCount})` : ""}`
                : "Simple mode"}
            </button>
          </div>

        </div>
      </section>

      <section className="py-10">
        <div className="mx-auto max-w-5xl lg:max-w-6xl xl:max-w-7xl px-6 page-stage lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
          <aside className="hidden lg:block">
            <div className="sticky top-32">
              <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">
                {simpleMode ? "Simple steps" : "Steps"}
              </p>
              <nav className="flex flex-col gap-1">
                {(simpleMode ? accessibleSteps : STEPS).map((s) => {
                  const i = STEPS.findIndex((x) => x.id === s.id);
                  const accessible = stepAccessible(s);
                  const isActive = i === stepIdx;
                  const done = i < stepIdx;
                  const shownNumber = simpleMode ? accessibleSteps.findIndex((x) => x.id === s.id) + 1 : i + 1;
                  return (
                    <button
                      key={s.id}
                      data-tour={s.id === "guests" ? "guests" : s.id === "share" ? "share" : undefined}
                      onClick={() => accessible && jumpTo(i)}
                      disabled={!accessible}
                      title={!accessible ? (s.hostAndAtelierOnly ? "Host & Atelier only" : s.whisperPlus ? "Whisper & up" : "Atelier only") : undefined}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                        isActive
                          ? "bg-ink text-white"
                          : accessible
                          ? "text-ink hover:bg-secondary"
                          : "cursor-not-allowed text-muted-foreground/50"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                          isActive
                            ? "bg-paper text-ink"
                            : done
                            ? "bg-velvet/15 text-velvet"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {done ? "✓" : shownNumber}
                      </span>
                      <span className="truncate">{s.title}</span>
                      {s.id === "share" && accessible && guestNotes.unreadComments > 0 ? (
                        <span
                          className="ml-auto inline-flex min-w-4 items-center justify-center rounded-full bg-velvet px-1.5 text-[10px] font-semibold text-white"
                          aria-label={`${guestNotes.unreadComments} new guest comments`}
                        >
                          {guestNotes.unreadComments}
                        </span>
                      ) : null}
                      {!accessible && <span className="ml-auto text-[10px]">🔒</span>}
                    </button>
                  );
                })}
              </nav>
              <button
                type="button"
                onClick={() => setUiModeState(simpleMode ? "expert" : "simple")}
                className="mt-3 w-full rounded-lg border border-ink/10 px-3 py-2 text-xs font-medium text-ink transition hover:bg-secondary"
              >
                {simpleMode
                  ? `Show all tools${hiddenStepCount ? ` (+${hiddenStepCount})` : ""}`
                  : "Switch to simple mode"}
              </button>

              <div className="mt-6 rounded-lg bg-secondary/40 p-3 text-[11px] text-muted-foreground ring-1 ring-ink/5">
                <p className="font-medium text-ink">Keyboard</p>
                <p className="mt-1">⌘K jump · ⌘S save · ⌘↵ next</p>
              </div>
            </div>
          </aside>

          <div className="min-w-0">
            <div
              key={stepIdx}
              className={direction === "forward" ? "page-turn-forward" : "page-turn-back"}
            >
              <StepBody stepId={step.id} event={event} eventId={eventId} setStepIdx={setStepIdx} />
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-ink/5 pt-6">
              <button
                onClick={goBack}
                disabled={!hasPrev}
                className="rounded-full px-4 py-2 text-sm font-medium text-ink ring-1 ring-ink/15 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Back
              </button>
              <div className="hidden text-[11px] text-muted-foreground sm:block">
                Don't worry — everything saves automatically as you type.
              </div>
              {isLast ? (
                <button
                  onClick={() => {
                    setSavedAt(new Date());
                    toast("All saved! You can come back to this event any time from the dashboard.");
                    navigate({ to: "/events" });
                  }}
                  className="rounded-full bg-velvet px-5 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  ✓ Save & finish
                </button>
              ) : (
                <button
                  onClick={goNext}
                  className="rounded-full bg-velvet px-5 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Next →
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section id="event-addons" className="border-t border-ink/5 bg-secondary/20 py-10">
        <div className="mx-auto max-w-5xl lg:max-w-6xl xl:max-w-7xl px-6">
          <OneTimePassAttach eventId={eventId} />
          <AiPackagesPanel eventId={eventId} className="mb-10" />
          <EventAddOnsPanel eventId={eventId} />
        </div>
      </section>

      <SiteFooter />
      <ViewToggle mode="admin" eventId={eventId} />
    </div>
  );
}

function SaveIndicator({ savedAt, saving }: { savedAt: Date | null; saving: boolean }) {
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-amber-500" /> Saving…
      </span>
    );
  }
  if (!savedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-emerald-500" /> Auto-saving on
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
      <span className="size-1.5 rounded-full bg-emerald-500" /> Saved
    </span>
  );
}

function StepBody({ stepId, event, eventId, setStepIdx }: { stepId: StepId; event: KEvent; eventId: string; setStepIdx: (i: number) => void }) {
  switch (stepId) {
    case "basics":
      return <BasicsPanel event={event} eventId={eventId} />;
    case "hosts":
      return <HostsPanel event={event} eventId={eventId} />;
    case "design":
      return <CustomizePanel event={event} eventId={eventId} />;
    case "extras":
      return (
        <div className="space-y-8">
          <ExtrasPanel event={event} eventId={eventId} />
          <SectionDivider
            title="What to bring"
            subtitle="Potluck sign-up sheet — included on every plan"
          />
          <BringSheetPanel event={event} eventId={eventId} />
        </div>
      );
    case "registry":
      return (
        <WhisperPlusGate feature="Registry & gift links">
          <div className="space-y-8">
            <RegistryPanel event={event} eventId={eventId} />
            <SectionDivider title="Gift contributions" subtitle="Included with Atelier — cash gifts via Stripe" atelierOnly />
            <AtelierGate feature="Gift contribution funds">
              <GiftFundPanel event={event} eventId={eventId} />
            </AtelierGate>
            <SectionDivider title="Tip & Donation Jar" subtitle="Host & Atelier — Venmo, Cash App, Zelle, PayPal, Apple/Google Pay" />
            <HostAndAtelierGate feature="Tip & Donation Jar">
              <TipJarPanel event={event} eventId={eventId} />
            </HostAndAtelierGate>
          </div>
        </WhisperPlusGate>
      );
    case "payment":
      return (
        <HostAndAtelierGate feature="Collect payment from guests">
          <PaymentPanel event={event} eventId={eventId} />
        </HostAndAtelierGate>
      );
    case "guests":
      return (
        <div className="space-y-8">
          <GuestsStep event={event} eventId={eventId} setStepIdx={setStepIdx} />
          <SectionDivider title="Reminders" subtitle="Email and text nudges before the big day, all in one place" />
          <RemindersPanel event={event} eventId={eventId} />
          <SmsRemindersPanel event={event} eventId={eventId} />
          <SectionDivider title="Announcements" subtitle="Broadcast updates to guests — Whisper, Host & Atelier" />
          <EventAnnouncementsPanel eventId={eventId} eventTitle={event.title ?? "Your event"} coverImage={event.image ?? ""} guests={event.guests ?? []} />
        </div>
      );

    case "dayof":
      return (
        <AtelierGate feature="The day-of toolkit (seating, run-of-show, door check-in)">
          <div className="space-y-8">
            <SeatingChartPanel event={event} eventId={eventId} />
            <SectionDivider title="Run of show" subtitle="Day-of timeline you can print" />
            <TimelinePanel event={event} eventId={eventId} />
            <SectionDivider title="Door check-in" subtitle="QR scanner + printable guest cards" />
            <CheckInPanel event={event} eventId={eventId} />
            <SectionDivider title="Post-event wrap-up" subtitle="Final attendance, no-shows and money once the party is over" />
            <PostEventWrapUp event={event} />
          </div>
        </AtelierGate>
      );
    case "reach":
      return (
        <div className="space-y-8">
          <BrandedDomainPanel event={event} eventId={eventId} />
          <AtelierGate feature="Calendar sync">
            <SectionDivider title="Calendar sync" subtitle="One-tap add for Google, Apple, Outlook" />
            <CalendarSyncPanel event={event} eventId={eventId} />
          </AtelierGate>
        </div>
      );
    case "share":
      return (
        <div className="space-y-8">
          <HelpCard>
            Email invitations are available on every plan. Branded share art, printable invites,
            QR PDF, and thank-you cards are on Whisper and up.
          </HelpCard>
          {/* Email invites available for ALL tiers */}
          <EmailInvitationsCard event={event} />
          <SectionDivider title="Well wishes" subtitle="Messages guests leave for the guest of honor" />
          <WellWishesPanel eventId={eventId} />
          <SectionDivider title="Comments" subtitle="Notes guests leave on your invitation" />
          <label className="flex items-start gap-3 rounded-xl bg-secondary/60 p-4 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={!!event.publicCommentsEnabled}
              onChange={(e) => updateEvent(eventId, { publicCommentsEnabled: e.target.checked })}
            />
            <span>
              <span className="font-medium">Let guests post public comments</span>
              <span className="block text-xs text-muted-foreground">
                Off by default. Private notes to you stay available either way, and you can hide,
                make private, or remove any comment at any time.
              </span>
            </span>
          </label>
          <EventCommentsPanel eventId={eventId} />
          <PhotoWallPanel eventId={eventId} eventTitle={event.title} />
          <WhisperPlusGate feature="Branded share art & thank-you cards">
            <div className="space-y-8">
              <ShareHub event={event} hideEmailCard />
              <SectionDivider title="Thank-you cards" subtitle="Send beautiful notes after the party" />
              <ThankYouPanel event={event} eventId={eventId} />
            </div>
          </WhisperPlusGate>
        </div>
      );
    case "summary":
      return <SummaryStep event={event} eventId={eventId} />;
  }
}

function SectionDivider({ title, subtitle, atelierOnly }: { title: string; subtitle?: string; atelierOnly?: boolean }) {
  return (
    <div className="flex items-end justify-between gap-3 border-t border-ink/10 pt-6">
      <div>
        <h3 className="font-serif text-xl">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {atelierOnly && (
        <span className="rounded-full bg-velvet px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
          Atelier
        </span>
      )}
    </div>
  );
}

function AtelierGate({ feature, children }: { feature: string; children: React.ReactNode }) {
  const tier = useTier();
  if (tier === "loading") {
    return <div className="rounded-xl border border-ink/5 bg-card p-6"><TabContentSkeleton /></div>;
  }
  if (tier === "atelier" || tier === "trial" || tier === "owner") return <>{children}</>;
  return (
    <div className="rounded-2xl border border-velvet/20 bg-velvet/5 p-6">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-velvet px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
          Atelier
        </span>
        <h3 className="font-serif text-lg">{feature}</h3>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        This is part of the Atelier tier — our most complete plan for hosts who want the works.
      </p>
      <Link
        to="/pricing"
        className="mt-4 inline-block rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper hover:opacity-90"
      >
        Upgrade to Atelier
      </Link>
    </div>
  );
}

function WhisperPlusGate({ feature, children }: { feature: string; children: React.ReactNode }) {
  const tier = useTier();
  if (tier === "loading") {
    return <div className="rounded-xl border border-ink/5 bg-card p-6"><TabContentSkeleton /></div>;
  }
  if (tier !== "postcard") return <>{children}</>;
  return (
    <div className="rounded-2xl border border-velvet/20 bg-velvet/5 p-6">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-velvet px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
          Whisper
        </span>
        <h3 className="font-serif text-lg">{feature}</h3>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Postcard covers the essentials. Upgrade to Whisper to unlock {feature.toLowerCase()} and more.
      </p>
      <Link
        to="/pricing"
        className="mt-4 inline-block rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper hover:opacity-90"
      >
        Upgrade to Whisper
      </Link>
    </div>
  );
}

function HostAndAtelierGate({
  feature,
  description,
  children,
  // Collaborators start at Whisper (1 seat), so the gate takes a floor rather
  // than hard-coding Host. Seat COUNTS are still enforced server-side.
  minTier = "host",
}: {
  feature: string;
  description?: string;
  children: React.ReactNode;
  minTier?: "whisper" | "host";
}) {
  const tier = useTier();
  if (tier === "loading") {
    return <div className="rounded-xl border border-ink/5 bg-card p-6"><TabContentSkeleton /></div>;
  }
  const allowed =
    tier === "host" || tier === "atelier" || tier === "owner" || (minTier === "whisper" && tier === "whisper");
  if (allowed) return <>{children}</>;
  const tierLabel = minTier === "whisper" ? "Whisper" : "Host";
  return (
    <div className="rounded-2xl border border-velvet/20 bg-velvet/5 p-6">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-velvet px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
          {tierLabel}
        </span>
        <h3 className="font-serif text-lg">{feature}</h3>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {description ?? `${feature} is available on ${tierLabel} and above.`}
      </p>
      <Link
        to="/pricing"
        className="mt-4 inline-block rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper hover:opacity-90"
      >
        Upgrade to {tierLabel}
      </Link>
    </div>
  );
}

function useTier(): TierState {
  const previewTier = usePreviewTier();
  useEffect(() => {
    loadTier(previewTier);
  }, [previewTier]);
  // Tier/entitlement grants can land while the tab is open (promos, comps,
  // upgrades in another tab). Refetch on window focus and whenever the auth
  // session changes so gates unlock without a manual hard refresh.
  useEffect(() => {
    const refresh = () => {
      invalidateTier();
      loadTier(previewTier, true);
    };
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const { data } = supabase.auth.onAuthStateChange(() => refresh());
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      data.subscription.unsubscribe();
    };
  }, [previewTier]);
  return useSyncExternalStore(subscribeTier, () => tierSnapshot, () => "loading");
}



function HelpCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-velvet/15 bg-velvet/5 p-4 text-sm text-ink/80">
      💡 {children}
    </div>
  );
}

function BasicsPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  // The stored wall clock belongs to the venue zone, so the field shows the
  // venue clock and saves the typed wall clock unchanged (same shape the create
  // flow writes). No UTC conversion here, that is what shifted the hour.
  const toLocal = (iso: string) => eventDateTimeLocalInput(iso, event.timezone);
  // Hearing an entrance is a deliberate act in the builder: the host clicks
  // "Hear the sound" once, which is also the gesture browsers require.
  const [hearPreview, setHearPreview] = useState(false);
  // Only one entrance is ever heard at a time: the one being looked at, or the
  // chosen one. Ten beds playing over each other is noise, and browsers refuse
  // that many sound streams anyway.
  const [hearingEntrance, setHearingEntrance] = useState<string | null>(null);


  return (
    <div className="space-y-6">
      <HelpCard>
        Start here. Give your event a name, pick the day and time, and tell folks where to go.
      </HelpCard>
      <div className="rounded-xl border border-ink/5 bg-card p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Event name">
            <input
              value={event.title}
              onChange={(e) => updateEvent(eventId, { title: e.target.value })}
              placeholder="e.g. Sophia's 30th Birthday"
              className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
            />
          </Field>
          <Field label="When (date & time)">
            <input
              type="datetime-local"
              value={toLocal(event.date)}
              onChange={(e) => {
                const v = e.target.value;
                if (v) updateEvent(eventId, { date: v });
              }}

              className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
            />
          </Field>
          <Field label="Venue time zone">
            <select
              value={eventTimeZone(event.timezone)}
              onChange={(e) => updateEvent(eventId, { timezone: e.target.value })}
              className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
            >
              {timeZoneOptions(event.timezone).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Guests see the time in this zone with its label, plus a small "your time" line when
              they are somewhere else.
            </p>
          </Field>
          <Field label="Venue name">
            <input
              value={event.venue}
              onChange={(e) => updateEvent(eventId, { venue: e.target.value })}
              placeholder="e.g. The Garden Room"
              className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
            />
          </Field>
          <Field label="Venue address (for maps & directions)">
            <input
              value={event.address ?? ""}
              onChange={(e) => updateEvent(eventId, { address: e.target.value })}
              placeholder="123 Main St, City, ST"
              className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
            />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Short description (one line)">
            <input
              value={event.description}
              onChange={(e) => updateEvent(eventId, { description: e.target.value })}
              placeholder="e.g. A cozy dinner to celebrate"
              className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
            />
          </Field>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Welcome quote (optional)">
            <input
              value={event.welcomeQuote ?? ""}
              onChange={(e) => updateEvent(eventId, { welcomeQuote: e.target.value })}
              placeholder='e.g. "Let the good times roll."'
              className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
            />
          </Field>
          <Field label="Countdown timer on invite">
            <label className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={event.countdownEnabled !== false}
                onChange={(e) => updateEvent(eventId, { countdownEnabled: e.target.checked })}
              />
              <span>Show days · hours · minutes until the big day</span>
            </label>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Invitation entrance animation">
            <p className="mb-2 text-[11px] text-muted-foreground">
              The <strong>Envelope unfolds</strong> reveal is included on the Whisper plan. The other entrances unlock on the Host plan or higher.
            </p>
            <button
              type="button"
              onClick={() => {
                // Start the audio inside the click itself: Safari refuses sound
                // that begins later in an effect.
                if (!hearPreview) unlockEntranceAudio();
                setHearPreview((v) => !v);
              }}
              className="mb-2 rounded-full border border-ink/15 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition hover:bg-secondary/60"
            >
              {hearPreview ? "Sound on in previews" : "Hear the sound"}
            </button>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">

              {INVITE_ANIMATIONS.map((a) => {
                const active = (event.inviteAnimation ?? "envelope") === a.id;
                const isFree = FREE_ANIMATIONS.includes(a.id);
                const suggested = recommendedEntrances(event.title, event.seriesName, event.description).includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={async () => {
                      if (isJarringForOccasion(a.id, event.title, event.seriesName, event.description)) {
                        const ok = await confirmDialog({
                          title: `Use "${a.name}" for this event?`,
                          body: `This looks like a solemn occasion, and "${a.name}" is a celebratory entrance. "Dark to light" or "Envelope unfolds" usually suit better. Use it anyway?`,
                          confirmLabel: "Use it anyway",
                          tone: "info",
                        });
                        if (!ok) return;
                      }
                      if (!isFree) {
                        const ok = await confirmDialog({
                          title: `"${a.name}" is a Pro entrance`,
                          body: `On the Whisper plan only "Envelope unfolds" plays for your guests. Upgrade to Host or Atelier to unlock this one. Apply it anyway just for preview?`,
                          confirmLabel: "Preview it",
                          tone: "info",
                        });
                        if (!ok) return;
                      }
                      updateEvent(eventId, { inviteAnimation: a.id });
                    }}
                    className={`group relative rounded-lg border p-2 text-left transition ${
                      active ? "border-velvet ring-2 ring-velvet/40 bg-velvet/5" : "border-ink/10 hover:bg-secondary/50"
                    }`}
                    title={a.description}
                    onMouseEnter={() => setHearingEntrance(a.id)}
                    onFocus={() => setHearingEntrance(a.id)}
                    onMouseLeave={() => setHearingEntrance((c) => (c === a.id ? null : c))}
                  >
                    <EntrancePreview
                      animation={a.id}
                      accent={event.color}
                      pace={event.entrancePace}
                      sound={
                        hearPreview &&
                        (hearingEntrance ? hearingEntrance === a.id : active)
                      }
                      label={a.id === "none" ? "Straight in" : a.name}
                    />
                    <div className="mt-1.5 flex items-center gap-1">
                      <span className="text-[11px] font-medium">{a.name}</span>
                      {a.flagship && (
                        <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[8px] uppercase tracking-widest text-ink/70">
                          House style
                        </span>
                      )}
                    </div>
                    {suggested && !active && (
                      <div className="mt-0.5 text-[9px] uppercase tracking-widest text-velvet/80">
                        Suits this event
                      </div>
                    )}
                    {isFree ? (
                      <span className="absolute right-1 top-1 rounded-full bg-emerald-600/90 px-1.5 py-0.5 text-[8px] uppercase tracking-widest text-white">
                        Included
                      </span>
                    ) : (
                      <span className="absolute right-1 top-1 rounded-full bg-velvet/90 px-1.5 py-0.5 text-[8px] uppercase tracking-widest text-white">
                        Pro
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {(event.inviteAnimation ?? "envelope") !== "none" && (
              <div className="mt-4 rounded-lg border border-ink/10 p-3">
                <p className="text-[11px] font-medium">How long the reveal takes</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Every entrance opens on a still frame, eases in, then settles and holds. This
                  sets how much time it is given.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ENTRANCE_PACES.map((p) => {
                    const on = normalizePace(event.entrancePace) === p.id;
                    const secs = (
                      entrancePhases(event.inviteAnimation ?? "envelope", p.id).total / 1000
                    ).toFixed(1);
                    return (
                      <button
                        key={p.id}
                        onClick={() => updateEvent(eventId, { entrancePace: p.id })}
                        title={p.hint}
                        className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
                          on
                            ? "border-velvet bg-velvet/10 text-velvet"
                            : "border-ink/10 hover:bg-secondary/50"
                        }`}
                      >
                        {p.name} · {secs}s
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {ENTRANCE_PACES.find((p) => p.id === normalizePace(event.entrancePace))?.hint}
                </p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                to="/invite/$eventId"
                params={{ eventId }}
                search={{ preview: 1, anim: event.inviteAnimation ?? "envelope" } as any}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-velvet px-4 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                Preview animation →
              </Link>
              <Link to="/pricing" className="text-[11px] text-velvet underline underline-offset-4">
                See plans & unlock all entrances
              </Link>
            </div>
          </Field>
        </div>
      </div>

      <WhisperPlusGate feature="Voice greeting">
        <VoiceMessagePanel event={event} eventId={eventId} />
      </WhisperPlusGate>
      <MediaGalleryPanel event={event} eventId={eventId} />
    </div>
  );
}

/** Reads a clip's length without leaking the temporary object URL. */
async function audioDurationOf(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const el = document.createElement("audio");
    el.preload = "metadata";
    const done = (value: number) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : 0);
    el.onerror = () => done(0);
    el.src = url;
  });
}

function VoiceMessagePanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [narrationBusy, setNarrationBusy] = useState(false);
  const regenerateNarration = useServerFn(regenerateInviteNarration);
  const sessionRef = useRef<{ stop: () => Promise<Blob> } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);

  // A greeting recorded in Chrome used to be saved as WebM/Opus, which iPhone
  // Safari cannot decode at all — guests saw a player and heard silence. Every
  // recording and upload is now converted to WAV, which every phone can play.
  const legacyFormat = /\.webm(\?|$)|\.ogg(\?|$)/i.test(event.voiceMessage || "");

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const { startPcmRecording } = await import("@/lib/wav-audio");
      sessionRef.current = await startPcmRecording(stream);
      startedAtRef.current = Date.now();
      setRecording(true);
    } catch {
      setError("We couldn't access your microphone. Check browser permissions and try again.");
    }
  }

  async function stop() {
    const session = sessionRef.current;
    sessionRef.current = null;
    setRecording(false);
    if (!session) return;
    setBusy(true);
    try {
      const blob = await session.stop();
      const duration = Math.round((Date.now() - startedAtRef.current) / 1000);
      const file = new File([blob], `voice-${Date.now()}.wav`, { type: "audio/wav" });
      setVoiceMessage(eventId, await uploadEventMedia(file), duration);
    } catch {
      setError("We couldn't save that recording. Please try again.");
    } finally {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setBusy(false);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    // A 25MB "audio file" is nearly always a video export or an hour-long
    // recording; either way guests would wait forever, so refuse it up front.
    if (file.size > 25 * 1024 * 1024) {
      setError("That file is larger than 25MB. Please trim it or record directly here.");
      return;
    }
    setBusy(true);
    try {
      const { fileToWav } = await import("@/lib/wav-audio");
      const wav = await fileToWav(file);
      const duration = await audioDurationOf(wav);
      if (duration > 300) {
        setError("That recording is longer than 5 minutes. Please shorten it.");
        return;
      }
      const converted = new File([wav], `voice-${Date.now()}.wav`, { type: "audio/wav" });
      setVoiceMessage(eventId, await uploadEventMedia(converted), Math.round(duration));
    } catch {
      setError("We couldn't read that audio file. Try an MP3, M4A or WAV.");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="rounded-xl border border-ink/5 bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg">Voice greeting</h3>
          <p className="text-xs text-muted-foreground">
            Record a short hello so guests hear your voice the moment they open the invite. Aim for 10–30 seconds.
          </p>
        </div>
        {event.voiceMessage && (
          <button
            onClick={() => clearVoiceMessage(eventId)}
            className="rounded-md border border-ink/10 px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary"
          >
            Remove
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {recording ? (
          <button
            type="button"
            onClick={() => void stop()}
            className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-red-500/30"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            Stop recording
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void start()}
            className="inline-flex items-center gap-2 rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <span className="h-2 w-2 rounded-full bg-white" />
            {busy ? "Saving…" : event.voiceMessage ? "Record again" : "Start recording"}
          </button>
        )}
        <label className="cursor-pointer rounded-full border border-ink/10 px-4 py-2 text-sm hover:bg-secondary">
          Upload audio file
          <input type="file" accept="audio/*" className="hidden" onChange={onUpload} />
        </label>
      </div>

      {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

      {legacyFormat && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          This greeting was saved in a format iPhones can't play. Record it again here and guests
          on every phone will hear it.
        </p>
      )}

      {event.voiceMessage && (
        <div className="mt-4 rounded-lg bg-secondary/60 p-3">
          <audio controls preload="metadata" src={event.voiceMessage} className="w-full" />
          {!!event.voiceMessageDuration && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              About {event.voiceMessageDuration}s · guests will hear this on the invite page.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-ink/10 pt-4">
        <p className="text-xs font-medium">Invitation reading</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Guests share one studio reading. Rebuild it after changing the invitation or its voice.
        </p>
        <button
          type="button"
          disabled={narrationBusy}
          onClick={async () => {
            setNarrationBusy(true);
            try {
              await regenerateNarration({ data: { eventId } });
              toast.success("The reading will be rebuilt the next time the invitation opens.");
            } catch (err) {
              toast.error(toUserMessage(err, "We couldn't refresh the reading."));
            } finally {
              setNarrationBusy(false);
            }
          }}
          className="mt-3 rounded-full border border-ink/10 px-4 py-2 text-sm hover:bg-secondary disabled:opacity-50"
        >
          {narrationBusy ? "Preparing…" : "Regenerate invitation reading"}
        </button>
        <InvitationReadingPreview event={event} eventId={eventId} />
      </div>
    </div>
  );
}

function MediaGalleryPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const tier = useTier();
  const isPostcard = tier === "postcard";
  const tabs = isPostcard ? (["upload", "link"] as const) : (["upload", "link", "ai"] as const);
  const [tab, setTab] = useState<"upload" | "link" | "ai">("upload");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkKind, setLinkKind] = useState<MediaItem["kind"]>("gif");
  const [linkCaption, setLinkCaption] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  async function onUploadFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const toastId = "invite-gallery-upload";
    toast.loading(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}...`, { id: toastId });
    try {
      await Promise.all(files.map(async (file) => {
        const url = await uploadEventMedia(file);
        const kind: MediaItem["kind"] = file.type.startsWith("video/")
          ? "video"
          : file.type === "image/gif"
            ? "gif"
            : "image";
        addMedia(eventId, { kind, url, caption: file.name });
      }));
      toast.success("Gallery upload complete.", { id: toastId });
    } catch (error) {
      toast.error("Couldn't upload every file.", {
        id: toastId,
        description: toUserMessage(error, "Please try again."),
      });
    }
  }

  function addLink() {
    if (!linkUrl.trim()) return;
    const url = normalizeExternalMediaUrl(linkUrl);
    addMedia(eventId, { kind: inferMediaKindFromUrl(url, linkKind), url, caption: linkCaption.trim() || undefined });
    setLinkUrl("");
    setLinkCaption("");
  }

  async function generateAi() {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    try {
      const prompt = aiPrompt.trim();
      const { generateInviteArt } = await import("@/lib/ai-art.functions");
      const { uploadAndRecord } = await import("@/lib/media-uploads.functions");
      const res = (await generateInviteArt({ data: { prompt, eventId } })) as
        | { base64: string; contentType: string }
        | { error: string };
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      const up = (await uploadAndRecord({
        data: {
          filename: `ai-art-${Date.now()}.png`,
          contentType: res.contentType,
          base64: res.base64,
          width: 1024,
          height: 1024,
          source: "invite",
          visibility: "public",
        },
      })) as { url?: string };
      if (!up?.url) {
        toast.error("Couldn't save the generated image. Please try again.");
        return;
      }
      addMedia(eventId, { kind: "ai", url: up.url, prompt, caption: prompt });
      setAiPrompt("");
    } catch (e) {
      toast.error(toUserMessage(e, "AI art failed. Please try again."));
    } finally {
      setAiBusy(false);
    }
  }

  const items = event.inviteMedia ?? [];

  return (
    <div className="rounded-xl border border-ink/5 bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg">Vibe gallery — photos, GIFs, memes{isPostcard ? "" : ", video & AI art"}</h3>
          <p className="text-xs text-muted-foreground">
            {isPostcard
              ? "Upload from your phone or paste a photo/GIF link."
              : "Add a few visuals to set the tone. Upload from your phone, paste a GIF or YouTube link, or describe something and let our AI paint it."}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-1 rounded-lg bg-secondary p-1 text-xs">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-1.5 capitalize transition ${
              tab === t ? "bg-card shadow-sm" : "text-muted-foreground hover:text-ink"
            }`}
          >
            {t === "upload" ? "Upload" : t === "link" ? "Paste link" : "AI image"}
          </button>
        ))}
      </div>

      {tab === "upload" && (
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-ink/15 bg-secondary/30 px-4 py-8 text-center hover:bg-secondary/60">
          <span className="text-sm font-medium">Drop or pick photos, GIFs, or video</span>
          <span className="mt-1 text-[11px] text-muted-foreground">JPG, PNG, GIF, MP4, MOV — multiple files OK</span>
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={onUploadFiles}
          />
        </label>
      )}

      {tab === "link" && (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            {(["gif", "meme", "video", "embed", "image"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setLinkKind(k)}
                className={`rounded-full px-3 py-1 text-[11px] capitalize ${
                  linkKind === k ? "bg-velvet text-white" : "bg-secondary text-muted-foreground"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Paste a Giphy, Tenor, YouTube, Vimeo, or image URL"
            className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
          />
          <input
            value={linkCaption}
            onChange={(e) => setLinkCaption(e.target.value)}
            placeholder="Caption (optional)"
            className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
          />
          <button
            onClick={addLink}
            className="rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!linkUrl.trim()}
          >
            Add to gallery
          </button>
          <p className="text-[11px] text-muted-foreground">
            Tip: on Giphy or Tenor, right-click a GIF and choose “Copy image address”.
          </p>
        </div>
      )}

      {tab === "ai" && (
        <div className="mt-4 space-y-2">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe the image. e.g. 'A moody watercolor of a midsummer garden party at dusk, lanterns and lilacs'"
            rows={3}
            className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            {[
              "Watercolor garden party at golden hour",
              "Confetti and disco lights, retro 70s",
              "Elegant marble + gold florals",
              "Cozy autumn cabin dinner, candle-lit",
            ].map((s) => (
              <button
                key={s}
                onClick={() => setAiPrompt(s)}
                className="rounded-full bg-secondary px-3 py-1 text-[11px] text-muted-foreground hover:bg-secondary/70"
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={generateAi}
            disabled={!aiPrompt.trim() || aiBusy}
            className="rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {aiBusy ? "Painting…" : "Generate with AI"}
          </button>
          <p className="text-[11px] text-muted-foreground">
            Powered by our own AI — generated images are saved to your media library and appear in the gallery below.
          </p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.length === 0 ? (
          <p className="col-span-full rounded-lg bg-secondary/40 p-6 text-center text-xs text-muted-foreground">
            Nothing here yet. Add a photo, GIF, video, or AI image above.
          </p>
        ) : (
          items.map((m) => <MediaTile key={m.id} item={m} eventId={eventId} />)
        )}
      </div>
    </div>
  );
}

function MediaTile({ item, eventId }: { item: MediaItem; eventId: string }) {
  const isVideo = item.kind === "video" && /\.(mp4|webm|mov)(\?|$)/i.test(item.url);
  const embedUrl = getMediaEmbedUrl(item.url);
  const [regenBusy, setRegenBusy] = useState(false);
  const regenCount = item.regenCount ?? 0;
  const canRegen = item.kind === "ai" && !!item.prompt && regenCount < AI_REGEN_LIMIT;

  async function regenerate() {
    if (!item.prompt || regenBusy) return;
    setRegenBusy(true);
    try {
      const { generateInviteArt } = await import("@/lib/ai-art.functions");
      const { uploadAndRecord } = await import("@/lib/media-uploads.functions");
      const res = (await generateInviteArt({ data: { prompt: item.prompt, eventId } })) as
        | { base64: string; contentType: string }
        | { error: string };
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      const up = (await uploadAndRecord({
        data: {
          filename: `ai-art-${Date.now()}.png`,
          contentType: res.contentType,
          base64: res.base64,
          width: 1024,
          height: 1024,
          source: "invite",
          visibility: "public",
        },
      })) as { url?: string };
      if (!up?.url) {
        toast.error("Couldn't save the new image. Please try again.");
        return;
      }
      // Replace in place — never adds a second gallery item.
      updateMedia(eventId, item.id, { url: up.url, regenCount: regenCount + 1 });
    } catch (e) {
      toast.error(toUserMessage(e, "Regenerate failed. Please try again."));
    } finally {
      setRegenBusy(false);
    }
  }

  return (
    <div className="group relative overflow-hidden rounded-lg ring-1 ring-ink/5">
      <div className="aspect-square w-full bg-secondary">
        {isVideo ? (
          <video src={item.url} className="h-full w-full object-cover" muted playsInline />
        ) : embedUrl ? (
          <iframe
            src={embedUrl}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={item.caption ?? "Embedded video"}
          />
        ) : (
          <img src={item.url} alt={item.caption ?? "Event photo"} className="h-full w-full object-cover" />
        )}
      </div>

      {/* Always visible (never hover-gated) so it is discoverable and tappable on touch devices. */}
      <button
        type="button"
        onClick={() => removeMedia(eventId, item.id)}
        aria-label={`Remove this ${item.kind}`}
        title="Remove"
        className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-ink/70 text-white shadow-sm backdrop-blur-sm transition hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-ink/80 to-transparent p-2 text-[10px] uppercase tracking-widest text-white">
        <span>{item.kind}</span>
        {item.kind === "ai" && item.prompt && (
          canRegen ? (
            <button
              type="button"
              onClick={regenerate}
              disabled={regenBusy}
              className="rounded-full bg-white/25 px-2 py-0.5 text-white transition hover:bg-white/40 disabled:opacity-50"
            >
              {regenBusy ? "Painting…" : `Regenerate (${AI_REGEN_LIMIT - regenCount} left)`}
            </button>
          ) : (
            <span className="normal-case tracking-normal text-white/80">
              Try a new prompt for more options
            </span>
          )
        )}
      </div>

      {item.caption && (
        <input
          value={item.caption}
          onChange={(e) => updateMedia(eventId, item.id, { caption: e.target.value })}
          className="w-full border-t border-ink/5 bg-card px-2 py-1 text-[11px] focus:outline-none"
        />
      )}
    </div>
  );
}

function RsvpDeadlineCard({ event, eventId }: { event: KEvent; eventId: string }) {
  // Convert stored ISO to input[type=datetime-local] format (local time).
  const initial = useMemo(() => {
    if (!event.rsvpDeadline) return "";
    const d = new Date(event.rsvpDeadline);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [event.rsvpDeadline]);
  const [val, setVal] = useState(initial);
  useEffect(() => { setVal(initial); }, [initial]);

  const offsets = event.rsvpReminderOffsetDays ?? [14, 7, 2];
  const ALL_OFFSETS: { days: number; label: string }[] = [
    { days: 14, label: "T-14 days" },
    { days: 7, label: "T-7 days" },
    { days: 2, label: "T-2 days" },
    { days: 0, label: "Day of" },
  ];
  const toggleOffset = (days: number) => {
    const next = offsets.includes(days) ? offsets.filter((d) => d !== days) : [...offsets, days].sort((a, b) => b - a);
    updateEvent(eventId, { rsvpReminderOffsetDays: next });
  };
  const commit = (raw: string) => {
    setVal(raw);
    if (!raw) { updateEvent(eventId, { rsvpDeadline: undefined }); return; }
    const iso = new Date(raw).toISOString();
    updateEvent(eventId, { rsvpDeadline: iso });
  };

  return (
    <div className="rounded-xl border border-ink/10 bg-secondary/40 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">RSVP deadline</p>
          <p className="text-[11px] text-muted-foreground">Guests see this on the invite. Auto-nudges chase pending replies on the schedule below.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            value={val}
            onChange={(e) => commit(e.target.value)}
            className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
          />
          {val && (
            <button
              type="button"
              onClick={() => commit("")}
              className="rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-ink/5"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {val && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-[11px] uppercase tracking-wider text-ink/60">Auto-nudge</span>
          {ALL_OFFSETS.map((o) => {
            const on = offsets.includes(o.days);
            return (
              <button
                key={o.days}
                type="button"
                onClick={() => toggleOffset(o.days)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  on ? "border-ink bg-ink text-paper" : "border-ink/20 bg-paper text-ink hover:bg-ink/5"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlusOnesCard({ event, eventId }: { event: KEvent; eventId: string }) {
  const allowed = Math.max(0, Math.min(MAX_PLUS_ONES, Number(event.plusOnesAllowed ?? 0)));
  return (
    <div className="rounded-xl border border-ink/10 bg-secondary/40 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Plus-ones</p>
          <p className="text-[11px] text-muted-foreground">
            Allow each guest to bring additional people. Each plus-one counts toward your event capacity.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-ink/70">
          Up to
          <select
            value={String(allowed)}
            onChange={(e) => {
              const n = Math.max(0, Math.min(MAX_PLUS_ONES, Number(e.target.value)));
              updateEvent(eventId, { plusOnesAllowed: n });
            }}
            className="rounded-lg border border-ink/15 bg-paper px-2 py-1 text-sm"
          >
            {Array.from({ length: MAX_PLUS_ONES + 1 }, (_, i) => (
              <option key={i} value={i}>{i === 0 ? "0 (not allowed)" : `${i} per guest`}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function CapacityCard({ event, eventId }: { event: KEvent; eventId: string }) {
  const rawCap = Number(event.capacity ?? 0);
  const capped = rawCap > 0;
  const [cap, setCap] = useState(capped ? String(rawCap) : "");
  useEffect(() => { setCap(capped ? String(rawCap) : ""); }, [rawCap, capped]);

  const confirmed = confirmedHeadcount(event);
  const pct = capped ? Math.min(100, Math.round((confirmed / rawCap) * 100)) : 0;
  const atCap = capped && confirmed >= rawCap;
  const nearCap = capped && !atCap && confirmed >= Math.ceil(rawCap * 0.9);

  const commit = (raw: string) => {
    setCap(raw);
    const n = Number(raw);
    updateEvent(eventId, { capacity: Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined });
  };

  return (
    <div className="rounded-xl border border-ink/10 bg-secondary/40 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Event capacity</p>
          <p className="text-[11px] text-muted-foreground">
            Cap total attendance. Plus-ones count toward the cap. New RSVPs pause once you hit it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] text-ink/70">
            <input
              type="checkbox"
              checked={capped}
              onChange={(e) => {
                if (e.target.checked) {
                  const n = Number(cap);
                  updateEvent(eventId, { capacity: Number.isFinite(n) && n > 0 ? Math.floor(n) : 50 });
                  if (!cap) setCap("50");
                } else {
                  // Removing the cap also clears the settings that depend on it,
                  // so no stale "armed" flags survive in the stored event.
                  updateEvent(eventId, {
                    capacity: undefined,
                    waitlistEnabled: false,
                    autoPromote: false,
                  });
                }
              }}

            />
            Cap attendance
          </label>
          {capped && (
            <label className="flex items-center gap-1 text-[11px] text-ink/70">
              at
              <input
                type="number"
                min={1}
                value={cap}
                onChange={(e) => commit(e.target.value)}
                className="w-20 rounded-lg border border-ink/15 bg-paper px-2 py-1 text-sm"
              />
              attendees
            </label>
          )}
        </div>
      </div>

      {capped && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className={atCap ? "font-semibold text-red-700" : nearCap ? "font-semibold text-amber-700" : "text-ink/70"}>
              {confirmed} / {rawCap} attending
              {atCap ? " — at capacity, RSVPs closed" : nearCap ? " — nearly full" : ""}
            </span>
            {atCap ? (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">Full</span>
            ) : nearCap ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Nearly full</span>
            ) : null}
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10">
            <div
              className={`h-full transition-all ${atCap ? "bg-red-500" : nearCap ? "bg-amber-500" : "bg-velvet"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function WaitlistCard({ event, eventId }: { event: KEvent; eventId: string }) {
  const tier = useTier();
  const unlocked = tier === "whisper" || tier === "host" || tier === "atelier" || tier === "owner";

  if (!unlocked) {
    return (
      <div className="rounded-xl border border-velvet/20 bg-gradient-to-br from-velvet/5 to-champagne/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-velvet">Waitlist & auto-promote — Whisper+</p>
            <p className="mt-1 text-[11px] text-ink/70">
              Let overflow guests join a waitlist. When someone declines, the next guest is promoted automatically and emailed in their language.
            </p>
          </div>
          <Link to="/pricing" className="rounded-full bg-velvet px-3 py-1.5 text-[11px] font-medium text-white hover:bg-velvet/90">
            Upgrade to Whisper
          </Link>
        </div>
      </div>
    );
  }


  const waitlistedCount = event.guests.filter((g) => g.status === "waitlisted").length;
  // These three settings depend on each other: a waitlist can only fill once a
  // capacity cap exists, and auto-promote can only act on a waitlist. Anything
  // whose prerequisite is off is disabled and labelled, so a host never leaves
  // this screen believing something is armed when it can never fire.
  const capped = typeof event.capacity === "number" && event.capacity > 0;
  const waitlistOn = !!event.waitlistEnabled && capped;

  return (
    <div className="rounded-xl border border-ink/10 bg-secondary/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Waitlist</p>
          <p className="text-[11px] text-muted-foreground">When your event is at capacity, overflow yeses land on the waitlist. Auto-promote fills the next spot when someone declines.</p>
        </div>
      </div>


      <div className="mt-3 flex flex-wrap gap-2">
        <label className={`flex items-center gap-2 text-xs ${capped ? "" : "opacity-50"}`}>
          <input
            type="checkbox"
            disabled={!capped}
            checked={!!event.waitlistEnabled && capped}
            onChange={(e) =>
              updateEvent(
                eventId,
                e.target.checked
                  ? { waitlistEnabled: true }
                  : { waitlistEnabled: false, autoPromote: false },
              )
            }
          />
          Enable waitlist
        </label>
        <label className={`flex items-center gap-2 text-xs ${waitlistOn ? "" : "opacity-50"}`}>
          <input

            type="checkbox"
            disabled={!waitlistOn}
            checked={waitlistOn && (event.autoPromote ?? true)}
            onChange={(e) => updateEvent(eventId, { autoPromote: e.target.checked })}
          />
          Auto-promote when space opens
        </label>
        {waitlistedCount > 0 && (
          <span className="ml-auto rounded-full bg-amber-100 px-3 py-1 text-[11px] font-medium text-amber-800">
            {waitlistedCount} on waitlist
          </span>
        )}
      </div>

      {!capped ? (
        <p className="mt-2 text-[11px] text-amber-700">
          Turn on "Cap attendance" above first. Without a cap your event never reaches capacity, so a
          waitlist and auto-promote can never do anything.
        </p>
      ) : !event.waitlistEnabled ? (
        <p className="mt-2 text-[11px] text-amber-700">
          Auto-promote is inactive until the waitlist is on, since there would be nobody waiting to promote.
        </p>
      ) : null}

      {capped && event.waitlistEnabled ? <WaitlistPanel event={event} eventId={eventId} /> : null}
    </div>
  );
}




function ShirtSizesCard({ event, eventId }: { event: KEvent; eventId: string }) {
  const tier = useTier();
  const unlocked = tier === "host" || tier === "atelier" || tier === "trial" || tier === "owner";

  if (!unlocked) {
    return (
      <div className="rounded-xl border border-velvet/20 bg-gradient-to-br from-velvet/5 to-champagne/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-velvet">T-shirt sizes — Host+</p>
            <p className="mt-1 text-[11px] text-ink/70">
              Collect an optional shirt size from every guest and each named plus-one, then export a ready-to-order size tally.
            </p>
          </div>
          <Link to="/pricing" className="rounded-full bg-velvet px-3 py-1.5 text-[11px] font-medium text-white hover:bg-velvet/90">
            Upgrade to Host
          </Link>
        </div>
      </div>
    );
  }

  const on = !!event.tshirtSizesEnabled;
  const locked = !!event.tshirtSizesLocked;
  const tally = tallyShirtSizes(event.guests);

  return (
    <div className="rounded-xl border border-ink/10 bg-secondary/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">T-shirt sizes</p>
      <p className="text-[11px] text-muted-foreground">
        Adds an optional size question to the RSVP form for the guest and each named plus-one. Turning this off hides sizes, it never deletes what guests already shared.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => updateEvent(eventId, { tshirtSizesEnabled: e.target.checked })}
          />
          Collect T-shirt sizes
        </label>
        {on && (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={locked}
              onChange={(e) =>
                updateEvent(eventId, {
                  tshirtSizesLocked: e.target.checked,
                  tshirtSizesLockedAt: e.target.checked ? new Date().toISOString() : undefined,
                })
              }
            />
            Lock sizes (order placed)
          </label>
        )}
        {on && tally.total > 0 && (
          <span className="ml-auto rounded-full bg-secondary px-3 py-1 text-[11px] font-medium text-ink/80">
            {tally.total} size{tally.total === 1 ? "" : "s"} collected
          </span>
        )}
      </div>

      {on && locked && (
        <p className="mt-2 text-[11px] text-amber-800">
          Sizes are locked{event.tshirtSizesLockedAt ? ` since ${formatStampDate((event.tshirtSizesLockedAt))}` : ""}. Guests and the guest list see them read-only.
        </p>
      )}

      {on && <ShirtPricingFields event={event} eventId={eventId} />}
    </div>
  );
}

/**
 * Shirt pricing controls. Only meaningful when payments are on: without a
 * payment method there is nothing to add a shirt charge to, so instead of
 * silently accruing an uncollectable balance we say so and stop.
 */
function ShirtPricingFields({ event, eventId }: { event: KEvent; eventId: string }) {
  const currency = event.paymentCurrency ?? "USD";
  const pricingOn = !!event.shirtPricingEnabled;
  const extrasOn = !!event.extraShirtsEnabled;
  const adult = shirtUnitPrice(event, "adult");
  const youth = shirtUnitPrice(event, "youth");
  const cap = maxExtraShirts(event);

  if (!event.paymentEnabled) {
    return (
      <p className="mt-3 rounded-lg border border-ink/10 bg-white/60 px-3 py-2 text-[11px] text-ink/70">
        Want to charge for shirts? Turn on payments for this event first, then a price per shirt appears here.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-ink/10 bg-white/60 p-3">
      <label className="flex items-center gap-2 text-xs font-medium">
        <input
          type="checkbox"
          checked={pricingOn}
          onChange={(e) => updateEvent(eventId, { shirtPricingEnabled: e.target.checked })}
        />
        Charge for T-shirts
      </label>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Each person's shirt is added to what their RSVP owes. Prices already sent to a guest stay locked at the amount they were billed.
      </p>

      {pricingOn && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-medium text-ink/80">
              Adult shirt price (XS to 3XL)
              <input
                type="number"
                min={0}
                step="0.01"
                value={event.shirtPriceAdult ?? ""}
                onChange={(e) =>
                  updateEvent(eventId, {
                    shirtPriceAdult: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)),
                  })
                }
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
                placeholder="0.00"
              />
            </label>
            <label className="text-[11px] font-medium text-ink/80">
              Youth shirt price (optional)
              <input
                type="number"
                min={0}
                step="0.01"
                value={event.shirtPriceYouth ?? ""}
                onChange={(e) =>
                  updateEvent(eventId, {
                    shirtPriceYouth: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)),
                  })
                }
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
                placeholder="Same as adult"
              />
            </label>
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={extrasOn}
              onChange={(e) => updateEvent(eventId, { extraShirtsEnabled: e.target.checked })}
            />
            Allow extra T-shirts
          </label>
          {extrasOn && (
            <label className="mt-2 block text-[11px] font-medium text-ink/80">
              Most extras one RSVP can add (up to {MAX_EXTRA_SHIRTS})
              <input
                type="number"
                min={0}
                max={MAX_EXTRA_SHIRTS}
                step={1}
                value={cap}
                onChange={(e) =>
                  updateEvent(eventId, {
                    maxExtraShirtsPerRsvp: Math.max(0, Math.min(MAX_EXTRA_SHIRTS, Math.floor(Number(e.target.value) || 0))),
                  })
                }
                className="mt-1 w-28 rounded-lg border border-ink/15 px-3 py-2 text-sm"
              />
            </label>
          )}

          <p className="mt-3 rounded-lg bg-secondary/60 px-3 py-2 text-[11px] text-ink/75">
            Example: two adults at {formatMoney(event.paymentAmount ?? 0, currency)} each plus two adult shirts at{" "}
            {formatMoney(adult, currency)} comes to{" "}
            <strong>{formatMoney((event.paymentAmount ?? 0) * 2 + adult * 2, currency)}</strong>.
            {youth !== adult ? ` A youth shirt is ${formatMoney(youth, currency)}.` : ""}
          </p>
        </>
      )}
    </div>
  );
}


// Which attendee categories this event accepts. Adults are always on: an
// event with nobody attending makes no sense. Kids and pets are independent
// host choices. Turning one off only hides the field going forward, counts
// guests already submitted stay on the record.
function AttendeeCategoriesCard({ event, eventId }: { event: KEvent; eventId: string }) {
  const kidsOn = kidsAllowed(event);
  const petsOn = petsAllowed(event);
  return (
    <div className="rounded-xl border border-ink/10 bg-secondary/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Who can be counted</p>
      <p className="text-[11px] text-muted-foreground">
        Choose which attendee types guests can add to their RSVP. Adults are always on. Turning one off
        hides that field for guests, it never deletes counts already submitted.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked disabled aria-label="Adults are always counted" />
          Adults (always on)
        </span>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={kidsOn}
            onChange={(e) => updateEvent(eventId, { kidsEnabled: e.target.checked })}
          />
          Kids
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={petsOn}
            onChange={(e) => updateEvent(eventId, { petsEnabled: e.target.checked })}
          />
          Pets
        </label>
      </div>
      {petsOn && (
        <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Max pets per guest
          <input
            type="number"
            min={0}
            max={MAX_PETS_PER_GUEST}
            value={maxPetsPerGuest(event)}
            onChange={(e) =>
              updateEvent(eventId, {
                maxPetsPerGuest: Math.max(
                  0,
                  Math.min(MAX_PETS_PER_GUEST, Math.floor(Number(e.target.value) || 0)),
                ),
              })
            }
            className="w-16 rounded-md border border-ink/10 bg-secondary px-2 py-1 text-sm focus:outline-none"
          />
          <span className="text-[11px]">
            Pets never count towards headcount or capacity, so this is just a sanity limit (max{" "}
            {MAX_PETS_PER_GUEST}).
          </span>
        </label>
      )}
      {!petsOn && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          This only removes the casual "bringing my pet" option. It is not a block on service or
          assistance animals, guests can still tell you about one in the accessibility notes on their RSVP.
        </p>
      )}
    </div>
  );
}


function GuestsStep({ event, eventId, setStepIdx }: { event: KEvent; eventId: string; setStepIdx: (i: number) => void }) {
  const guestNameRef = useRef<HTMLInputElement>(null);

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestAddress, setGuestAddress] = useState("");
  const [guestCategory, setGuestCategory] = useState<GuestCategory>("adult");
  const [guestAdults, setGuestAdults] = useState(1);
  const [guestKids, setGuestKids] = useState(0);
  const [guestPets, setGuestPets] = useState(0);
  const addKidsOn = kidsAllowed(event);
  const addPetsOn = petsAllowed(event);
  const [consent, setConsent] = useState(false);


  const c = rsvpCounts(event);

  // Filter state lives in the URL so a filtered guest list is shareable and
  // survives a refresh or a tab switch away from the guests step.
  const search = Route.useSearch();
  const navigate = useNavigate();
  const filters = useMemo(() => parseGuestFilters(search as Record<string, unknown>), [search]);
  const setFilters = useCallback(
    (patch: Partial<GuestFilterState>) => {
      const next = { ...filters, ...patch };
      navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          ...serializeGuestFilters(next),
        }),
        replace: true,
        resetScroll: false,
      });
    },
    [filters, navigate],
  );
  const visibleGuests = useMemo(() => filterSortGuests(event, filters), [event, filters]);
  const [rowLimit, setRowLimit] = useState(50);
  useEffect(() => {
    setRowLimit(50);
  }, [filters]);
  const renderedGuests = useMemo(() => visibleGuests.slice(0, rowLimit), [visibleGuests, rowLimit]);
  // Long guest lists were unreadable because every row printed address, diet,
  // accessibility, shirt sizes and payment history at once. Rows are compact by
  // default and expand individually, or all at once from the header toggle.
  const [expandAll, setExpandAll] = useState(false);

  const tier = useTier();
  const HOST_GUEST_LIMIT = 150;
  const WHISPER_GUEST_LIMIT = 25;
  const POSTCARD_GUEST_LIMIT = 25;
  const ATELIER_TRIAL_GUEST_LIMIT = 20;
  const guestLimit =
    tier === "trial" ? ATELIER_TRIAL_GUEST_LIMIT
    : tier === "postcard" ? POSTCARD_GUEST_LIMIT
    : tier === "whisper" ? WHISPER_GUEST_LIMIT
    : tier === "host" ? HOST_GUEST_LIMIT
    : null;
  const atCap = guestLimit !== null && event.guests.length >= guestLimit;

  // The host's plus-ones allowance is a headcount rule, not just a cap on named
  // plus-ones: a guest may represent themselves plus their allowance. Hosts face
  // the same ceiling their own setting implies, so the guest list and the RSVP
  // form can never disagree about how big one party may be.
  const plusOnesAllowedHere = Math.max(0, Math.min(MAX_PLUS_ONES, Number(event.plusOnesAllowed ?? 0)));
  const addHeadCeiling = maxPartyHeads(event);

  async function onAddGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName) return;
    if (!consent) return;
    if (!guestEmail && !guestPhone) {
      toast("Please provide an email, a phone number, or both.");
      return;
    }
    if (atCap && guestLimit !== null) {
      const upgradeTo = tier === "postcard" ? "Whisper, Host or Atelier" : tier === "whisper" ? "Host or Atelier" : "Atelier";
      const planName = tier === "trial" ? "Atelier trial" : tier === "postcard" ? "Postcard" : tier === "whisper" ? "Whisper" : "Host";
      toast(
        `Your ${planName} plan is limited to ${guestLimit} guests per event. Upgrade to ${upgradeTo} for more.`,
      );
      return;
    }
    let adultsCount = clampPartyCount(guestAdults);
    // Categories the host switched off never get written, even if a stale
    // counter is still sitting in local state.
    let kidsCount = addKidsOn ? clampPartyCount(guestKids) : 0;
    const petsCount = addPetsOn ? clampPets(guestPets, event) : 0;

    // Authoritative version of the field-level ceiling above.
    if (guestCategory !== "pet" && adultsCount + kidsCount > addHeadCeiling) {
      adultsCount = Math.min(adultsCount, addHeadCeiling);
      kidsCount = clampPartyCount(addHeadCeiling - adultsCount);
      toast(
        `Party size is capped at ${addHeadCeiling} per guest by your plus-ones setting, so this was trimmed to ${adultsCount} adult${adultsCount === 1 ? "" : "s"}${kidsCount > 0 ? ` and ${kidsCount} kid${kidsCount === 1 ? "" : "s"}` : ""}.`,
      );
    }

    // Capacity is the host's own cap, so they keep an override — but they get a
    // warning first, because guests are hard-blocked (or waitlisted) by the
    // server at the same threshold. The warning measures against everyone who
    // has NOT declined (invited + maybe + yes), not just confirmed yeses:
    // otherwise a host can build a list far over capacity with no warning and
    // the overflow silently becomes the guests' problem at RSVP time.
    const capacity = Number(event.capacity ?? 0);
    if (capacity > 0) {
      const committed = committedHeadcount(event);
      const party = (adultsCount || (kidsCount === 0 ? 1 : 0)) + kidsCount;
      if (committed + party > capacity) {
        const ok = await confirmDialog({
          title: "This goes over your capacity",
          body: `You've capped this event at ${capacity} and ${committed} ${committed === 1 ? "person is" : "people are"} already invited or confirmed (declines don't count). Adding this party of ${party} would take you to ${committed + party}. Guests RSVPing themselves are blocked or waitlisted once the confirmed count reaches ${capacity}.`,
          confirmLabel: "Add anyway",
          cancelLabel: "Cancel",
        });
        if (!ok) return;
      }
    }

    // Duplicate guard: reunion committees regularly enter the same relative
    // twice, which doubles the headcount and the money owed. The host can still
    // add on purpose (real families share a phone or an email address).
    const dup = findDuplicateGuest(event.guests, {
      name: guestName,
      email: guestEmail,
      phone: guestPhone,
    });
    if (dup) {
      const ok = await confirmDialog({
        title: "This looks like someone already on your list",
        body: `${describeDuplicate(dup)} Adding a second row counts them twice in your headcount, capacity and any money owed. Add them anyway only if these really are two different people.`,
        confirmLabel: "Add anyway",
        cancelLabel: "Cancel",
      });
      if (!ok) return;
    }

    const guest = addGuest(eventId, guestName, guestEmail, guestPhone, guestAddress);
    const patch =
      guestCategory === "pet"
        ? { category: "pet" as GuestCategory, adults: 0, children: 0, pets: Math.max(1, petsCount) }
        : {
            category: (kidsCount > 0 && adultsCount === 0 ? "kid" : "adult") as GuestCategory,
            adults: adultsCount || (kidsCount === 0 ? 1 : 0),
            children: kidsCount,
            pets: petsCount,
          };
    updateGuest(eventId, guest.id, patch);
    // Atelier CRM auto-capture (silent no-op for other tiers).
    upsertContactsFromGuests({
      data: { eventId, guests: [{ name: guestName, email: guestEmail, phone: guestPhone, address: guestAddress }] },
    }).catch(() => {});
    logHostGuestConsent({ data: { eventId, source: "manual", guestCount: 1 } }).catch(() => {});
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setGuestAddress("");
    setGuestCategory("adult");
    setGuestAdults(1);
    setGuestKids(0);
    setGuestPets(0);
    setConsent(false);
  }

  // For the picker dedupe: build a Set of "email|phoneDigits|nameLower".
  const existingKeys = useMemo(
    () => new Set(
      event.guests.map((g) =>
        `${(g.email || "").toLowerCase()}|${(g.phone || "").replace(/\D/g, "")}|${g.name.toLowerCase().trim()}`,
      ),
    ),
    [event.guests],
  );

  return (
    <div className="space-y-6">
      <HelpCard>
        Add each person you want to invite. You only need an email or a phone number — both is even better.
        Mark how many adults and kids they're bringing.
      </HelpCard>

      <RsvpDeadlineCard event={event} eventId={eventId} />
      <CapacityCard event={event} eventId={eventId} />
      <PlusOnesCard event={event} eventId={eventId} />

      <WaitlistCard event={event} eventId={eventId} />

      <AttendeeCategoriesCard event={event} eventId={eventId} />
      <ShirtSizesCard event={event} eventId={eventId} />



      <GuestImportPanel event={event} eventId={eventId} />

      {(tier === "atelier" || tier === "trial" || tier === "owner") && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink/10 bg-secondary/30 p-3">
          <div className="text-xs text-muted-foreground">
            Pull guests straight from your saved Contacts.
          </div>
          <div className="ml-auto">
            <ContactsPickerButton eventId={eventId} existingKeys={existingKeys} />
          </div>
        </div>
      )}




      {guestLimit !== null && (() => {
        const planName = tier === "trial" ? "Atelier trial" : tier === "postcard" ? "Postcard" : tier === "whisper" ? "Whisper" : "Host";
        const upgradeLabel = tier === "postcard" ? "Whisper" : tier === "whisper" ? "Host" : "Atelier";
        return (
          <div
            className={`rounded-xl border p-4 text-xs ${
              atCap
                ? "border-red-300 bg-red-50 text-red-700"
                : event.guests.length >= guestLimit - 5
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-ink/10 bg-secondary/40 text-muted-foreground"
            }`}
          >
            {atCap ? (
              <>
                You've reached the {planName} plan limit of {guestLimit} guests.{" "}
                <Link to="/pricing" className="font-medium underline">Upgrade to {upgradeLabel}</Link>{" "}
                for more.
              </>
            ) : event.guests.length >= guestLimit - 5 ? (
              <>
                You're {guestLimit - event.guests.length} away from your {planName} limit.{" "}
                <Link to="/pricing" className="font-medium underline">Upgrade to {upgradeLabel}</Link>{" "}
                for more guests.
              </>
            ) : (
              <>
                {planName} · {event.guests.length} of {guestLimit} guests added.
                Need more?{" "}
                <Link to="/pricing" className="font-medium text-velvet underline">Upgrade to {upgradeLabel}</Link>.
              </>
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Invited" value={c.total} />
        <Stat label="Confirmed" value={c.yes} accent />
        <Stat label="Maybe" value={c.maybe} />
        <Stat label="Declined" value={c.no} />
      </div>

      {(() => {
        // One definition of "attending", matching the capacity meter and the
        // SQL capacity check: adults + children + named plus-ones on "yes"
        // guests. Children count toward capacity everywhere.
        const yesGuests = event.guests.filter((g) => g.status === "yes");
        let adults = 0;
        let kids = 0;
        let plusTotal = 0;
        for (const g of yesGuests) {
          adults += g.adults ?? 1;
          kids += g.children ?? 0;
          plusTotal += Array.isArray(g.plusOnes) ? g.plusOnes.length : 0;
        }
        const total = confirmedHeadcount(event);
        if (total === 0) return null;
        const parts: string[] = [`${adults} adult${adults === 1 ? "" : "s"}`];
        if (kids > 0) parts.push(`${kids} child${kids === 1 ? "" : "ren"}`);
        if (plusTotal > 0) parts.push(`${plusTotal} plus-one${plusTotal === 1 ? "" : "s"}`);
        return (
          <div className="rounded-xl border border-ink/10 bg-secondary/30 px-4 py-2 text-xs text-ink/70">
            <span className="font-medium text-ink">{total}</span> attending
            {parts.length > 1 ? ` · ${parts.join(" + ")}` : ""}
            {Number(event.capacity ?? 0) > 0 ? (
              <span className="text-ink/50">
                {" "}
                · counts toward your {Number(event.capacity)} cap, children included
              </span>
            ) : null}
          </div>
        );
      })()}



      {c.total > 0 && c.yes + c.no + c.maybe === 0 && (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 text-xs text-amber-800">
          No responses yet —{" "}
          <button
            type="button"
            onClick={() => setStepIdx(STEPS.findIndex((s) => s.id === "share"))}
            className="font-medium text-velvet underline hover:text-velvet/80"
          >
            send reminders from the Share hub
          </button>{" "}
          to collect RSVPs.
        </div>
      )}

      <form onSubmit={onAddGuest} className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-ink/5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Guest / Party name
            </label>
            <input
              ref={guestNameRef}
              required
              placeholder="e.g. Smith Family"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
            />
          </div>
          {addPetsOn && <div className="space-y-1.5">

            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Main category
            </label>
            <div className="flex rounded-md bg-secondary p-1">
              {(["adult", "pet"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setGuestCategory(cat);
                    if (cat === "pet") setGuestPets(0);
                  }}
                  className={`flex-1 rounded-sm px-3 py-1.5 text-[11px] font-medium capitalize transition ${
                    guestCategory === cat
                      ? "bg-card text-ink shadow-sm"
                      : "text-muted-foreground hover:text-ink"
                  }`}
                >
                  {cat === "adult" ? "Guest" : "Pet"}
                </button>
              ))}
            </div>
          </div>}

        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            aria-label="Guest email"
            placeholder="Email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            className="flex-1 min-w-[160px] rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
          />
          <input
            type="tel"
            aria-label="Guest cell phone"
            placeholder="Cell phone"
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            className="flex-1 min-w-[160px] rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
          />
        </div>
        <p className="-mt-1 text-[11px] text-muted-foreground">
          Add an email, a phone number, or both — you need at least one to send invites, reminders, or payment links.
        </p>

        <input
          placeholder="Mailing address (optional)"
          value={guestAddress}
          onChange={(e) => setGuestAddress(e.target.value)}
          className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
        />
        {addPetsOn && guestCategory === "pet" ? (
          <div className="flex flex-wrap items-end gap-3">
            <NumberField
              label="How many pets"
              value={guestPets}
              onChange={setGuestPets}
              min={1}
            />
          </div>
        ) : (
          <>
            <div className={`grid gap-3 ${addKidsOn && addPetsOn ? "grid-cols-3" : addKidsOn || addPetsOn ? "grid-cols-2" : "grid-cols-1"}`}>
              <NumberField
                label="Adults"
                value={guestAdults}
                onChange={setGuestAdults}
                min={0}
                max={clampPartyCount(addHeadCeiling - (addKidsOn ? guestKids : 0))}
              />
              {addKidsOn && (
                <NumberField
                  label="Kids"
                  value={guestKids}
                  onChange={setGuestKids}
                  min={0}
                  max={clampPartyCount(addHeadCeiling - guestAdults)}
                />
              )}
              {addPetsOn && (
                <NumberField
                  label="Pets"
                  value={guestPets}
                  onChange={setGuestPets}
                  min={0}
                  max={maxPetsPerGuest(event)}
                />
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              Party size is capped at {addHeadCeiling} {addHeadCeiling === 1 ? "person" : "people"} per
              guest, matching your plus-ones setting
              {plusOnesAllowedHere > 0
                ? ` (1 guest plus ${plusOnesAllowedHere})`
                : " (no plus-ones allowed)"}
              . Raise the plus-ones allowance to record bigger parties, or add another guest row.
            </p>
          </>
        )}
        <GuestConsentCheckbox checked={consent} onChange={setConsent} />
        <div className="flex">
          <button
            type="submit"
            disabled={atCap || !consent}
            title={!consent ? CONSENT_DISABLED_TOOLTIP : undefined}
            className="ml-auto h-10 rounded-md bg-velvet px-6 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add guest
          </button>
        </div>
      </form>


      <OverCapacityBanner event={event} />

      <GuestRequestsPanel event={event} eventId={eventId} />

      <label className="flex items-start gap-3 rounded-xl bg-secondary/60 p-4 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={!!event.openGuestList}
          onChange={(e) => updateEvent(eventId, { openGuestList: e.target.checked })}
        />
        <span>
          <span className="font-medium">Anyone with the link can RSVP</span>
          <span className="block text-xs text-muted-foreground">
            Best for invites you share on social or in a group text. Guests who can't find their name add
            themselves instead of waiting for your approval. Your guest cap still applies. Leave this off to
            review every request yourself.
          </span>
        </span>
      </label>

      {event.guests.length > 0 && (
        <GuestListToolbar
          event={event}
          eventId={eventId}
          filters={filters}
          setFilters={setFilters}
          visible={visibleGuests}
        />
      )}

      <div className="overflow-hidden rounded-xl ring-1 ring-ink/5">
        {event.guests.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No guests added"
            description="Add guests above, then send invitations."
            cta={{
              label: "Send invitations →",
              onClick: () => guestNameRef.current?.focus(),
            }}
            tips={[
              "Add guests one by one with email or phone.",
              "Bulk import from a CSV, spreadsheet, or phone contacts.",
              "Send invitations from the Share hub once your guest list is ready.",
            ]}
          />
        ) : visibleGuests.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No guests match your search or filters.
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_GUEST_FILTERS)}
              className="ml-2 underline hover:text-ink"
            >
              Clear filters
            </button>
          </div>
        ) : (
          (() => {
            // Waitlist position is a property of the whole list, not the filtered
            // view, so it is computed before slicing.
            const waitlistPos = new Map<string, number>();
            let waitlistIdx = 0;
            for (const g of event.guests) {
              if (g.status === "waitlisted") waitlistPos.set(g.id, ++waitlistIdx);
            }
            return renderedGuests.map((g) => (
              <GuestRow
                key={g.id}
                guest={g}
                eventId={eventId}
                paymentEnabled={!!event.paymentEnabled}
                waitlistPosition={waitlistPos.get(g.id)}
                shirtSizesEnabled={!!event.tshirtSizesEnabled}
                shirtSizesLocked={!!event.tshirtSizesLocked}
                defaultOpen={expandAll}
              />
            ));
          })()
        )}

        {visibleGuests.length > 0 && (
          <div className="flex items-center justify-end border-t border-ink/10 bg-secondary/20 px-4 py-2">
            <button
              type="button"
              onClick={() => setExpandAll((v) => !v)}
              className="text-[11px] font-medium text-muted-foreground underline hover:text-ink"
            >
              {expandAll ? "Collapse all details" : "Expand all details"}
            </button>
          </div>
        )}

        {renderedGuests.length < visibleGuests.length && (
          <button
            type="button"
            onClick={() => setRowLimit((n) => n + 50)}
            className="w-full border-t border-ink/10 bg-secondary/40 py-3 text-[12px] font-medium text-ink hover:bg-secondary"
          >
            Show 50 more ({visibleGuests.length - renderedGuests.length} still hidden)
          </button>
        )}
      </div>
    </div>
  );
}

type LinkedProject = { id: string; name: string; description: string | null; color: string | null; updated_at: string };

function SummaryStep({ event, eventId }: { event: KEvent; eventId: string }) {
  const d = formatEventDate(event.date, event.timezone);
  const c = rsvpCounts(event);
  const [projects, setProjects] = useState<LinkedProject[]>([]);
  const [bringItems, setBringItems] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase
      .from("pm_projects")
      .select("id,name,description,color,updated_at")
      .eq("event_id", eventId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        if (alive) setProjects((data as LinkedProject[]) ?? []);
      });
    return () => {
      alive = false;
    };
  }, [eventId]);

  useEffect(() => {
    let alive = true;
    import("@/lib/bring-sheet.functions")
      .then(({ listBringItems }) => listBringItems({ data: { eventId } }))
      .then((r) => {
        if (alive) setBringItems(r.items.length);
      })
      .catch(() => {
        /* sheet not in use */
      });
    return () => {
      alive = false;
    };
  }, [eventId]);

  return (
    <div className="space-y-6">
      <HelpCard>
        You're all set! Look over the highlights below. If something's off, tap any step at the top to jump
        back. When you're happy, hit <strong>Save &amp; finish</strong> — or send the invitations now.
      </HelpCard>

      <CompletionMoment
        eventId={eventId}
        moment={buildEventReadyMoment(
          {
            guests: c.total,
            confirmed: c.yes,
            hasPhoto: !!event.image,
            registryLinks: (event.registry ?? []).length,
            remindersSet: (event.reminderPresetIds ?? []).length,
            bringItems,
          },
          event.title,
        )}
      />

      <EmailInvitationsCard event={event} />

      <GuestNotesQuickLink eventId={eventId} />

      <EventSeriesPanel event={event} eventId={eventId} />




      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-ink/5 bg-card p-5">
          <h3 className="font-serif text-xl">At a glance</h3>
          <dl className="mt-4 space-y-2 text-sm">
            <Row k="Event" v={event.title} />
            <Row
              k="When"
              v={
                <EventTimeWithViewerHint
                  date={event.date}
                  timezone={event.timezone}
                  className="text-right"
                  primaryClassName="text-sm font-medium leading-snug"
                  hintClassName="mt-1 text-xs text-muted-foreground"
                />
              }
            />
            <Row k="Where" v={[event.venue, event.address].filter(Boolean).join(" — ") || "—"} />
            <Row k="Dress code" v={event.dressCode || "—"} />
            <Row k="Hashtag" v={event.hashtag ? `#${event.hashtag}` : "—"} />
            <Row k="Registry links" v={String((event.registry ?? []).length)} />
            <Row k="Reminders set" v={String((event.reminderPresetIds ?? []).length)} />
            <Row k="Collecting payment" v={event.paymentEnabled ? "Yes" : "No"} />
          </dl>
          {/* Venue-zone anchored .ics, matching the venue-time display model. */}
          <AddEventToCalendarButton
            className="mt-4"
            eventId={event.id}
            title={event.title}
            date={event.date}
            timezone={event.timezone}
            venue={event.venue}
            address={event.address}
            description={event.message || event.description}
            inviteHref={`/invite/${event.id}`}
          />
        </div>


        <WhosComingPanel counts={c} eventId={eventId} />
      </div>

      <div id="event-reports" className="scroll-mt-24 space-y-5">
        <ReportsPanel event={event} eventId={eventId} />
        <MasterGuestReportPanel event={event} eventId={eventId} />
      </div>
      <LinkedProjectsPanel eventId={eventId} projects={projects} eventTitle={event.title} />
      <ReviewsReport event={event} />
      <InvitePreviewWithPrint event={event} />
    </div>
  );
}

function LinkedProjectsPanel({ eventId, projects, eventTitle }: { eventId: string; projects: LinkedProject[]; eventTitle: string }) {
  return (
    <div className="rounded-xl border border-ink/5 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl">Project Management</h3>
          <p className="text-xs text-muted-foreground">Projects attached to this event appear here and inside Projects.</p>
        </div>
        <Link
          to="/projects"
          className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white hover:opacity-90"
        >
          Open Projects
        </Link>
      </div>
      <div className="mt-4 space-y-2">
        {projects.length === 0 ? (
          <div className="rounded-lg bg-secondary/50 p-4 text-sm text-muted-foreground">
            No project is attached to {eventTitle} yet. Open Projects, create or open a project, then choose this event under Event integration.
          </div>
        ) : (
          projects.map((project) => (
            <Link
              key={project.id}
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className="flex items-center justify-between rounded-lg bg-secondary/50 p-4 transition hover:bg-secondary"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: project.color ?? "#3B82F6" }} />
                <div className="min-w-0">
                  <div className="font-medium">{project.name}</div>
                  {project.description && <div className="line-clamp-1 text-xs text-muted-foreground">{project.description}</div>}
                </div>
              </div>
              <span className="text-xs text-velvet">Manage →</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function ReviewsReport({ event }: { event: KEvent }) {
  const reviews = event.reviews ?? [];
  const stats = reviewStats(event);

  function exportReviewsCsv() {
    const rows: (string | number | undefined)[][] = [
      ["Name", "Email", "Rating", "Comment", "Date"],
      ...reviews.map((r) => [
        r.name,
        r.guestEmail ?? "",
        r.rating,
        r.comment,
        formatTimestamp((r.createdAt)),
      ]),
    ];
    downloadCsv(`${event.title.replace(/\W+/g, "_")}-reviews.csv`, rows);
  }

  function printReport() {
    exportReviewsPdf(event, reviews, stats);
  }


  return (
    <div className="rounded-xl border border-ink/5 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-xl">Reviews & ratings</h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Customer feedback</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-velvet/5 p-4 ring-1 ring-velvet/15">
          <div className="text-4xl font-medium text-velvet">{stats.average.toFixed(1)}</div>
          <div className="mt-1 text-amber-500 text-lg tracking-widest">
            {"★".repeat(Math.round(stats.average))}
            <span className="text-ink/15">{"★".repeat(5 - Math.round(stats.average))}</span>
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">
            {stats.count} {stats.count === 1 ? "review" : "reviews"} collected
          </div>
        </div>
        <div className="sm:col-span-2 rounded-lg bg-secondary/40 p-4 ring-1 ring-ink/5">
          {[5, 4, 3, 2, 1].map((star) => {
            const n = stats.distribution[star - 1];
            const pct = stats.count === 0 ? 0 : (n / stats.count) * 100;
            return (
              <div key={star} className="flex items-center gap-2 text-xs">
                <span className="w-6 text-muted-foreground">{star}★</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/5">
                  <div className="h-full bg-velvet transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 text-right tabular-nums text-muted-foreground">{n}</span>
              </div>
            );
          })}
        </div>
      </div>

      {reviews.length > 0 && (
        <div className="mt-5 max-h-64 space-y-2 overflow-y-auto pr-1">
          {reviews.map((r) => (
            <div key={r.id} className="group flex items-start justify-between gap-3 rounded-lg bg-secondary/30 p-3 text-sm">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-amber-500">{"★".repeat(r.rating)}<span className="text-ink/15">{"★".repeat(5 - r.rating)}</span></span>
                  <span className="text-[10px] text-muted-foreground">{formatStampDate((r.createdAt))}</span>
                </div>
                <p className="mt-1 text-ink/75">{r.comment}</p>
              </div>
              <button
                onClick={async () => { if (await confirmDialog({ title: "Remove this review?" })) removeReview(event.id, r.id); }}
                className="text-[11px] text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={printReport}
          className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-velvet"
        >
          📄 Download reviews PDF
        </button>
        <button
          onClick={exportReviewsCsv}
          disabled={reviews.length === 0}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-secondary disabled:opacity-40"
        >
          Export reviews CSV
        </button>
        <Link
          to="/invite/$eventId"
          params={{ eventId: event.id }}
          target="_blank"
          className="rounded-full px-3 py-1.5 text-xs font-medium text-velvet ring-1 ring-velvet/30 hover:bg-velvet/5"
        >
          Open guest review form →
        </Link>
      </div>
    </div>
  );
}



function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-ink/5 pb-2 last:border-b-0">
      <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">{k}</dt>
      <dd className="max-w-[60%] text-right">{v}</dd>
    </div>
  );
}

/**
 * Turns the summary tiles into filters for the guest list. Selections live in
 * the URL (`?rsvp2=` / `?has=`) so a filtered view is shareable, survives a
 * refresh, and the filter-aware exports pick it up unchanged.
 */
function useTileFilters(eventId: string) {
  const navigate = useNavigate();
  const search = Route.useSearch() as { rsvp2?: string; has?: string };
  const selected = (search.rsvp2 ?? "").split(",").filter(Boolean);
  const has = search.has ?? "";
  const push = (patch: Record<string, unknown>) => {
    void navigate({
      to: "/events/$eventId",
      params: { eventId },
      search: (prev: Record<string, unknown>) => ({ ...prev, step: "guests", ...patch }),
      replace: true,
    } as never);
  };
  return {
    selected,
    has,
    active: selected.length > 0 || has !== "",
    isOn: (v: string) => selected.includes(v),
    toggleRsvp: (v: string) => {
      const next = selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v];
      push({ rsvp2: next.length ? next.join(",") : undefined, rsvp: undefined });
    },
    toggleHas: (v: string) => push({ has: has === v ? undefined : v }),
    clear: () => push({ rsvp2: undefined, rsvp: undefined, has: undefined }),
  };
}

/** "Who's coming" tiles: each one filters the guest list below. */
function WhosComingPanel({
  counts,
  eventId,
}: {
  counts: { total: number; yes: number; maybe: number; no: number; adults: number; children: number; pets: number; attendees: number };
  eventId: string;
}) {
  const t = useTileFilters(eventId);
  return (
    <div className="rounded-xl border border-ink/5 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-xl">Who's coming</h3>
        <span className="text-[11px] text-muted-foreground">Tap a tile to filter your guest list</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Invited" value={counts.total} activeNote="Showing all" active={!t.active} onClick={t.clear} />
        <Stat label="Confirmed" value={counts.yes} active={t.isOn("yes")} onClick={() => t.toggleRsvp("yes")} />
        <Stat label="Maybe" value={counts.maybe} active={t.isOn("maybe")} onClick={() => t.toggleRsvp("maybe")} />
        <Stat label="Declined" value={counts.no} active={t.isOn("no")} onClick={() => t.toggleRsvp("no")} />
        <Stat label="Adults" value={counts.adults} active={t.has === "adults"} onClick={() => t.toggleHas("adults")} />
        <Stat label="Children" value={counts.children} active={t.has === "kids"} onClick={() => t.toggleHas("kids")} />
        <Stat label="Pets" value={counts.pets} active={t.has === "pets"} onClick={() => t.toggleHas("pets")} />
      </div>
      <div className="mt-3 rounded-lg bg-ink/95 p-3 text-center text-white">
        <div className="text-2xl font-medium">{counts.attendees}</div>
        <div className="text-[10px] uppercase tracking-widest text-white/70">Total attendees</div>
      </div>
      {t.active ? (
        <button
          type="button"
          onClick={t.clear}
          className="mt-3 min-h-[44px] w-full rounded-full bg-ink px-4 text-xs font-medium text-white hover:bg-velvet"
        >
          Clear guest list filters
        </button>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  active,
  activeNote,
  onClick,
}: {
  label: string;
  value: number;
  accent?: boolean;
  active?: boolean;
  activeNote?: string;
  onClick?: () => void;
}) {
  const cls = `min-h-[44px] rounded-lg p-3 text-left ring-1 transition ${
    active
      ? "bg-velvet text-white ring-velvet shadow-sm"
      : accent
        ? "bg-velvet/90 text-white ring-ink/5"
        : "bg-card ring-ink/5"
  } ${onClick && !active ? "hover:ring-velvet/60" : ""}`;
  const light = active || accent;
  const inner = (
    <>
      <div className="text-2xl font-medium">{value}</div>
      <div className={`text-[10px] uppercase tracking-widest ${light ? "text-white/70" : "text-muted-foreground"}`}>
        {label}
      </div>
      {active ? (
        <div className="text-[10px] font-semibold uppercase tracking-wider">{activeNote ?? "Filtering ✓"}</div>
      ) : null}
    </>
  );
  if (!onClick) return <div className={cls}>{inner}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={!!active} title={`Show only ${label}`} className={cls}>
      {inner}
    </button>
  );
}

function RsvpToggle({
  status,
  onChange,
}: {
  status: RsvpStatus;
  onChange: (s: RsvpStatus) => void;
}) {
  const opts: { value: RsvpStatus; label: string }[] = [
    { value: "yes", label: "Yes" },
    { value: "maybe", label: "Maybe" },
    { value: "no", label: "No" },
    { value: "pending", label: "—" },
  ];
  return (
    <div className="flex overflow-hidden rounded-md ring-1 ring-ink/10">
      {opts.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
            status === o.value
              ? "bg-ink text-white"
              : "bg-card text-muted-foreground hover:bg-secondary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const GuestRow = memo(function GuestRow({ guest, eventId, paymentEnabled, waitlistPosition, shirtSizesEnabled, shirtSizesLocked, defaultOpen }: { guest: Guest; eventId: string; paymentEnabled: boolean; waitlistPosition?: number; shirtSizesEnabled?: boolean; shirtSizesLocked?: boolean; defaultOpen?: boolean }) {
  const smsOptOutSet = useSmsOptOutSet();
  const isSmsOptedOut = !!guest.phone && smsOptOutSet.has(normalizePhone(guest.phone));
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(!!defaultOpen);
  // The header toggle wins whenever the host flips it, per-row clicks after that.
  useEffect(() => {
    setOpen(!!defaultOpen);
  }, [defaultOpen]);
  const [editName, setEditName] = useState(guest.name);
  const [editEmail, setEditEmail] = useState(guest.email);
  const [editPhone, setEditPhone] = useState(guest.phone);
  const [editAddress, setEditAddress] = useState(guest.address ?? "");
  const [editAdults, setEditAdults] = useState(guest.adults ?? 1);
  const [editChildren, setEditChildren] = useState(guest.children ?? 0);
  const [editPets, setEditPets] = useState(guest.pets ?? 0);
  const [editCategory, setEditCategory] = useState<GuestCategory>(guest.category ?? "adult");
  const [editDietary, setEditDietary] = useState(guest.dietary ?? "");
  const [editShirtSize, setEditShirtSize] = useState(guest.shirtSize ?? "");
  const shirtSizeEditable = !!shirtSizesEnabled && !shirtSizesLocked;
  const parentEvent = useEvent(eventId);
  const petsOn = parentEvent ? petsAllowed(parentEvent) : true;
  const kidsOn = parentEvent ? kidsAllowed(parentEvent) : true;
  const [resending, setResending] = useState(false);

  /**
   * Resends this guest's own invitation. The server reuses the guest id, so the
   * personal link (and therefore any answer already recorded) is preserved.
   */
  async function resendInvitation() {
    if (!guest.email) return;
    const ok = await confirmDialog({
      title: `Resend the invitation to ${guest.name || guest.email}?`,
      body: guest.invitedAt
        ? `Last sent ${formatStampDate(guest.invitedAt)}. They keep the same personal link, so any answer they already gave stays attached. Email cannot be recalled once sent.`
        : "They keep the same personal link, so any answer they already gave stays attached. Email cannot be recalled once sent.",
      confirmLabel: "Resend invitation",
      tone: "info",
    });
    if (!ok) return;
    setResending(true);
    try {
      const res = await sendEventInvites({
        data: { eventId, resend: true, guestIds: [guest.id] },
      });
      if (res.sent > 0) toast.success(`Invitation resent to ${guest.name || guest.email}`);
      else toast.error("That invitation could not be sent. Check the email address and try again.");
    } catch {
      toast.error("Could not resend the invitation. Check your connection and try again.");
    } finally {
      setResending(false);
    }
  }


  // Same headcount rule the RSVP form uses: one guest row represents at most
  // the guest plus the host's plus-ones allowance. Named plus-ones already on
  // the row count toward it, and an existing oversized party is never dragged
  // down by the ceiling — it just cannot grow.
  const namedPlusOnes = Array.isArray(guest.plusOnes) ? guest.plusOnes.length : 0;
  const editHeadCeiling = Math.max(
    parentEvent ? maxPartyHeads(parentEvent) : MAX_PARTY_COUNT,
    partyHeadcount(guest),
  );
  const editAdultsMax = clampPartyCount(editHeadCeiling - editChildren - namedPlusOnes);
  const editChildrenMax = clampPartyCount(editHeadCeiling - editAdults - namedPlusOnes);
  const editPetsMax = parentEvent ? maxPetsPerGuest(parentEvent) : MAX_PETS_PER_GUEST;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editName) return;
    if (!editEmail && !editPhone) {
      toast("Please provide an email, a phone number, or both.");
      return;
    }
    // Editing a party size is the same escape valve as adding a guest, so it
    // gets the same warning against everyone who has not declined.
    const capacity = Number(parentEvent?.capacity ?? 0);
    if (parentEvent && capacity > 0 && guest.status !== "no" && guest.status !== "waitlisted") {
      const others = committedHeadcount(parentEvent, guest.id);
      const party = Math.max(0, editAdults) + Math.max(0, editChildren) + (Array.isArray(guest.plusOnes) ? guest.plusOnes.length : 0);
      if (others + party > capacity && party > partyHeadcount(guest)) {
        const ok = await confirmDialog({
          title: "This goes over your capacity",
          body: `You've capped this event at ${capacity}. With this change you'd be at ${others + party} people invited or confirmed (declines don't count). Guests RSVPing themselves are blocked or waitlisted once the confirmed count reaches ${capacity}.`,
          confirmLabel: "Save anyway",
          cancelLabel: "Cancel",
        });
        if (!ok) return;
      }
    }
    updateGuest(eventId, guest.id, {
      name: editName,
      email: editEmail,
      phone: editPhone,
      address: editAddress,
      category: editCategory,
      adults: editAdults,
      children: editChildren,
      pets: editPets,
      dietary: editDietary,
      ...(shirtSizeEditable ? { shirtSize: editShirtSize || undefined } : {}),
    });
    // Atelier CRM auto-capture (silent no-op for other tiers) — a direct
    // correction here previously never reached the linked Contacts record,
    // so a typo'd email fixed on the guest list stayed wrong in the CRM forever.
    upsertContactsFromGuests({
      data: { eventId, guests: [{ name: editName, email: editEmail, phone: editPhone, address: editAddress }] },
    }).catch(() => {});
    setEditing(false);
  }

  if (editing) {
    return (
      <form
        onSubmit={onSave}
        className="flex flex-col gap-2 border-b border-ink/5 bg-card p-4 last:border-b-0"
      >
        <input
          required
          placeholder="Name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            placeholder="Email"
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
            className="flex-1 min-w-[140px] rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
          />
          <input
            type="tel"
            placeholder="Cell phone"
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
            className="flex-1 min-w-[140px] rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
          />
        </div>
        <input
          placeholder="Mailing address (optional)"
          value={editAddress}
          onChange={(e) => setEditAddress(e.target.value)}
          className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          {petsOn && (
            <div className="flex rounded-md bg-secondary p-1">
              {(["adult", "pet"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setEditCategory(cat)}
                  className={`rounded-sm px-3 py-1 text-[11px] font-medium capitalize transition ${
                    editCategory === cat ? "bg-card text-ink shadow-sm" : "text-muted-foreground hover:text-ink"
                  }`}
                >
                  {cat === "adult" ? "Guest" : "Pet"}
                </button>
              ))}
            </div>
          )}
          {petsOn && editCategory === "pet" ? (
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              Pets
              <input
                type="number"
                min={0}
                max={editPetsMax}
                value={editPets}
                onChange={(e) => setEditPets(Math.min(editPetsMax, clampPartyCount(Number(e.target.value) || 0)))}
                className="w-16 rounded-md bg-secondary px-2 py-1 text-sm focus:outline-none"
              />
            </label>
          ) : (
            <>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                Adults
                <input
                  type="number"
                  min={0}
                  max={editAdultsMax}
                  value={editAdults}
                  onChange={(e) =>
                    setEditAdults(Math.min(editAdultsMax, clampPartyCount(Number(e.target.value) || 0)))
                  }
                  className="w-16 rounded-md bg-secondary px-2 py-1 text-sm focus:outline-none"
                />
              </label>
              {kidsOn && (
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  Kids
                  <input
                    type="number"
                    min={0}
                    max={editChildrenMax}
                    value={editChildren}
                    onChange={(e) =>
                      setEditChildren(Math.min(editChildrenMax, clampPartyCount(Number(e.target.value) || 0)))
                    }
                    className="w-16 rounded-md bg-secondary px-2 py-1 text-sm focus:outline-none"
                  />
                </label>
              )}
              {petsOn && (
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  Pets
                  <input
                    type="number"
                    min={0}
                    max={editPetsMax}
                    value={editPets}
                    onChange={(e) => setEditPets(Math.min(editPetsMax, clampPartyCount(Number(e.target.value) || 0)))}
                    className="w-16 rounded-md bg-secondary px-2 py-1 text-sm focus:outline-none"
                  />
                </label>
              )}
            </>
          )}
        </div>

        <input
          placeholder="Dietary / accessibility notes (optional)"
          value={editDietary}
          onChange={(e) => setEditDietary(e.target.value)}
          className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
        />
        {shirtSizesEnabled && (
          <label className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            T-shirt size
            {shirtSizeEditable ? (
              <select
                value={editShirtSize}
                onChange={(e) => setEditShirtSize(e.target.value)}
                className="rounded-md bg-secondary px-2 py-1.5 text-sm text-ink focus:outline-none"
              >
                <option value="">Not set</option>
                {SHIRT_SIZES.map((sz) => (
                  <option key={sz} value={sz}>{SHIRT_SIZE_LABELS[sz]}</option>
                ))}
              </select>
            ) : (
              <span className="text-ink/80">
                {shirtSizeLabel(guest.shirtSize) || "Not set"} · locked
              </span>
            )}
          </label>
        )}
        <div className="flex items-center gap-2">
          <button type="submit" className="rounded-md bg-velvet px-3 py-1.5 text-xs font-medium text-white">
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditName(guest.name);
              setEditEmail(guest.email);
              setEditPhone(guest.phone);
              setEditAddress(guest.address ?? "");
              setEditing(false);
            }}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div data-testid="guest-row" className="flex flex-col gap-2 border-b border-ink/5 bg-card p-4 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-[10px] font-medium">
            {initials(guest.name)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{guest.name}</span>
              {guest.status === "waitlisted" && waitlistPosition ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                  Waitlist #{waitlistPosition}
                </span>
              ) : null}
            </div>


            <div className="text-xs text-muted-foreground">
              {[guest.email, guest.phone].filter(Boolean).join(" · ") || "No contact"}
              {isSmsOptedOut ? (
                <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground line-through decoration-muted-foreground/60">
                  SMS opted out
                </span>
              ) : null}
            </div>
            {open && guest.address ? (
              <div className="text-[11px] text-muted-foreground/80 italic mt-0.5">{guest.address}</div>
            ) : null}
            {/* One party line, one source of truth. The old card stacked a
                "+1" chip, an "ADULT" chip and a separate "1 adult · 2 kids"
                line, so nobody could tell how many people were actually
                coming. This states the real total in plain language, using the
                same billableAdults / partyMemberCount numbers the seating
                chart and billing use. */}
            <div className="mt-0.5 text-[13px] text-ink/80">
              {(() => {
                const total = partyMemberCount(guest);
                const a = billableAdults(guest);
                const k = billableChildren(guest);
                const p = Math.max(0, guest.pets ?? 0);
                const parts: string[] = [];
                if (a) parts.push(`${a} adult${a === 1 ? "" : "s"}`);
                if (k) parts.push(`${k} kid${k === 1 ? "" : "s"}`);
                if (p) parts.push(`${p} pet${p === 1 ? "" : "s"}`);
                const head = `${total} guest${total === 1 ? "" : "s"}`;
                return parts.length > 1 ? `${head} — ${parts.join(", ")}` : parts[0] || head;
              })()}
            </div>

            {open ? (
              <>
            {guest.dietary ? (
              <div className="mt-0.5 text-[11px] text-amber-700">🍽 {guest.dietary}</div>
            ) : null}
            {(guest as { accessibilityNotes?: string }).accessibilityNotes ? (
              <div className="mt-0.5 text-[11px] text-sky-700">
                ♿ {(guest as { accessibilityNotes?: string }).accessibilityNotes}
              </div>
            ) : null}
            {(Array.isArray(guest.plusOnes) ? guest.plusOnes : []).some(
              (p) => (p as { dietary?: string; accessibility?: string }).dietary || (p as { dietary?: string; accessibility?: string }).accessibility,
            ) ? (
              <div className="mt-0.5 text-[11px] text-ink/70">
                {(Array.isArray(guest.plusOnes) ? guest.plusOnes : [])
                  .filter((p) => (p as { dietary?: string; accessibility?: string }).dietary || (p as { dietary?: string; accessibility?: string }).accessibility)
                  .map((p) => {
                    const x = p as { name?: string; dietary?: string; accessibility?: string };
                    return `${x.name || "plus-one"}: ${[x.dietary, x.accessibility].filter(Boolean).join(" / ")}`;
                  })
                  .join(" · ")}
              </div>
            ) : null}
            {shirtSizesEnabled && (guest.shirtSize || (Array.isArray(guest.plusOnes) && guest.plusOnes.some((p) => p.shirtSize))) ? (
              <div className="mt-0.5 text-[11px] text-ink/70">
                👕 {[
                  shirtSizeLabel(guest.shirtSize) || "no size",
                  ...(Array.isArray(guest.plusOnes) ? guest.plusOnes : []).map(
                    (p) => `${p.name || "plus-one"}: ${shirtSizeLabel(p.shirtSize) || "no size"}`,
                  ),
                ].join(" · ")}
              </div>
            ) : null}
            {guest.invitedAt ? (
              <div className="mt-0.5 text-[11px] text-emerald-700">
                ✉ Invited {formatStampDate((guest.invitedAt))}
              </div>
            ) : null}
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <RsvpToggle status={guest.status} onChange={(s) => setRsvp(eventId, guest.id, s)} />
          {guest.email ? (
            <button
              type="button"
              onClick={resendInvitation}
              disabled={resending}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-ink disabled:opacity-50"
              title={
                guest.invitedAt
                  ? `Last sent ${formatStampDate(guest.invitedAt)}`
                  : "Not sent yet"
              }
              aria-label={`Resend the invitation to ${guest.name || guest.email}`}
            >
              {resending ? "Sending…" : "Resend"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-11 items-center rounded-md px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-ink"
            aria-expanded={open}
            aria-label={open ? `Hide details for ${guest.name}` : `Show details for ${guest.name}`}
          >
            {open ? "Less" : "Details"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="grid h-11 w-11 place-items-center rounded-md text-xs text-muted-foreground hover:bg-secondary hover:text-ink"
            aria-label="Edit guest"
            title="Edit"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          </button>
          <button
            type="button"
            onClick={async () => {
              const who = guest.name?.trim() || "this guest";
              const ok = await confirmDialog({
                title: `Remove ${who} from your guest list?`,
                body: "Their RSVP and notes go away too. You can undo this for a few seconds.",
                confirmLabel: "Yes, remove them",
              });
              if (!ok) return;
              const snapshot = { ...guest };
              undoableAction({
                label: `Removed ${who}`,
                description: "Tap Undo to put them back.",
                commit: () => removeGuest(eventId, guest.id),
                undo: () => restoreGuest(eventId, snapshot),
              });
            }}
            className="grid h-11 w-11 place-items-center rounded-md text-base text-muted-foreground hover:bg-secondary hover:text-destructive"
            aria-label="Remove guest"
            title="Remove"
          >
            ×
          </button>
        </div>
      </div>
      {paymentEnabled && open ? <GuestPaymentRow eventId={eventId} guest={guest} /> : null}
    </div>
  );
});

/** USD is the house currency for this product; keep formatting in one place. */
function money(n: number) {
  return `$${(Math.round(n * 100) / 100).toFixed(2)}`;
}

function paymentBadgeStyle(status: PaymentStatus) {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-800";
    case "partial":
      return "bg-teal-100 text-teal-800";
    case "sent":
      return "bg-blue-100 text-blue-800";
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "refunded":
      return "bg-violet-100 text-violet-800";
    case "canceled":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-secondary text-muted-foreground";
  }
}

function paymentLabel(status: PaymentStatus) {
  return ({
    not_sent: "Not sent",
    sent: "Link sent",
    pending: "Pending",
    partial: "Part paid",
    paid: "Paid",
    refunded: "Refunded",
    canceled: "Canceled",
  } as const)[status];
}

function GuestPaymentRow({ eventId, guest }: { eventId: string; guest: Guest }) {
  const event = useEvent(eventId);
  const p = guest.payment ?? { status: "not_sent" as PaymentStatus };
  const sent = p.status !== "not_sent";
  const history = paymentHistory(guest);
  const owed = event ? guestOwedAmount(event, guest) : 0;
  const collected = event ? guestCollected(event, guest) : 0;
  const refunded = refundedTotal(guest);
  const balance = Math.max(0, owed - collected);
  const [showLog, setShowLog] = useState(false);
  const [entryAmount, setEntryAmount] = useState("");
  const [entryMethod, setEntryMethod] = useState<PaymentMethod>("cash");
  const [entryNote, setEntryNote] = useState("");
  const [busy, setBusy] = useState(false);

  function submitEntry(kind: "payment" | "refund") {
    const amount = Number(entryAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter an amount first.");
      return;
    }
    const payload = { amount, method: entryMethod, note: entryNote.trim() || undefined };
    if (kind === "payment") recordPayment(eventId, guest.id, payload);
    else recordRefund(eventId, guest.id, payload);
    setEntryAmount("");
    setEntryNote("");
    toast.success(kind === "payment" ? "Payment recorded" : "Refund recorded");
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-secondary/40 px-3 py-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 font-medium ${paymentBadgeStyle(p.status)}`}>
          Payment · {paymentLabel(p.status)}
        </span>
        <span className="text-muted-foreground">
          {money(collected)} of {money(owed)}
          {balance > 0 ? ` · ${money(balance)} due` : ""}
          {refunded > 0 ? ` · ${money(refunded)} refunded` : ""}
        </span>
        {p.remindersSent ? (
          <span className="text-muted-foreground">· {p.remindersSent} reminder{p.remindersSent === 1 ? "" : "s"}</span>
        ) : null}
        <GuestDeliveryChips eventId={eventId} guestId={guest.id} />
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {!sent ? (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const summary = await sendPaymentSend({
                    eventId,
                    guestIds: [guest.id],
                    kind: "link",
                  });
                  if (summary.reachedGuestIds.length) sendPaymentLink(eventId, guest.id);
                  reportPaymentSend(summary, guest.name.split(" ")[0] || "this guest");
                  void refreshPaymentDelivery(eventId);
                } catch (err) {
                  toast.error(toUserMessage(err, "Couldn't send the payment link."));
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-full bg-velvet px-2.5 py-1 font-medium text-white hover:opacity-90 disabled:opacity-50"
              title={`Emails and texts ${guest.name || "this guest"} their payment link automatically`}
            >
              {busy ? "Sending…" : "Send payment link"}
            </button>
          ) : (
            <>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const summary = await sendPaymentSend({
                      eventId,
                      guestIds: [guest.id],
                      kind: "reminder",
                    });
                    summary.reachedGuestIds.forEach((id) => markPaymentReminderSent(eventId, id));
                    reportPaymentSend(summary, `${guest.name.split(" ")[0] || "this guest"} only`);
                    void refreshPaymentDelivery(eventId);
                  } catch (err) {
                    toast.error(toUserMessage(err, "Couldn't send the reminder."));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-full px-2.5 py-1 font-medium text-ink ring-1 ring-ink/15 hover:bg-card disabled:opacity-50"
                title={`Emails and texts one reminder to ${guest.name || "this guest"} only`}
              >
                {busy ? "Sending…" : `Remind ${guest.name.split(" ")[0] || "this guest"} only`}
              </button>
              <select
                value={p.status}
                onChange={(e) => setPaymentStatus(eventId, guest.id, e.target.value as PaymentStatus)}
                className="rounded-full bg-card px-2 py-1 ring-1 ring-ink/15 focus:outline-none"
              >
                <option value="sent">Link sent</option>
                <option value="pending">Pending</option>
                <option value="partial">Part paid</option>
                <option value="paid">Paid</option>
                <option value="refunded">Refunded</option>
                <option value="canceled">Canceled</option>
              </select>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 text-muted-foreground">
        <label className="flex items-center gap-1">
          Per person
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="default"
            value={p.amount ?? ""}
            onChange={(e) => setGuestPaymentAmount(eventId, guest.id, e.target.value ? Number(e.target.value) : undefined)}
            className="w-20 rounded-md bg-card px-2 py-1 ring-1 ring-ink/10 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1">
          Record
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="0.00"
            value={entryAmount}
            onChange={(e) => setEntryAmount(e.target.value)}
            className="w-20 rounded-md bg-card px-2 py-1 ring-1 ring-ink/10 focus:outline-none"
          />
        </label>
        <select
          value={entryMethod}
          onChange={(e) => setEntryMethod(e.target.value as PaymentMethod)}
          className="rounded-md bg-card px-2 py-1 ring-1 ring-ink/10 focus:outline-none"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
        <input
          value={entryNote}
          onChange={(e) => setEntryNote(e.target.value)}
          placeholder="note (optional)"
          className="w-32 rounded-md bg-card px-2 py-1 ring-1 ring-ink/10 focus:outline-none"
        />
        <button
          onClick={() => submitEntry("payment")}
          className="rounded-full bg-velvet px-2.5 py-1 font-medium text-white hover:opacity-90"
        >
          Add payment
        </button>
        <button
          onClick={() => submitEntry("refund")}
          className="rounded-full px-2.5 py-1 font-medium text-ink ring-1 ring-ink/15 hover:bg-card"
        >
          Refund
        </button>
        {guest.status === "maybe" ? (
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={!!p.remindersOptIn}
              onChange={(e) => setPaymentRemindersOptIn(eventId, guest.id, e.target.checked)}
            />
            Nudge this maybe
          </label>
        ) : null}
        {history.length ? (
          <button onClick={() => setShowLog((v) => !v)} className="underline hover:no-underline">
            {showLog ? "Hide" : "History"} ({history.length})
          </button>
        ) : null}
      </div>

      {showLog && history.length ? (
        <ul className="space-y-1 rounded-md bg-card/70 p-2">
          {[...history].reverse().map((h) => (
            <li key={h.id} className="flex flex-wrap gap-2 text-muted-foreground">
              <span className={h.amount < 0 ? "font-medium text-violet-700" : "font-medium text-emerald-700"}>
                {h.amount < 0 ? `-${money(Math.abs(h.amount))}` : money(h.amount)}
              </span>
              <span>{PAYMENT_METHOD_LABELS[h.method] ?? h.method}</span>
              <span>{formatTimestamp((h.at))}</span>
              {h.note ? <span className="italic">{h.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function VenueEditor({ eventId, venue, address }: { eventId: string; venue: string; address?: string }) {
  const [editing, setEditing] = useState(false);
  const [editVenue, setEditVenue] = useState(venue);
  const [editAddress, setEditAddress] = useState(address ?? "");

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editVenue) return;
    updateEvent(eventId, { venue: editVenue, address: editAddress });
    setEditing(false);
  }

  const destination = [venue, address].filter(Boolean).join(", ");
  const encoded = encodeURIComponent(destination);
  const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
  const appleUrl = `https://maps.apple.com/?daddr=${encoded}`;

  function sendToPhone() {
    const num = window.prompt("Enter the cell number to text directions to (e.g. +15551234567):");
    if (!num) return;
    const body = `Directions to ${destination}:\n${googleUrl}`;
    window.location.href = `sms:${num.replace(/\s+/g, "")}?&body=${encodeURIComponent(body)}`;
  }

  if (editing) {
    return (
      <form onSubmit={onSave} className="mt-2 flex flex-col gap-2">
        <input
          required
          placeholder="Venue name"
          value={editVenue}
          onChange={(e) => setEditVenue(e.target.value)}
          className="w-full max-w-md rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
        />
        <input
          placeholder="Venue address (for maps & directions)"
          value={editAddress}
          onChange={(e) => setEditAddress(e.target.value)}
          className="w-full max-w-md rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <button type="submit" className="rounded-md bg-velvet px-3 py-1.5 text-xs font-medium text-white">
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditVenue(venue);
              setEditAddress(address ?? "");
              setEditing(false);
            }}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-2">
      <a
        href={googleUrl}
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground underline decoration-velvet/40 underline-offset-4 hover:text-velvet"
      >
        {venue}
        {address ? ` — ${address}` : ""}
      </a>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <a
          href={googleUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full bg-ink px-3 py-1 font-medium text-white hover:bg-velvet"
        >
          Directions · Google Maps
        </a>
        <a
          href={appleUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full px-3 py-1 font-medium text-ink ring-1 ring-ink/15 hover:bg-secondary"
        >
          Apple Maps
        </a>
        <button
          type="button"
          onClick={sendToPhone}
          className="rounded-full px-3 py-1 font-medium text-ink ring-1 ring-ink/15 hover:bg-secondary"
        >
          Text directions to my phone
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full px-3 py-1 font-medium text-ink ring-1 ring-ink/15 hover:bg-secondary"
          aria-label="Edit venue"
          title="Edit venue"
        >
          Edit venue
        </button>
      </div>
    </div>
  );
}

const THEME_COLORS = [
  { name: "Velvet", value: "#5b1a3a" },
  { name: "Ink", value: "#15151a" },
  { name: "Forest", value: "#1f3d2b" },
  { name: "Ocean", value: "#1b3a5b" },
  { name: "Sunset", value: "#b6463a" },
  { name: "Gold", value: "#a8803a" },
  { name: "Rose", value: "#c25a7a" },
  { name: "Slate", value: "#445268" },
];

const FONT_OPTIONS = [
  { name: "Serif (default)", value: "" },
  { name: "Playfair Display", value: '"Playfair Display", serif' },
  { name: "Cormorant Garamond", value: '"Cormorant Garamond", serif' },
  { name: "Libre Bodoni", value: '"Libre Bodoni", serif' },
  { name: "DM Serif Display", value: '"DM Serif Display", serif' },
  { name: "Cinzel (engraved)", value: '"Cinzel", serif' },
  { name: "Marcellus", value: '"Marcellus", serif' },
  { name: "Great Vibes (script)", value: '"Great Vibes", cursive' },
  { name: "Dancing Script", value: '"Dancing Script", cursive' },
  { name: "Pinyon Script", value: '"Pinyon Script", cursive' },
  { name: "Tangerine", value: '"Tangerine", cursive' },
  { name: "Parisienne", value: '"Parisienne", cursive' },
  { name: "Allura", value: '"Allura", cursive' },
  { name: "Italianno", value: '"Italianno", cursive' },
  { name: "Georgia", value: "Georgia, serif" },
  { name: "Times", value: '"Times New Roman", Times, serif' },
  { name: "Helvetica", value: "Helvetica, Arial, sans-serif" },
];

function FontPicker({
  label,
  sample,
  sampleSize,
  value,
  onChange,
}: {
  label: string;
  sample: string;
  sampleSize: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = FONT_OPTIONS.find((f) => f.value === value) ?? FONT_OPTIONS[0];
  return (
    <div className="rounded-lg bg-card p-3 ring-1 ring-ink/10">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</label>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-[11px] text-muted-foreground hover:text-ink"
        >
          {open ? "Done" : "Change"}
        </button>
      </div>
      <div
        className={`mt-2 truncate ${sampleSize}`}
        style={{ fontFamily: value || undefined }}
        title={current.name}
      >
        {sample}
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{current.name}</div>
      {open ? (
        <div className="mt-3 max-h-56 overflow-y-auto rounded-md bg-secondary/60 p-1">
          {FONT_OPTIONS.map((f) => {
            const active = f.value === value;
            return (
              <button
                key={f.name}
                type="button"
                onClick={() => {
                  onChange(f.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-card ${active ? "bg-card ring-1 ring-ink/20" : ""}`}
              >
                <span className="truncate" style={{ fontFamily: f.value || undefined }}>{sample}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{f.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const EMOJI_SET = ["✨","🎉","🥂","💐","🌙","🌿","🎶","💌","🕯️","🍾","💫","🌸","🎂","💖","🌟","🍷","🎁","🪩","🤍","🥳"];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Accepts "5b1a3a", "#5b1a3a" or "#5B1A3AFF" and returns a canonical
 * "#rrggbb", or undefined when the text is not a usable color yet. Lets the
 * hex field stay editable while the host is still typing.
 */
function normalizeHex(input: string | undefined | null): string | undefined {
  if (!input) return undefined;
  const raw = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw
      .split("")
      .map((c) => c + c)
      .join("")}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  if (/^[0-9a-fA-F]{8}$/.test(raw)) return `#${raw.slice(0, 6).toLowerCase()}`;
  return undefined;
}

function CustomizePanel({ event, eventId }: { event: ReturnType<typeof useEvent> & {}; eventId: string }) {
  const [message, setMessage] = useState(event!.message);
  const [showEmoji, setShowEmoji] = useState(false);
  /** In-progress hex text, so partial input is not fought by the store. */
  // Hex drafts now live inside ColorField, which owns all three color roles.

  /**
   * Hero photo / logo / decorative artwork upload.
   *
   * These used to be inlined into the event blob as a base64 data URL, which
   * bloated every subsequent save of that event by megabytes and risked the
   * save being rejected outright. Files now go to object storage and only the
   * URL is stored on the event.
   */
  async function onUpload(field: "image" | "logo" | "themeArt", file: File | null) {
    if (!file) return;
    if (file.size > 8_000_000) {
      toast("Please choose an image under 8MB.");
      return;
    }
    const toastId = `event-media-${field}`;
    const label = field === "logo" ? "logo" : field === "themeArt" ? "artwork" : "photo";
    toast.loading(`Uploading ${label}...`, { id: toastId });
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const { uploadAndRecord } = await import("@/lib/media-uploads.functions");
      const up = (await uploadAndRecord({
        data: {
          filename: file.name || `${field}-${Date.now()}`,
          contentType: file.type || "image/png",
          base64,
          source: "invite",
          visibility: "public",
        },
      })) as { url?: string };
      if (!up?.url) throw new Error("Upload did not return a URL.");
      updateEvent(eventId, { [field]: up.url });
      toast.success(`${label.charAt(0).toUpperCase()}${label.slice(1)} uploaded.`, { id: toastId });

    } catch (err) {
      toast.error("Couldn't upload that image.", {
        id: toastId,
        description: toUserMessage(err, "Please try again."),
      });
    }
  }

  function insertEmoji(em: string) {
    const next = (message ? message + " " : "") + em;
    setMessage(next);
    updateEvent(eventId, { message: next });
  }

  return (
    <div className="rounded-xl border border-ink/5 bg-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl">Customize invitation</h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Live preview</span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Hero photo */}
        <div>
          <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Hero photo</label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {event!.image ? (
              <FocalImage url={event!.image} alt={`${event!.title} hero photo`} className="h-14 w-14 rounded-full ring-1 ring-ink/10" />
            ) : (
              <div className="h-14 w-14 rounded-md bg-secondary text-[10px] flex items-center justify-center text-muted-foreground">None</div>
            )}
            <label className="cursor-pointer rounded-md px-3 py-1.5 text-xs ring-1 ring-ink/15 hover:bg-secondary">
              Upload
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onUpload("image", e.target.files?.[0] ?? null)} />
            </label>
            <MediaPickerButton source="invite" label="My Uploads" onPick={(url) => updateEvent(eventId, { image: url })} />
            {event!.image ? (
              <button type="button" onClick={() => updateEvent(eventId, { image: undefined })} className="text-[11px] text-muted-foreground hover:text-destructive">Remove</button>
            ) : null}
          </div>
          {event!.image ? (
            <div className="mt-3">
              <FocalAdjuster
                url={event!.image}
                onChange={(url) => updateEvent(eventId, { image: url })}
                round
                label="Reposition hero photo"
              />
            </div>
          ) : null}
        </div>


        {/* Logo */}
        <div>
          <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Logo</label>
          <div className="mt-2 flex items-center gap-3">
            {event!.logo ? (
              <img src={event!.logo} alt={`${event!.title} logo`} className="h-14 w-14 rounded-md object-contain bg-white ring-1 ring-ink/10 p-1" />
            ) : (
              <div className="h-14 w-14 rounded-md bg-secondary text-[10px] flex items-center justify-center text-muted-foreground">None</div>
            )}
            <label className="cursor-pointer rounded-md px-3 py-1.5 text-xs ring-1 ring-ink/15 hover:bg-secondary">
              Upload
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onUpload("logo", e.target.files?.[0] ?? null)} />
            </label>
            {event!.logo ? (
              <button type="button" onClick={() => updateEvent(eventId, { logo: undefined })} className="text-[11px] text-muted-foreground hover:text-destructive">Remove</button>
            ) : null}
          </div>
        </div>

        {/* Colors — one system, one control shape. Card color is the accent
            everything else inherits; text color is optional and checked for
            readability against the actual invitation background. */}
        <div className="space-y-4 rounded-xl bg-paper/60 p-4 ring-1 ring-ink/5">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Colors</p>
          <ColorField
            idPrefix="card-color"
            label="Card & border color"
            hint="The accent your invitation, frame and buttons inherit."
            value={normalizeHex(event!.color) ?? "#5b1a3a"}
            swatches={THEME_COLORS.map((c) => c.value)}
            onChange={(hex) => updateEvent(eventId, { color: hex })}
          />
          <ColorField
            idPrefix="text-color"
            label="Invitation text color"
            hint="Applies to the event name, date and venue on the invitation."
            value={normalizeHex(event!.textColor)}
            swatches={INVITE_TEXT_COLORS}
            onChange={(hex) => updateEvent(eventId, { textColor: hex })}
            onReset={() => updateEvent(eventId, { textColor: undefined })}
            resetLabel="Use the default ink"
            contrastAgainst={INVITE_PAPER}
            contrastKind="text"
          />
          {!event!.textColor ? (
            <p className="text-[11px] text-muted-foreground">
              Using the default ink, which is always readable.
            </p>
          ) : null}
        </div>


        {/* Font controls — handled below full-width */}
      </div>


      {/* Host artwork — an uploaded image used as invite backdrop, soft frame,
          or envelope skin. Kept separate from the hero photo so the social
          preview image never changes underneath the host. */}
      <div className="mt-6">
        <WhisperPlusGate feature="Custom invite artwork">
          <div className="rounded-xl bg-gradient-to-br from-secondary/60 to-secondary/20 p-4 ring-1 ring-ink/5">
            <h4 className="font-serif text-base">Your own artwork</h4>
            <p className="text-[11px] text-muted-foreground">
              Upload a pattern, painting, or photo, or search for a real photo. Use it as the invitation backdrop, as a soft frame, or just on the envelope that opens.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {event!.themeArt ? (
                <FocalImage
                  url={event!.themeArt}
                  alt="Invite artwork"
                  className="h-16 w-24 rounded-md ring-1 ring-ink/10"
                />

              ) : (
                <div className="flex h-16 w-24 items-center justify-center rounded-md bg-secondary text-[10px] text-muted-foreground">
                  None
                </div>
              )}
              <label className="min-h-11 cursor-pointer rounded-md px-3 py-2.5 text-xs ring-1 ring-ink/15 hover:bg-secondary">
                Upload artwork
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onUpload("themeArt", e.target.files?.[0] ?? null)}
                />
              </label>
              <MediaPickerButton
                source="invite"
                label="My Uploads"
                onPick={(url) => updateEvent(eventId, { themeArt: url })}
              />
              {event!.themeArt ? (
                <button
                  type="button"
                  onClick={() => updateEvent(eventId, { themeArt: undefined })}
                  className="text-[11px] text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              ) : null}
            </div>

            {/* Real-photo search: a third backdrop source next to the curated
                painted art and an upload from the host's own device. */}
            <div className="mt-4 rounded-lg bg-paper/70 p-3 ring-1 ring-ink/10">
              <p className="text-[11px] font-medium">Or search for a real photo</p>
              <p className="mb-2 text-[10px] text-muted-foreground">
                Search a photo of the real thing, for example a bonfire, and use it as your backdrop.
              </p>
              <ThemePhotoPicker
                onPick={(url) =>
                  updateEvent(eventId, { themeArt: url, themeArtMode: "background" })
                }
              />
            </div>



            {event!.themeArt ? (
              <>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(
                    [
                      { id: "background", label: "Backdrop", blurb: "Behind the whole invitation." },
                      { id: "frame", label: "Soft frame", blurb: "Fading bands around the edges." },
                      { id: "envelope-only", label: "Envelope only", blurb: "Just the opening animation." },
                    ] as const
                  ).map((m) => {
                    const active = (event!.themeArtMode ?? "background") === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => updateEvent(eventId, { themeArtMode: m.id })}
                        aria-pressed={active}
                        className={`min-h-11 rounded-lg bg-paper p-2.5 text-left ring-1 transition hover:bg-secondary ${active ? "ring-2 ring-ink" : "ring-ink/10"}`}
                      >
                        <span className="block text-[11px] font-medium">{m.label}</span>
                        <span className="block text-[10px] leading-snug text-muted-foreground">{m.blurb}</span>
                      </button>
                    );
                  })}
                </div>

                <label className="mt-4 block text-[11px] uppercase tracking-widest text-muted-foreground">
                  Artwork strength
                </label>
                <input
                  type="range"
                  min={15}
                  max={100}
                  step={5}
                  value={Math.round((event!.themeArtOpacity ?? 0.35) * 100)}
                  onChange={(e) => updateEvent(eventId, { themeArtOpacity: Number(e.target.value) / 100 })}
                  className="mt-1 w-full"
                  aria-label="Artwork strength"
                />

                {/* Reposition the backdrop so faces are never cut off. */}
                <div className="mt-4">
                  <FocalAdjuster
                    url={event!.themeArt}
                    onChange={(url: string) => updateEvent(eventId, { themeArt: url })}
                    aspectClassName="aspect-[16/7]"
                    label="Reposition artwork"
                  />
                </div>


                <div className="mt-3">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Preview</span>
                  <div className="relative mt-1 h-28 overflow-hidden rounded-lg bg-paper ring-1 ring-ink/10">
                    <ThemeArtLayer event={event!} />
                    <InviteFrame frame={event!.frame} accent={event!.color ?? "#5b1a3a"} color={event!.frameColor} />
                    <div className="relative z-30 flex h-full items-center justify-center">
                      <span className="font-serif text-sm text-ink">{event!.title}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </WhisperPlusGate>
      </div>


      {/* Invite frame — decorative border around the guest-facing hero.
          The frame color is host-controlled: pick the frame, then tune its
          color with a swatch or a typed hex right underneath it. Leaving the
          color unset keeps the old behaviour (frame inherits the card color). */}
      {FRAMES_ENABLED ? (
        <div className="mt-6">
          <WhisperPlusGate feature="Invite frames">
            <div className="rounded-xl bg-gradient-to-br from-secondary/60 to-secondary/20 p-4 ring-1 ring-ink/5">
              <h4 className="font-serif text-base">Invite frame</h4>
              <p className="text-[11px] text-muted-foreground">
                A decorative border on the invitation guests see. Pick a style, then set its color.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {EVENT_FRAMES.map((f) => {
                  const active = (event!.frame ?? "none") === f.id;
                  return (
                    <Fragment key={f.id}>
                      <button
                        type="button"
                        onClick={() => updateEvent(eventId, { frame: f.id, theme: undefined })}
                        className={`rounded-lg bg-paper p-2 text-left ring-1 transition hover:bg-secondary ${active ? "ring-2 ring-ink" : "ring-ink/10"}`}
                      >
                        <span className="relative block h-14 overflow-hidden rounded bg-secondary/50">
                          <InviteFrame
                            frame={f.id}
                            accent={event!.color ?? "#5b1a3a"}
                            color={event!.frameColor}
                          />
                        </span>
                        <span className="mt-1.5 block text-[11px] font-medium">{f.label}</span>
                        <span className="block text-[10px] leading-snug text-muted-foreground">{f.blurb}</span>
                      </button>

                      {active && f.layers.length > 0 ? (
                        <div className="col-span-2 rounded-lg bg-paper p-3 ring-1 ring-ink/10 sm:col-span-4">
                          {/* Same control as the card and text colors, so the
                              three roles feel like one color system. */}
                          <ColorField
                            idPrefix="frame-color"
                            label={`${f.label} color`}
                            value={normalizeHex(event!.frameColor)}
                            swatches={FRAME_COLORS.map((c) => c.value)}
                            onChange={(hex) => updateEvent(eventId, { frameColor: hex })}
                            onReset={() => updateEvent(eventId, { frameColor: undefined })}
                            contrastAgainst={INVITE_PAPER}
                            contrastKind="decorative"
                          />
                          {!event!.frameColor ? (
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              Matching your card color.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </WhisperPlusGate>
        </div>
      ) : null}




      {/* Typography studio */}
      <div className="mt-6 rounded-xl bg-gradient-to-br from-secondary/60 to-secondary/20 p-4 ring-1 ring-ink/5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-serif text-base">Typography</h4>
            <p className="text-[11px] text-muted-foreground">Pick fonts for the title and the body. Preview updates as you type.</p>
          </div>
          <button
            type="button"
            onClick={() => updateEvent(eventId, { bodyFont: event!.font ?? "" })}
            className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-medium text-paper hover:opacity-90"
            title="Use the title font for body text too"
          >
            Apply title font to all
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FontPicker
            label="Title font"
            sample="Your Event Title"
            sampleSize="text-2xl"
            value={event!.font ?? ""}
            onChange={(v) => updateEvent(eventId, { font: v })}
          />
          <FontPicker
            label="Body font"
            sample="Join us for an unforgettable evening."
            sampleSize="text-base"
            value={event!.bodyFont ?? ""}
            onChange={(v) => updateEvent(eventId, { bodyFont: v })}
          />
        </div>
      </div>

      {/* Message + emoji */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Invitation message</label>
          <span className="text-[10px] text-muted-foreground">Preview in body font ↓</span>
        </div>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            updateEvent(eventId, { message: e.target.value });
          }}
          className="mt-2 w-full rounded-md bg-secondary px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-ink/20"
          style={{ fontFamily: event!.bodyFont || event!.font || undefined }}
          placeholder="Write a warm note to your guests…"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowEmoji((s) => !s)}
            className="rounded-md px-3 py-1.5 text-xs ring-1 ring-ink/15 hover:bg-secondary"
          >
            {showEmoji ? "Hide emojis" : "Add emoji"}
          </button>
          <span className="text-[10px] text-muted-foreground">Click an emoji to append it.</span>
        </div>
        {showEmoji ? (
          <div className="mt-2 flex flex-wrap gap-1 rounded-md bg-secondary p-2">
            {EMOJI_SET.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => insertEmoji(em)}
                className="rounded p-1 text-lg hover:bg-card"
              >
                {em}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function InvitePreviewWithPrint({ event }: { event: ReturnType<typeof useEvent> & {} }) {
  const [sizeId, setSizeId] = useState("letter");
  const [busy, setBusy] = useState<"none" | "download" | "print">("none");

  async function handleDownload() {
    setBusy("download");
    try {
      const { exportInviteOnePagerPdf } = await import("@/lib/invite-pdf-export");
      await exportInviteOnePagerPdf(event!, { sizeId });
    } catch (e) {
      console.error(e);
      toast.error("Could not build the printable invite.");
    } finally {
      setBusy("none");
    }
  }

  async function handlePrint() {
    setBusy("print");
    try {
      const { getInviteOnePagerBlobUrl } = await import("@/lib/invite-pdf-export");
      const url = await getInviteOnePagerBlobUrl(event!, { sizeId });
      // Print from a hidden iframe on this page. A new window is what pop-up
      // blockers stop, and hosts were losing the print dialog to that block.
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "1px";
      frame.style.height = "1px";
      frame.style.border = "0";
      frame.style.opacity = "0";
      frame.src = url;
      const cleanup = () => {
        window.setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 60_000);
      };
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          cleanup();
        } catch {
          // Some browsers refuse to print a PDF inside a frame: fall back to a
          // download so the host still gets the file.
          frame.remove();
          const a = document.createElement("a");
          a.href = url;
          a.download = "invitation.pdf";
          a.click();
          toast.success("Your browser blocked in-page printing, so we downloaded the invite instead.");
          cleanup();
        }
      };
      document.body.appendChild(frame);
    } catch (e) {
      console.error(e);
      toast.error("Could not open the printable invite.");
    } finally {
      setBusy("none");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/5 bg-card p-3">
        <div className="min-w-0">
          <div className="font-serif text-sm">Printable one-pager</div>
          <div className="text-[11px] text-muted-foreground">Download or print a mailable invite with an RSVP QR code.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Paper size"
            value={sizeId}
            onChange={(e) => setSizeId(e.target.value)}
            className="rounded-full border border-ink/10 bg-paper px-3 py-1.5 text-xs"
          >
            {INVITE_PAGE_SIZES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handlePrint}
            disabled={busy !== "none"}
            className="rounded-full border border-ink/15 bg-paper px-4 py-1.5 text-xs font-medium hover:bg-secondary/60 disabled:opacity-50"
          >
            {busy === "print" ? "Opening…" : "Print"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy !== "none"}
            className="rounded-full bg-velvet px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy === "download" ? "Building…" : "Download PDF"}
          </button>
        </div>
      </div>
      <InvitePreview event={event} />
    </div>
  );
}

function InvitePreview({ event }: { event: ReturnType<typeof useEvent> & {} }) {

  const d = formatEventDate(event!.date, event!.timezone);
  const cardColor = event!.color || undefined;
  const titleFont = event!.font || undefined;
  const bodyFont = event!.bodyFont || event!.font || undefined;
  return (
    <div
      className={`relative flex aspect-[4/5] max-h-[640px] items-center justify-center rounded-[24px] p-8 shadow-2xl sm:p-12 ${cardColor ? "" : "bg-velvet"}`}
      style={cardColor ? { backgroundColor: cardColor } : undefined}
    >
      <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[4px] bg-paper text-center shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] ring-1 ring-ink/5">
        {event!.image ? (
          <FocalImage url={event!.image} alt={`${event!.title} cover`} className="h-40 w-full" />
        ) : null}

        <div className="flex w-full flex-1 flex-col items-center justify-center p-8">
          <div className="pointer-events-none absolute inset-4 border border-ink/5" />
          {event!.logo ? (
            <img src={event!.logo} alt={`${event!.title} logo`} className="mb-3 h-10 object-contain" />
          ) : null}
          <span className="font-serif text-lg italic" style={{ color: cardColor, fontFamily: titleFont }}>Join us for</span>
          <h2
            className="mt-4 font-serif text-3xl font-medium tracking-tight sm:text-5xl"
            style={{ fontFamily: titleFont, color: cardColor ? undefined : undefined }}
          >
            {event!.title}
          </h2>
          <div className="my-6 h-px w-12" style={{ backgroundColor: cardColor ?? undefined, opacity: 0.6 }} />
          <p className="max-w-[30ch] text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            <EventTimeInline date={event!.date} timezone={event!.timezone} />
          </p>
          <p className="mt-2 font-serif text-lg text-muted-foreground" style={{ fontFamily: bodyFont }}>{event!.venue}</p>
          {event!.address ? (
            <p className="mt-1 max-w-[30ch] text-xs text-muted-foreground/80" style={{ fontFamily: bodyFont }}>{event!.address}</p>
          ) : null}
          <p className="mt-6 max-w-[36ch] text-lg leading-relaxed text-ink/80 whitespace-pre-wrap" style={{ fontFamily: bodyFont }}>
            {event!.message}
          </p>
          {(event!.dressCode || event!.hashtag) ? (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {event!.dressCode ? <span>Attire · {event!.dressCode}</span> : null}
              {event!.hashtag ? <span style={{ color: cardColor }}>#{event!.hashtag.replace(/^#/, "")}</span> : null}
            </div>
          ) : null}
          {(event!.registry && event!.registry.length > 0) ? (
            <p className="mt-3 max-w-[34ch] text-[11px] text-muted-foreground">
              Registry: {event!.registry.map((r) => r.store).filter((s, i, a) => a.indexOf(s) === i).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Inline "+ Add email / + Add phone" control for the Payment links dialog.
 * A guest missing a contact method used to dead-end on a toast; now the host
 * can fill it in without leaving the send flow. Writes through the same
 * updateGuest used by the guest editor, so the row re-renders with a live
 * Email/Text button immediately.
 */
function InlineContactFix({
  eventId,
  guest,
  field,
}: {
  eventId: string;
  guest: Guest;
  field: "email" | "phone";
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const label = field === "email" ? "email" : "phone";

  function save() {
    const v = value.trim();
    if (!v) {
      setError(`Enter ${guest.name.split(" ")[0] || "this guest"}'s ${label}.`);
      return;
    }
    if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setError("That doesn't look like a valid email address.");
      return;
    }
    if (field === "phone" && v.replace(/\D/g, "").length < 10) {
      setError("Enter a full phone number, including area code.");
      return;
    }
    updateGuest(eventId, guest.id, field === "email" ? { email: v } : { phone: v });
    toast.success(`Saved ${label} for ${guest.name}.`);
    setOpen(false);
    setValue("");
    setError(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-dashed border-ink/25 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-secondary/60 hover:text-ink"
      >
        + Add {label}
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      <input
        autoFocus
        type={field === "email" ? "email" : "tel"}
        value={value}
        aria-label={`${field === "email" ? "Email address" : "Phone number"} for ${guest.name}`}
        onChange={(e) => { setValue(e.target.value); setError(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); save(); }
          if (e.key === "Escape") { e.preventDefault(); setOpen(false); setError(null); }
        }}
        placeholder={field === "email" ? "guest@email.com" : "(555) 555-5555"}
        className="w-40 rounded-full bg-paper px-2.5 py-1 text-[11px] ring-1 ring-ink/15 focus:outline-none focus:ring-velvet"
      />
      <button
        type="button"
        onClick={save}
        className="rounded-full bg-velvet px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setError(null); }}
        className="rounded-full px-1.5 py-1 text-[11px] text-muted-foreground hover:text-ink"
      >
        Cancel
      </button>
      {error ? <span className="w-full text-[10px] text-red-600">{error}</span> : null}
    </span>
  );
}

/**
 * Bulk payment nudges, kept visually separate from the per-guest buttons so the
 * scope of a click is never ambiguous: everything here says "all", every button
 * inside a guest row names that one guest.
 */
function BulkReminderBar({ event, eventId }: { event: KEvent; eventId: string }) {
  const unpaid = remindablePaymentGuests(event, "unpaid");
  const partial = remindablePaymentGuests(event, "partial");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<
    | null
    | {
        label: string;
        subject: string;
        guestIds: string[];
        targets: Array<{
          guestId: string;
          guestName: string;
          email: string | null;
          phone: string | null;
          amountDue: number;
          smsBody: string;
        }>;
        skipped: Array<{ guestId: string; reason: string }>;
      }
  >(null);

  async function openPreview(label: string, list: Guest[]) {
    if (list.length === 0) {
      toast.info(`No ${label} guests are due a reminder right now.`);
      return;
    }
    setBusy(true);
    try {
      const guestIds = list.map((g) => g.id);
      const p = await previewPaymentSend({ eventId, guestIds, kind: "reminder" });
      if (!p.targets.length) {
        toast.info(
          p.skipped.length
            ? `Nothing to send: ${p.skipped[0]!.reason}.`
            : "No guests are due a reminder right now.",
        );
        return;
      }
      setPreview({ label, subject: p.subject, guestIds, targets: p.targets as any, skipped: p.skipped });
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't build the preview."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSend() {
    if (!preview) return;
    setBusy(true);
    try {
      const summary = await sendPaymentSend({
        eventId,
        guestIds: preview.targets.map((t) => t.guestId),
        kind: "reminder",
      });
      markPaymentGroupReminded(eventId, summary.reachedGuestIds);
      reportPaymentSend(summary, `all ${preview.label} guests`);
      void refreshPaymentDelivery(eventId);
      setPreview(null);
    } catch (err) {
      toast.error(toUserMessage(err, "Bulk send failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl bg-secondary/50 p-3 ring-1 ring-ink/10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Bulk reminders (everyone in the group)
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            disabled={busy}
            onClick={() => openPreview("unpaid", unpaid)}
            className="rounded-full bg-velvet px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Remind all unpaid ({unpaid.length})
          </button>
          <button
            disabled={busy}
            onClick={() => openPreview("part paid", partial)}
            className="rounded-full px-3 py-1.5 text-[11px] font-medium text-ink ring-1 ring-ink/15 hover:bg-card disabled:opacity-50"
          >
            Remind all partial ({partial.length})
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        These two buttons email and text every matching guest automatically. You'll see the exact
        message and the full recipient list before anything goes out. To message one person, use the
        "Remind [name] only" button on that guest's row.
      </p>

      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => (busy ? null : setPreview(null))}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-ink/10 p-4">
              <h4 className="font-serif text-lg">
                Review before sending to {preview.targets.length} {preview.label} guest
                {preview.targets.length === 1 ? "" : "s"}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                This is a bulk send and cannot be undone once it goes out. Each guest receives a real
                email (and a text if they have a mobile number on file) with their own amount due.
              </p>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-4 text-sm">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Email subject</p>
              <p className="mt-1 font-medium">{preview.subject}</p>
              <p className="mt-4 text-[11px] uppercase tracking-widest text-muted-foreground">
                Message (example: {preview.targets[0]!.guestName})
              </p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-secondary/50 p-3 text-[13px]">
                {preview.targets[0]!.smsBody}
              </p>
              <p className="mt-4 text-[11px] uppercase tracking-widest text-muted-foreground">Recipients</p>
              <ul className="mt-1 divide-y divide-ink/5">
                {preview.targets.map((t) => (
                  <li key={t.guestId} className="flex flex-wrap items-center gap-2 py-1.5 text-[12px]">
                    <span className="font-medium">{t.guestName}</span>
                    <span className="text-muted-foreground">{money(t.amountDue)} due</span>
                    <span className="ml-auto flex gap-1 text-[10px]">
                      {t.email ? (
                        <span className="rounded-full bg-secondary px-2 py-0.5">✉️ {t.email}</span>
                      ) : (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">no email</span>
                      )}
                      {t.phone ? (
                        <span className="rounded-full bg-secondary px-2 py-0.5">💬 {t.phone}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              {preview.skipped.length ? (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {preview.skipped.length} guest{preview.skipped.length === 1 ? "" : "s"} skipped
                  automatically ({preview.skipped[0]!.reason}).
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-ink/10 p-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPreview(null)}
                className="rounded-full px-3 py-1.5 text-xs ring-1 ring-ink/15 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={confirmSend}
                className="rounded-full bg-velvet px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {busy ? "Sending…" : `Send to ${preview.targets.length} now`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


function PaymentPanel({ event, eventId }: { event: ReturnType<typeof useEvent> & {}; eventId: string }) {
  const enabled = !!event!.paymentEnabled;
  const guests = event!.guests;
  const [sendDialog, setSendDialog] = useState(false);
  const [autoSending, setAutoSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const summary = guests.reduce(
    (acc, g) => {
      const s = g.payment?.status ?? "not_sent";
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    {} as Record<PaymentStatus, number>,
  );
  const currency = event!.paymentCurrency ?? "USD";
  const payoutReady = hasPayoutMethod(event!);
  const noGuests = guests.length === 0;
  const buildMsg = (g: Guest) => {
    const link = resolvePaymentLink(eventId, g.payment?.link);
    const amt = guestOwedAmount(event!, g);
    const purpose = event!.paymentPurpose ? ` for ${event!.paymentPurpose}` : "";
    return `Hi ${g.name.split(" ")[0] || "there"}, here's your payment link${purpose}: ${link} (${currency} ${amt.toFixed(2)})`;
  };


  return (
    <div className="rounded-xl border border-ink/5 bg-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl">Collect payment</h3>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => updateEvent(eventId, { paymentEnabled: e.target.checked })}
          />
          Enable payment collection
        </label>
      </div>
      {enabled ? (
        <>
          <BulkReminderBar event={event!} eventId={eventId} />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Adult price</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={event!.paymentAmount ?? ""}
                onChange={(e) => updateEvent(eventId, { paymentAmount: e.target.value ? Number(e.target.value) : undefined })}
                className="mt-1 w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Child price</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={event!.paymentAmountChild ?? ""}
                onChange={(e) => updateEvent(eventId, { paymentAmountChild: e.target.value ? Number(e.target.value) : undefined })}
                className="mt-1 w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
                placeholder="Defaults to adult price"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Currency</label>
              <select
                value={event!.paymentCurrency ?? "USD"}
                onChange={(e) => updateEvent(eventId, { paymentCurrency: e.target.value })}
                className="mt-1 w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
              >
                {["USD", "EUR", "GBP", "CAD", "AUD"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground">Status</label>
              <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                {(["not_sent","sent","pending","partial","paid","refunded","canceled"] as PaymentStatus[]).map((s) => (
                  <span key={s} className={`rounded-full px-2 py-0.5 ${paymentBadgeStyle(s)}`}>
                    {paymentLabel(s)} {summary[s] ?? 0}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">What is the payment for?</label>
            <textarea
              rows={2}
              value={event!.paymentPurpose ?? ""}
              onChange={(e) => updateEvent(eventId, { paymentPurpose: e.target.value })}
              placeholder="e.g. Plated dinner & open bar — $75 per guest, due by June 1."
              className="mt-1 w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <div className="mt-4 rounded-xl bg-secondary/40 p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              How can guests pay you?
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Add any combination — guests will see buttons for each on their invitation.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([
                ["payPaypal", "🅿️ PayPal username", "your-handle"],
                ["payVenmo", "💸 Venmo username", "@your-handle"],
                ["payCashapp", "💵 CashApp $cashtag", "$yourcashtag"],
                ["payZelle", "🏦 Zelle email / phone", "you@email.com"],
              ] as const).map(([key, label, ph]) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
                  <input
                    value={(event as any)[key] ?? ""}
                    onChange={(e) => updateEvent(eventId, { [key]: e.target.value } as any)}
                    placeholder={ph}
                    className="rounded-md bg-paper px-3 py-2 text-sm ring-1 ring-ink/10 focus:outline-none focus:ring-velvet"
                  />
                </label>
              ))}
             </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={noGuests || !payoutReady || !event!.paymentAmount}
              onClick={() => setSendDialog(true)}
              className="rounded-full bg-velvet px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send payment links to all invitees
            </button>
            {noGuests ? (
              <span className="text-[11px] text-muted-foreground">
                No guests yet — payment links are per guest.{" "}
                <Link
                  to="/events/$eventId"
                  params={{ eventId }}
                  search={{ step: "guests" }}
                  className="font-medium text-velvet underline"
                >
                  Add guests in Guests &amp; reminders
                </Link>
                , then come back here.
              </span>
            ) : !payoutReady ? (
              <span className="text-[11px] text-muted-foreground">
                Add at least one payment handle above (PayPal, Venmo, CashApp, or Zelle) so guests
                have somewhere to actually pay.
              </span>
            ) : !event!.paymentAmount ? (
              <span className="text-[11px] text-muted-foreground">
                Set a default adult price above first.
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                Per-guest amount overrides the default. Edit any guest below to change theirs.
              </span>
            )}
          </div>
          {sendDialog ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSendDialog(false)}>
              <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-ink/10 p-4">
                  <div>
                    <h4 className="font-serif text-lg">Payment links ready</h4>
                    <p className="text-xs text-muted-foreground">Each guest gets their invitation link, where their amount and your payment buttons are ready to go. Use <strong>Send now</strong> to have us email and text it for you. The manual email, text, and copy buttons stay available as a fallback.</p>
                  </div>
                  <button onClick={() => setSendDialog(false)} className="rounded-full bg-secondary px-3 py-1 text-xs">Close</button>
                </div>
                <div className="max-h-[60vh] divide-y divide-ink/5 overflow-y-auto">
                  {guests.map((g) => {
                    const link = resolvePaymentLink(eventId, g.payment?.link);
                    const msg = buildMsg(g);
                    const subject = `Payment link — ${event!.title}`;
                    return (
                      <div key={g.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{g.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{link}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            disabled={autoSending}
                            onClick={async () => {
                              setAutoSending(true);
                              try {
                                const summary = await sendPaymentSend({ eventId, guestIds: [g.id], kind: "link" });
                                if (summary.reachedGuestIds.length) sendPaymentLink(eventId, g.id);
                                reportPaymentSend(summary, g.name || "this guest");
                                void refreshPaymentDelivery(eventId);
                              } catch (err) {
                                toast.error(toUserMessage(err, "Couldn't send."));
                              } finally {
                                setAutoSending(false);
                              }
                            }}
                            className="rounded-full bg-velvet px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                            title={`We email and text ${g.name || "this guest"} their payment link`}
                          >
                            Send now
                          </button>
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">or manually</span>
                          {g.email ? (
                            <a
                              href={`mailto:${g.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`}
                              className="rounded-full bg-secondary px-2.5 py-1 text-[11px] hover:bg-secondary/70"
                            >
                              ✉️ Email
                            </a>
                          ) : (
                            <InlineContactFix eventId={eventId} guest={g} field="email" />
                          )}
                          {g.phone ? (
                            <a
                              href={`sms:${g.phone}?&body=${encodeURIComponent(msg)}`}
                              className="rounded-full bg-secondary px-2.5 py-1 text-[11px] hover:bg-secondary/70"
                            >
                              💬 Text
                            </a>
                          ) : (
                            <InlineContactFix eventId={eventId} guest={g} field="phone" />
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              try { await navigator.clipboard.writeText(link); setCopiedId(g.id); setTimeout(() => setCopiedId(null), 1500); } catch { prompt("Copy link:", link); }
                            }}
                            className="rounded-full bg-secondary px-2.5 py-1 text-[11px] hover:bg-secondary/70"
                          >
                            {copiedId === g.id ? "✓ Copied" : "📋 Copy"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-ink/10 p-3">
                  <button
                    type="button"
                    onClick={async () => {
                      const all = guests
                        .map((g) => `${g.name}: ${resolvePaymentLink(eventId, g.payment?.link)}`)
                        .join("\n");
                      try { await navigator.clipboard.writeText(all); toast("All links copied to clipboard."); } catch { prompt("Copy all links:", all); }
                    }}
                    className="rounded-full bg-secondary px-3 py-1.5 text-xs"
                  >
                    Copy all links
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={autoSending || guests.length === 0}
                      onClick={async () => {
                        const ok = await confirmDialog({
                          title: `Email and text payment links to all ${guests.length} guest${guests.length === 1 ? "" : "s"}?`,
                          body: "This is a bulk send and can't be undone. Each guest gets their own link and amount due. Guests with no email or mobile number are skipped and listed after.",
                          confirmLabel: "Send now",
                        });
                        if (!ok) return;
                        setAutoSending(true);
                        try {
                          const summary = await sendPaymentSend({
                            eventId,
                            guestIds: guests.map((g) => g.id),
                            kind: "link",
                          });
                          summary.reachedGuestIds.forEach((id) => sendPaymentLink(eventId, id));
                          reportPaymentSend(summary, `all ${summary.reachedGuestIds.length} guests`);
                          void refreshPaymentDelivery(eventId);
                        } catch (err) {
                          toast.error(toUserMessage(err, "Bulk send failed."));
                        } finally {
                          setAutoSending(false);
                        }
                      }}
                      className="rounded-full bg-velvet px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {autoSending ? "Sending…" : `Send now to all ${guests.length}`}
                    </button>
                    <button onClick={() => setSendDialog(false)} className="rounded-full bg-secondary px-3 py-1.5 text-xs">Done</button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Turn this on if you need to collect a contribution, ticket fee, or deposit from guests. You'll set the amount and what it covers, then send a payment link per guest.
        </p>
      )}

    </div>
  );
}

/**
 * Scheduled SMS for the ticked reminders. The template is stored verbatim on the
 * event, and the cron worker renders exactly this text, so the preview a host
 * reads here is the message their guests receive.
 */
function ScheduledReminderSms({
  event,
  eventId,
}: {
  event: ReturnType<typeof useEvent> & {};
  eventId: string;
}) {
  const enabled = !!event!.reminderSmsEnabled;
  const [body, setBody] = useState(event!.reminderSmsBody ?? DEFAULT_REMINDER_SMS);
  const textable = (event!.guests ?? []).filter((g) => !!g.phone).length;
  const preview = renderReminderSms(body, {
    eventTitle: event!.title,
    whenLabel: "tomorrow",
    guestName: event!.guests?.[0]?.name || "Guest",
    hostName: event!.hosts?.[0]?.name,
    link: `${typeof window !== "undefined" ? window.location.origin : ""}/s/${eventId}`,
  });

  return (
    <div className="mt-4 rounded-xl border border-ink/10 bg-secondary/30 p-3">
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setReminderSms(eventId, { enabled: e.target.checked, body })}
          className="mt-0.5 h-4 w-4 accent-velvet"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">Text these reminders too</span>
          <span className="block text-[11px] text-muted-foreground">
            {textable} guest{textable === 1 ? "" : "s"} have a phone number on file. Guests who replied STOP are always
            skipped, and each guest is texted once per reminder. Texting needs a plan or add-on that includes messages,
            and the email reminder always goes either way.
          </span>
        </span>
      </label>

      {enabled ? (
        <div className="mt-3">
          <textarea
            value={body}
            onChange={(e) => {
              const next = e.target.value.slice(0, REMINDER_SMS_MAX);
              setBody(next);
              setReminderSms(eventId, { body: next });
            }}
            rows={3}
            className="w-full rounded-lg border border-ink/15 bg-card p-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-velvet/30"
            aria-label="Scheduled reminder text message"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>Tokens: {"{event}"} {"{when}"} {"{name}"} {"{host}"} {"{link}"}</span>
            <span>{REMINDER_SMS_MAX - body.length} left</span>
          </div>
          <p className="mt-2 rounded bg-card px-2 py-1 text-[11px] text-ink/80">
            Guests will read: {preview}
          </p>
        </div>
      ) : null}
    </div>
  );
}


function RemindersPanel({ event, eventId }: { event: ReturnType<typeof useEvent> & {}; eventId: string }) {
  const selected = new Set(event!.reminderPresetIds ?? []);
  const upcoming = upcomingReminders(event!);
  const log = event!.reminderLog ?? [];
  const tier = useTier();
  const sendReminder = useServerFn(sendEventReminderNow);
  const lastSentFn = useServerFn(getReminderLastSent);
  const queueSmsFn = useServerFn(queueSms);
  const optOutSet = useSmsOptOutSet();
  const [audience, setAudience] = useState<Guest[]>([]);
  const [channel, setChannel] = useState<"email" | "sms" | "both">("email");
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<{ email: Record<string, string>; sms: Record<string, string> }>({
    email: {},
    sms: {},
  });
  const reminderCap =
    tier === "postcard" ? 1
    : tier === "whisper" ? 3
    : null; // host, atelier, owner, trial: unlimited
  const sentCount = log.length;
  const reminderAtCap = reminderCap !== null && sentCount >= reminderCap;

  // Genuine per-channel last-reminder times, so "reminded" never shows the
  // invitation date.
  const refreshLastSent = useCallback(() => {
    lastSentFn({ data: { eventId } })
      .then((r: { email?: Record<string, string>; sms?: Record<string, string> }) =>
        setLastSent({ email: r.email ?? {}, sms: r.sms ?? {} }),
      )
      .catch(() => {});
  }, [eventId, lastSentFn]);
  useEffect(() => {
    refreshLastSent();
  }, [refreshLastSent]);

  function togglePreset(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateEvent(eventId, { reminderPresetIds: Array.from(next) });
  }

  // The picker already hides guests missing the chosen channel, but "both"
  // shows everyone, so each channel's real reach is counted here.
  const emailable = audience.filter((g) => !!g.email);
  const textable = audience.filter(
    (g) => !!g.phone && !optOutSet.has(normalizePhone(g.phone)),
  );
  const declinedPicked = audience.filter((g) => (g.status ?? "pending") === "no");

  async function sendNow() {
    if (reminderAtCap || sending) return;
    if (!audience.length) {
      toast("Pick who should get the reminder.");
      return;
    }
    const wantsEmail = channel === "email" || channel === "both";
    const wantsSms = channel === "sms" || channel === "both";
    if (wantsEmail && !emailable.length && !(wantsSms && textable.length)) {
      toast("None of the people you picked have an email address.");
      return;
    }
    const lines: string[] = [];
    if (wantsEmail) lines.push(`Email: ${emailable.length} guest${emailable.length === 1 ? "" : "s"}`);
    if (wantsSms) lines.push(`Text: ${textable.length} guest${textable.length === 1 ? "" : "s"}`);
    const skippedEmail = wantsEmail ? audience.length - emailable.length : 0;
    const skippedSms = wantsSms ? audience.length - textable.length : 0;
    if (skippedEmail > 0) lines.push(`${skippedEmail} skipped for email (no address)`);
    if (skippedSms > 0) lines.push(`${skippedSms} skipped for text (no number, or opted out)`);
    if (declinedPicked.length > 0) {
      lines.push(
        `${declinedPicked.length} of these already declined, and will still be contacted because you picked them.`,
      );
    }
    const names = audience.slice(0, 6).map((g) => g.name || "Guest").join(", ");

    const ok = await confirmDialog({
      title:
        channel === "both" ? `Send reminders by email and text?`
        : channel === "sms" ? `Text ${textable.length} guest${textable.length === 1 ? "" : "s"}?`
        : `Email ${emailable.length} guest${emailable.length === 1 ? "" : "s"}?`,
      body: `${names}${audience.length > 6 ? ` and ${audience.length - 6} more` : ""}.\n\n${lines.join("\n")}${
        wantsSms ? "\n\nTexts cost money and count against your plan's SMS limit." : ""
      }`,
      confirmLabel: channel === "sms" ? "Send texts" : "Send reminder",
      tone: "info",
    });
    if (!ok) return;

    setSending(true);
    try {
      let emailSent = 0;
      let emailFailed = 0;
      let texted = 0;
      if (wantsEmail && emailable.length) {
        const res = await sendReminder({
          data: { eventId, presetId: "manual", guestIds: emailable.map((g) => g.id) },
        });
        emailSent = res.sent;
        emailFailed = res.failed;
      }
      if (wantsSms && textable.length) {
        const hostFirst = (event!.hosts?.[0]?.name || "").trim().split(/\s+/)[0] || "";
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const body = `${event!.title || "Our event"} — ${hostFirst ? `${hostFirst} here. ` : ""}Reminder. Details: ${origin}/s/${eventId}`;
        const r = await queueSmsFn({
          data: {
            eventId,
            body,
            recipients: textable.map((g) => ({ phone: g.phone, guestId: g.id, guestName: g.name })),
          },
        });
        texted = r.queued;
        if (r.blockedCap > 0) {
          toast.warning(
            `${r.blockedCap} guest${r.blockedCap === 1 ? "" : "s"} not texted — you've reached your plan's SMS limit for this event.`,
            { duration: 8000 },
          );
        }
      }
      logEventReminder(
        eventId,
        undefined,
        `Manual send — ${emailSent} email${emailSent === 1 ? "" : "s"}, ${texted} text${texted === 1 ? "" : "s"}`,
      );
      toast(
        emailFailed
          ? `Sent ${emailSent} email${emailSent === 1 ? "" : "s"} and ${texted} text${texted === 1 ? "" : "s"}, ${emailFailed} could not be delivered.`
          : `Sent ${emailSent} email${emailSent === 1 ? "" : "s"} and ${texted} text${texted === 1 ? "" : "s"}.`,
      );
      refreshLastSent();
    } catch (err) {
      toast(toUserMessage(err, "Could not send the reminder."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-ink/5 bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif text-xl">Event reminders</h3>
        <button
          type="button"
          disabled={reminderAtCap || sending}
          onClick={sendNow}
          className="rounded-full bg-velvet px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sending ? "Sending…" : "Send reminder now"}
        </button>
      </div>
      {reminderCap !== null && (
        <div className={`mt-3 rounded-md px-3 py-2 text-xs ${reminderAtCap ? "bg-red-50 text-red-700" : "bg-secondary/40 text-muted-foreground"}`}>
          {reminderAtCap ? (
            <>
              Your {tier === "postcard" ? "Postcard" : "Whisper"} plan includes {reminderCap} reminder{reminderCap === 1 ? "" : "s"} per event.{" "}
              <Link to="/pricing" className="font-medium underline">Upgrade to {tier === "postcard" ? "Whisper" : "Host"}</Link>{" "}
              for more.
            </>
          ) : (
            <>
              {sentCount} of {reminderCap} reminder{reminderCap === 1 ? "" : "s"} sent on {tier === "postcard" ? "Postcard" : "Whisper"}.{" "}
              <Link to="/pricing" className="font-medium underline">Upgrade</Link>{" "}
              for unlimited.
            </>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Ticked reminders go out automatically at the time you choose, in your event's own time zone, to everyone who said
        yes or maybe, plus anyone who hasn't answered. Guests without an email address are skipped. You can also send one
        right now, by email or text, to the people you pick below.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {REMINDER_PRESETS.map((p) => {
          const active = selected.has(p.id);
          const time = reminderTimeFor(p.id, event!.reminderTimes);
          const when = reminderWhenLabel(event!.date, event!.timezone, p.days, time);
          const warning = active ? reminderWarning(event!.date, event!.timezone, p.days, time) : null;
          return (
            <div
              key={p.id}
              className={`rounded-md px-3 py-2 text-xs ring-1 transition ${
                active ? "bg-velvet text-white ring-velvet" : "bg-secondary ring-ink/10"
              }`}
            >
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => togglePreset(p.id)}
                  className="mt-0.5 h-4 w-4 accent-current"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{p.label}</span>
                  {when ? (
                    <span className={`block text-[11px] ${active ? "text-white/80" : "text-muted-foreground"}`}>
                      {when}
                    </span>
                  ) : null}
                </span>
              </label>
              {active ? (
                <div className="mt-2 flex items-center gap-2">
                  <label className={`text-[11px] ${active ? "text-white/80" : "text-muted-foreground"}`}>
                    Send at
                  </label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setReminderTime(eventId, p.id, e.target.value)}
                    className="rounded border border-ink/10 bg-card px-2 py-1 text-[13px] text-ink"
                    aria-label={`Send time for ${p.label}`}
                  />
                  <span className={`text-[11px] ${active ? "text-white/70" : "text-muted-foreground"}`}>
                    event time
                  </span>
                </div>
              ) : null}
              {warning ? (
                <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{warning}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <ScheduledReminderSms event={event!} eventId={eventId} />




      <div className="mt-5">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Send one now</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["email", "sms", "both"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={`min-h-11 rounded-full px-4 py-2 text-xs font-medium ring-1 transition ${
                channel === c ? "bg-velvet text-white ring-velvet" : "bg-secondary text-ink ring-ink/10"
              }`}
            >
              {c === "email" ? "Email" : c === "sms" ? "Text" : "Email + text"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {channel === "email"
            ? "Guests without an email address are hidden."
            : channel === "sms"
              ? "Guests without a mobile number, or who replied STOP, are hidden."
              : `Email reaches ${emailable.length}, text reaches ${textable.length} of the people you pick.`}
        </p>
        <div className="mt-2">
          <GuestAudiencePicker
            guests={event!.guests ?? []}
            channel={channel === "sms" ? "sms" : "email"}
            optedOutPhones={channel === "email" ? undefined : optOutSet}
            normalizePhone={normalizePhone}
            lastRemindedAt={lastSent.email}
            lastTextedAt={lastSent.sms}
            defaultFilter="all"
            onChange={setAudience}
          />
        </div>
      </div>

      {upcoming.length > 0 ? (
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Scheduled</div>
          <ul className="mt-2 space-y-1 text-xs">
            {upcoming.map((u) => (
              <li key={u.presetId} className="flex items-center justify-between rounded-md bg-secondary/40 px-3 py-1.5">
                <span>{u.label}</span>
                <span className={u.past ? "text-muted-foreground line-through" : "text-ink"}>
                  {formatStampDate(u.date)}
                  {u.past ? " · past" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {log.length > 0 ? (
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Sent log</div>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {log.slice(0, 5).map((l, i) => (
              <li key={i}>
                {formatTimestamp((l.sentAt))} — {l.note ?? l.presetId ?? "reminder"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function formatMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function csvEscape(v: string | number | undefined) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number | undefined)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ReportsPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const [bringBusy, setBringBusy] = useState(false);

  // Hosts look for every export here, not in the admin-only reports hub, so the
  // potluck sheet CSV lives alongside attendance and payments.
  async function exportBringSheet() {
    setBringBusy(true);
    try {
      const { listBringItems } = await import("@/lib/bring-sheet.functions");
      const r = await listBringItems({ data: { eventId } });
      if (!r.items.length) {
        toast.error("Nothing on the what-to-bring list yet.");
        return;
      }
      const csv = bringToCsv(bringCsvRows(r.items));
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${event.title.replace(/\W+/g, "_")}-what-to-bring.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("Could not build the what-to-bring CSV.");
    } finally {
      setBringBusy(false);
    }
  }

  const c = rsvpCounts(event);
  const report = paymentReport(event);
  const responseRate = c.total === 0 ? 0 : Math.round(((c.yes + c.no + c.maybe) / c.total) * 100);

  const shirtSizesOn = !!event.tshirtSizesEnabled;
  const shirtTally = tallyShirtSizes(event.guests);

  function exportAttendance() {
    const header = ["Name", "Email", "Phone", "RSVP", "Adults", "Children", "Pets", "Total in party", "Address"];
    if (shirtSizesOn) header.push("T-shirt size", "Plus-one sizes");
    const rows: (string | number | undefined)[][] = [
      header,
      ...event.guests.map((g) => {
        const row: (string | number | undefined)[] = [
          g.name,
          g.email,
          g.phone,
          g.status,
          g.adults ?? 1,
          g.children ?? 0,
          g.pets ?? 0,
          (g.adults ?? 1) +
            (g.children ?? 0) +
            (g.pets ?? 0) +
            (Array.isArray(g.plusOnes)
              ? g.plusOnes.filter((p) => (p?.name ?? "").trim().length > 0).length
              : 0),
          g.address ?? "",
        ];
        if (shirtSizesOn) {
          row.push(
            shirtSizeLabel(g.shirtSize),
            (Array.isArray(g.plusOnes) ? g.plusOnes : [])
              .map((p) => `${p.name || "plus-one"}: ${shirtSizeLabel(p.shirtSize) || "no size"}`)
              .join("; "),
          );
        }
        return row;
      }),
    ];
    downloadCsv(`${event.title.replace(/\W+/g, "_")}-attendance.csv`, rows);
  }

  function exportShirtOrder() {
    const rows: (string | number | undefined)[][] = [
      ["Size", "Quantity"],
      ...shirtTally.counts.map((r) => [r.label, r.count]),
    ];
    downloadCsv(`${event.title.replace(/\W+/g, "_")}-shirt-order.csv`, rows);
  }

  function exportPayments() {
    const rows: (string | number | undefined)[][] = [
      [
        "Name",
        "Email",
        "Phone",
        "Status",
        "Per-person",
        "Headcount",
        "Adults billed",
        "Children billed",
        "Owed",
        "Paid (net)",
        "Refunded",
        "Balance",
        "Methods",
        "Last payment",
        "Sent at",
        "Reminders",
      ],
      ...event.guests.map((g) => {
        const owed = guestOwedAmount(event, g);
        const perPerson = g.payment?.amount ?? event.paymentAmount ?? 0;
        const net = Math.max(0, guestCollected(event, g));
        const hist = paymentHistory(g);
        const lastEntry = hist.length ? hist[hist.length - 1] : undefined;
        return [
          g.name,
          g.email,
          g.phone,
          g.payment?.status ?? "not_sent",
          perPerson,
          // Billed heads, matching the invoice: billable adults (incl. named
          // plus-ones) + children. Read-only column, no pricing change.
          billableAdults(g) + billableChildren(g),
          billableAdults(g),
          billableChildren(g),
          owed,
          net,
          refundedTotal(g),
          Math.max(0, owed - net),
          Array.from(new Set(hist.map((h) => PAYMENT_METHOD_LABELS[h.method] ?? h.method))).join(" / "),
          lastEntry ? formatStampDate((lastEntry.at)) : "",
          g.payment?.sentAt ?? "",
          g.payment?.remindersSent ?? 0,
        ];
      }),
    ];
    downloadCsv(`${event.title.replace(/\W+/g, "_")}-payments.csv`, rows);
  }

  const tiles = useTileFilters(eventId);

  return (
    <div className="rounded-xl border border-ink/5 bg-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl">Reports</h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Snapshot</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ReportTile label="Invited" value={c.total} activeNote="Showing all" active={!tiles.active} onClick={tiles.clear} />
        <ReportTile label="Confirmed" value={c.yes} active={tiles.isOn("yes")} onClick={() => tiles.toggleRsvp("yes")} />
        <ReportTile label="Maybe" value={c.maybe} active={tiles.isOn("maybe")} onClick={() => tiles.toggleRsvp("maybe")} />
        <ReportTile label="Declined" value={c.no} active={tiles.isOn("no")} onClick={() => tiles.toggleRsvp("no")} />
        <ReportTile
          label="No response"
          value={Math.max(0, c.total - c.yes - c.maybe - c.no)}
          active={tiles.isOn("pending")}
          onClick={() => tiles.toggleRsvp("pending")}
        />
        <ReportTile
          label="Adults coming"
          value={c.adults}
          active={tiles.has === "adults"}
          onClick={() => tiles.toggleHas("adults")}
        />
        <ReportTile
          label="Children coming"
          value={c.children}
          active={tiles.has === "kids"}
          onClick={() => tiles.toggleHas("kids")}
        />
        <ReportTile label="Pets coming" value={c.pets} active={tiles.has === "pets"} onClick={() => tiles.toggleHas("pets")} />
        <ReportTile label="Total attendees" value={c.attendees} accent />
        <ReportTile label="Response rate" value={`${responseRate}%`} />
      </div>
      {tiles.active ? (
        <button
          type="button"
          onClick={tiles.clear}
          className="mt-3 min-h-[44px] rounded-full bg-ink px-4 text-xs font-medium text-white hover:bg-velvet"
        >
          Clear guest list filters
        </button>
      ) : null}

      {shirtSizesOn ? (
        <div className="mt-5 rounded-xl border border-ink/10 bg-secondary/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">T-shirt size tally</p>
            <span className="text-[11px] text-muted-foreground">
              {shirtTally.total} recorded
              {shirtTally.missing > 0 ? ` · ${shirtTally.missing} still missing a size` : ""}
            </span>
          </div>
          {shirtTally.counts.length > 0 ? (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {shirtTally.counts.map((r) => (
                  <span key={r.size} className="rounded-full bg-card px-3 py-1 text-[11px] font-medium text-ink ring-1 ring-ink/10">
                    {r.label} ×{r.count}
                  </span>
                ))}
              </div>
              <button
                onClick={exportShirtOrder}
                className="mt-3 rounded-full px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-secondary"
              >
                Export shirt order CSV
              </button>
            </>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No sizes yet. Guests can add a size any time from their invite link.
            </p>
          )}
        </div>
      ) : null}

      {report.enabled ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <ReportTile label="Billed" value={formatMoney(report.billed, report.currency)} />
            <ReportTile label="Collected" value={formatMoney(report.collected, report.currency)} accent />
            <ReportTile label="Outstanding" value={formatMoney(report.outstanding, report.currency)} />
            <ReportTile label="Refunded" value={formatMoney(report.refunded, report.currency)} />
            <ReportTile label="Paid guests" value={report.byStatus.paid} />
          </div>
          {report.childHeads > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <ReportTile
                label={`Adults billed (${report.adultHeads})`}
                value={formatMoney(report.billedAdults, report.currency)}
              />
              <ReportTile
                label={`Children billed (${report.childHeads})`}
                value={formatMoney(report.billedChildren, report.currency)}
              />
              <ReportTile
                label="Child rate"
                value={formatMoney(report.childRate, report.currency)}
              />
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
            {(["not_sent","sent","pending","partial","paid","refunded","canceled"] as PaymentStatus[]).map((s) => (
              <span key={s} className={`rounded-full px-2 py-0.5 ${paymentBadgeStyle(s)}`}>
                {paymentLabel(s)}: {report.byStatus[s]}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">Enable payment collection above to see billing reports.</p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={exportAttendance}
          className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-velvet"
        >
          Export attendance CSV
        </button>
        {report.enabled ? (
          <button
            onClick={exportPayments}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-secondary"
          >
            Export payments CSV
          </button>
        ) : null}
        {event.bringSheetEnabled ? (
          <button
            onClick={exportBringSheet}
            disabled={bringBusy}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-secondary disabled:opacity-50"
          >
            {bringBusy ? "Building…" : "Export what-to-bring CSV"}
          </button>
        ) : null}
        <button
          onClick={() => exportSummaryPdf(event, c, report, responseRate)}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-secondary"
        >
          Download summary PDF
        </button>
      </div>
    </div>
  );
}

function ReportTile({
  label,
  value,
  accent,
  active,
  activeNote,
  onClick,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  active?: boolean;
  activeNote?: string;
  onClick?: () => void;
}) {
  const cls = `min-h-[44px] rounded-lg p-3 text-left ring-1 transition ${
    active
      ? "bg-velvet text-white ring-velvet shadow-sm"
      : accent
        ? "bg-velvet/90 text-white ring-ink/5"
        : "bg-secondary/40 ring-ink/5"
  } ${onClick && !active ? "hover:ring-velvet/60" : ""}`;
  const light = active || accent;
  const inner = (
    <>
      <div className="text-lg font-medium">{value}</div>
      <div className={`text-[10px] uppercase tracking-widest ${light ? "text-white/70" : "text-muted-foreground"}`}>
        {label}
      </div>
      {active ? (
        <div className="text-[10px] font-semibold uppercase tracking-wider">{activeNote ?? "Filtering ✓"}</div>
      ) : null}
    </>
  );
  if (!onClick) return <div className={cls}>{inner}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={!!active} title={`Show only ${label}`} className={cls}>
      {inner}
    </button>
  );
}

const STORE_BADGE: Record<string, string> = {
  Amazon: "bg-[#FF9900]/15 text-[#7a4a00]",
  Target: "bg-[#cc0000]/10 text-[#a30000]",
  Walmart: "bg-[#0071dc]/10 text-[#004f9a]",
  Etsy: "bg-[#F1641E]/15 text-[#a23b00]",
  Zola: "bg-rose-100 text-rose-800",
  Honeyfund: "bg-amber-100 text-amber-900",
  Babylist: "bg-emerald-100 text-emerald-900",
};

function storeBadge(store: string) {
  return STORE_BADGE[store] ?? "bg-secondary text-ink";
}

function RegistryPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const [url, setUrl] = useState("");
  const [store, setStore] = useState<string>("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const list = event.registry ?? [];

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    // Accept "www.example.com" or "example.com" by auto-prefixing https://
    let normalized = url.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized.replace(/^\/+/, "")}`;
    }
    try {
      const parsed = new URL(normalized);
      if (!parsed.hostname.includes(".")) throw new Error("bad host");
    } catch {
      toast("That doesn't look like a valid web address. Try something like www.amazon.com/registry/123");
      return;
    }
    addRegistry(eventId, normalized, label || undefined, note || undefined, store || undefined);
    setUrl("");
    setStore("");
    setLabel("");
    setNote("");
  }

  const detected = url ? detectRegistryStore(url) : "";
  const purchasedCount = list.filter((r) => r.purchased).length;

  return (
    <div className="rounded-xl border border-ink/5 bg-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl">Gift registry</h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {list.length} link{list.length === 1 ? "" : "s"}
          {list.length > 0 ? ` · ${purchasedCount} marked purchased` : ""}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Add registries from Amazon, Target, Walmart, Etsy, Zola — or paste any custom link. The store is auto-detected. Mark items as purchased to keep track. You can paste with or without <code>https://</code>.
      </p>

      <form onSubmit={onAdd} className="mt-4 flex flex-col gap-2 rounded-md bg-secondary/40 p-3">
        <div className="flex flex-wrap gap-2">
          <input
            required
            type="text"
            placeholder="Paste registry URL (www.amazon.com/… or https://…)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 min-w-[220px] rounded-md bg-card px-3 py-2 text-sm ring-1 ring-ink/10 focus:outline-none"
          />

          <select
            value={store}
            onChange={(e) => setStore(e.target.value)}
            className="rounded-md bg-card px-3 py-2 text-sm ring-1 ring-ink/10 focus:outline-none"
          >
            <option value="">{detected ? `Auto: ${detected}` : "Auto-detect store"}</option>
            {REGISTRY_STORES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            placeholder="Label (e.g. Kitchen wishlist) — optional"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="flex-1 min-w-[180px] rounded-md bg-card px-3 py-2 text-sm ring-1 ring-ink/10 focus:outline-none"
          />
          <input
            placeholder="Note for guests — optional"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="flex-1 min-w-[180px] rounded-md bg-card px-3 py-2 text-sm ring-1 ring-ink/10 focus:outline-none"
          />
          <button type="submit" className="rounded-md bg-velvet px-4 py-2 text-sm font-medium text-white">
            Add
          </button>
        </div>
      </form>

      <div className="mt-4 space-y-2">
        {list.length === 0 ? (
          <div className="rounded-md bg-secondary/30 p-6 text-center text-xs text-muted-foreground">
            No registries yet. Add your first link above.
          </div>
        ) : (
          list.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-md bg-secondary/40 p-3">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${storeBadge(r.store)}`}>
                {r.store}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium text-ink underline decoration-velvet/40 underline-offset-4 hover:text-velvet"
                  title={r.url}
                >
                  {r.label || r.url}
                </a>
                {r.note ? <div className="text-[11px] text-muted-foreground">{r.note}</div> : null}
              </div>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!!r.purchased}
                  onChange={(e) => updateRegistry(eventId, r.id, { purchased: e.target.checked })}
                />
                Purchased
              </label>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(r.url)}
                className="rounded-full px-2.5 py-1 text-[11px] font-medium text-ink ring-1 ring-ink/15 hover:bg-card"
              >
                Copy link
              </button>
              <button
                type="button"
                onClick={() => removeRegistry(eventId, r.id)}
                className="rounded-full px-2 py-1 text-[11px] text-muted-foreground hover:text-destructive"
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ExtrasPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const tier = useTier();
  // When Run of Show is unlocked (Atelier/Owner), the day-of toolkit already covers the itinerary,
  // so we hide the duplicate Schedule / itinerary field here under Nice touches.
  const hasRunOfShow = tier === "atelier" || tier === "owner";
  const isPostcard = tier === "postcard";
  return (
    <div className="rounded-xl border border-ink/5 bg-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl">Event extras</h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Tie it together</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {isPostcard
          ? "Two simple touches: dress code and a hashtag. Playlist, livestream, hotel block, and itinerary are on Whisper and up."
          : <>Add the little details guests love: a dress code, a hashtag for photos, a shared playlist, a livestream link, hotel block info{hasRunOfShow ? "" : ", and an itinerary"}.</>}
        {hasRunOfShow && <span className="ml-1 text-velvet">Your run-of-show covers the schedule.</span>}
      </p>


      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Dress code">
          <input
            placeholder="e.g. Black tie, Garden chic, Cozy casual"
            value={event.dressCode ?? ""}
            onChange={(e) => updateEvent(eventId, { dressCode: e.target.value })}
            className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
          />
        </Field>
        <Field label="Hashtag">
          <input
            placeholder="e.g. SmithWedding2026"
            value={event.hashtag ?? ""}
            onChange={(e) => updateEvent(eventId, { hashtag: e.target.value.replace(/^#/, "") })}
            className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
          />
        </Field>
        {!isPostcard && (
          <>
            <Field label="Shared playlist URL (Spotify / Apple Music)">
              <input
                type="text"
                placeholder="open.spotify.com/playlist/… (with or without https://)"
                value={event.playlistUrl ?? ""}
                onChange={(e) => updateEvent(eventId, { playlistUrl: e.target.value })}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (!v) return;
                  const normalized = /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`;
                  if (normalized !== v) updateEvent(eventId, { playlistUrl: normalized });
                }}
                className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
              />
            </Field>
            <SongField eventId={eventId} event={event} />

            <Field label="Livestream URL (for remote guests)">
              <input
                type="text"
                placeholder="youtube.com/live/… or zoom.us/j/… (with or without https://)"
                value={event.livestreamUrl ?? ""}
                onChange={(e) => updateEvent(eventId, { livestreamUrl: e.target.value })}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (!v) return;
                  const normalized = /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`;
                  if (normalized !== v) updateEvent(eventId, { livestreamUrl: normalized });
                }}
                className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
              />
            </Field>

            <Field label="Accommodations / hotel block">
              <textarea
                rows={2}
                placeholder="Marriott downtown — group code KEN26 — $159/nt until June 1"
                value={event.accommodations ?? ""}
                onChange={(e) => updateEvent(eventId, { accommodations: e.target.value })}
                className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
              />
            </Field>
            {!hasRunOfShow && (
              <Field label="Schedule / itinerary">
                <textarea
                  rows={2}
                  placeholder="5:30 Ceremony · 6:30 Cocktails · 7:30 Dinner · 9:00 Dancing"
                  value={event.schedule ?? ""}
                  onChange={(e) => updateEvent(eventId, { schedule: e.target.value })}
                  className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
                />
              </Field>
            )}

            <Field label="Transit & transportation notes (optional)">
              <textarea
                rows={2}
                placeholder="🚇 2/3 train to 14th St · 🚗 Valet on Mercer · 🚌 Shuttle from Hotel Marriott 6:30pm · Rideshare drop-off on 5th Ave"
                value={event.transit ?? ""}
                onChange={(e) => updateEvent(eventId, { transit: e.target.value })}
                className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
              />
            </Field>
          </>
        )}
      </div>

      {!isPostcard && (event.playlistUrl || event.livestreamUrl) ? (
        <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
          {event.playlistUrl ? (
            <a href={/^https?:\/\//i.test(event.playlistUrl) ? event.playlistUrl : `https://${event.playlistUrl.replace(/^\/+/, "")}`} target="_blank" rel="noreferrer" className="rounded-full bg-ink px-3 py-1 font-medium text-white hover:bg-velvet">
              🎶 Open playlist
            </a>
          ) : null}
          {event.livestreamUrl ? (
            <a href={/^https?:\/\//i.test(event.livestreamUrl) ? event.livestreamUrl : `https://${event.livestreamUrl.replace(/^\/+/, "")}`} target="_blank" rel="noreferrer" className="rounded-full px-3 py-1 font-medium text-ink ring-1 ring-ink/15 hover:bg-secondary">
              📺 Watch livestream
            </a>
          ) : null}

        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/**
 * Invitation song. The host uploads one audio file from their computer (or a
 * track they generated with AI) and guests play or download it on the
 * invitation. Streaming-service links stay in the playlist field above: those
 * are launch links, not files we may host or hand out.
 */
function SongField({ eventId, event }: { eventId: string; event: KEvent }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const problem = songFileError(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      const url = await uploadMediaFile(file, { source: "invite", filename: file.name });
      updateEvent(eventId, {
        songUrl: url,
        songTitle: event.songTitle || file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80),
        songAllowDownload: event.songAllowDownload ?? true,
      });
      toast.success("Song added to the invitation");
    } catch {
      uploadFailedToast(() => pick(file), { message: "Song upload failed" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="sm:col-span-2">
      <Field label="Invitation song (upload from your computer)">
        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept={SONG_ACCEPT}
            disabled={busy}
            onChange={(e) => void pick(e.target.files?.[0])}
            className="w-full rounded-md bg-secondary px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1 file:text-white"
          />
          <p className="text-[11px] text-muted-foreground">
            MP3, M4A, AAC, OGG or WAV, up to 20MB. Only upload music you own or have the right to
            share. {busy ? "Uploading…" : ""}
          </p>
          <InviteSongPicker eventId={eventId} currentTitle={event.songTitle ?? null} />
          {event.songUrl ? (
            <div className="space-y-2 rounded-xl bg-secondary/60 p-3">
              <input
                type="text"
                placeholder="Song title shown to guests"
                value={event.songTitle ?? ""}
                onChange={(e) => updateEvent(eventId, { songTitle: e.target.value.slice(0, 80) })}
                className="w-full rounded-md bg-card px-3 py-2 text-sm focus:outline-none"
              />
              <input
                type="text"
                placeholder="Artist or credit (optional)"
                value={event.songArtist ?? ""}
                onChange={(e) => updateEvent(eventId, { songArtist: e.target.value.slice(0, 80) })}
                className="w-full rounded-md bg-card px-3 py-2 text-sm focus:outline-none"
              />
              <label className="flex items-center gap-2 text-xs text-ink/80">
                <input
                  type="checkbox"
                  checked={event.songAllowDownload !== false}
                  onChange={(e) => updateEvent(eventId, { songAllowDownload: e.target.checked })}
                />
                Let guests download the song
              </label>
              <audio controls preload="metadata" src={event.songUrl} className="w-full" />
              <button
                type="button"
                onClick={() =>
                  updateEvent(eventId, {
                    songUrl: undefined,
                    songTitle: undefined,
                    songArtist: undefined,
                  })
                }
                className="text-xs text-muted-foreground underline underline-offset-4"
              >
                Remove song
              </button>
            </div>
          ) : null}
        </div>
      </Field>
    </div>
  );
}


function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = MAX_PARTY_COUNT,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Number.isFinite(n) ? Math.floor(n) : min));
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="flex h-10 items-center rounded-md border border-ink/10 bg-card">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          className="px-3 text-lg text-muted-foreground hover:text-ink"
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
          className="w-full border-none bg-transparent text-center text-sm focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          title={value >= max ? `Up to ${max} per guest — add another guest for a larger party.` : undefined}
          className="px-3 text-lg text-muted-foreground hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function HostsPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const hosts = event.hosts ?? [];
  const ROLE_OPTIONS = ["Host", "Co-host", "Hostess", "Mother of the Bride", "Father of the Bride", "Mother of the Groom", "Father of the Groom", "Maid of Honor", "Best Man", "Planner", "Other"];

  const onPhoto = async (hostId: string, file: File | null) => {
    if (!file) return;
    const toastId = `host-photo-${hostId}`;
    toast.loading("Uploading host photo...", { id: toastId });
    try {
      updateHost(eventId, hostId, { photo: await uploadEventMedia(file) });
      toast.success("Host photo uploaded.", { id: toastId });
    } catch (error) {
      toast.error("Couldn't upload that photo.", {
        id: toastId,
        description: toUserMessage(error, "Please try again."),
      });
    }
  };

  return (
    <div className="space-y-6">
      <HelpCard>
        Tell your guests who's throwing this event. Add yourself first, then any co-hosts or special people
        (parents, planners, maid of honor, best man — anyone you'd like recognized). This shows up on the
        invitation guests receive.
      </HelpCard>

      <div className="space-y-4">
        {hosts.map((h) => (
          <div key={h.id} className="rounded-xl border border-ink/5 bg-card p-5">
            <div className="flex items-start gap-4">
              <div className="w-28 shrink-0">
                <label className="block cursor-pointer">
                  {h.photo ? (
                    <FocalImage url={h.photo} alt={h.name} className="mx-auto h-20 w-20 rounded-full ring-2 ring-velvet/20" />
                  ) : (
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-velvet/10 text-2xl text-velvet">
                      {h.name?.[0]?.toUpperCase() ?? "+"}
                    </div>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(h.id, e.target.files?.[0] ?? null)} />
                  <span className="mt-1 block text-center text-[10px] text-velvet underline underline-offset-2">
                    {h.photo ? "Change" : "Add photo"}
                  </span>
                </label>
                {h.photo ? (
                  <div className="mt-2">
                    <FocalAdjuster
                      url={h.photo}
                      onChange={(url: string) => updateHost(eventId, h.id, { photo: url })}
                      round
                      label={`Reposition ${h.name || "host"} photo`}
                    />
                  </div>
                ) : null}
              </div>

              <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Their role">
                  <select
                    value={ROLE_OPTIONS.includes(h.role) ? h.role : "Other"}
                    onChange={(e) => updateHost(eventId, h.id, { role: e.target.value === "Other" ? h.role || "" : e.target.value })}
                    className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
                  >
                    {ROLE_OPTIONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                  {!ROLE_OPTIONS.includes(h.role) || h.role === "Other" ? (
                    <input
                      value={h.role === "Other" ? "" : h.role}
                      onChange={(e) => updateHost(eventId, h.id, { role: e.target.value })}
                      placeholder="Type a custom role"
                      className="mt-2 w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
                    />
                  ) : null}
                </Field>
                <Field label="Full name">
                  <input
                    value={h.name}
                    onChange={(e) => updateHost(eventId, h.id, { name: e.target.value })}
                    placeholder="e.g. Sophia Laurent"
                    className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
                  />
                </Field>
                <Field label="Relationship (optional)">
                  <input
                    value={h.relationship ?? ""}
                    onChange={(e) => updateHost(eventId, h.id, { relationship: e.target.value })}
                    placeholder="e.g. Bride's mother"
                    className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
                  />
                </Field>
                <Field label="Email (optional)">
                  <input
                    type="email"
                    value={h.email ?? ""}
                    onChange={(e) => updateHost(eventId, h.id, { email: e.target.value })}
                    placeholder="them@example.com"
                    className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
                  />
                </Field>
                <Field label="Phone (optional)">
                  <input
                    value={h.phone ?? ""}
                    onChange={(e) => updateHost(eventId, h.id, { phone: e.target.value })}
                    placeholder="(555) 123-4567"
                    className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="A short bio or note (optional)">
                    <textarea
                      value={h.bio ?? ""}
                      onChange={(e) => updateHost(eventId, h.id, { bio: e.target.value })}
                      placeholder="A line guests will see. e.g. 'So excited to celebrate with you!'"
                      rows={2}
                      className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
                    />
                  </Field>
                </div>
                <label className="sm:col-span-2 flex items-center gap-2 text-sm text-ink/80">
                  <input
                    type="checkbox"
                    checked={h.showContact ?? false}
                    onChange={(e) => updateHost(eventId, h.id, { showContact: e.target.checked })}
                  />
                  Show email and phone to guests on the invite
                </label>
              </div>
              <button
                onClick={() => removeHost(eventId, h.id)}
                className="shrink-0 rounded-md border border-ink/10 px-2 py-1 text-xs text-ink/60 hover:bg-ink/5"
                aria-label="Remove host"
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        {hosts.length === 0 && (
          <div className="rounded-xl border border-dashed border-ink/15 bg-card/40 p-8 text-center text-sm text-ink/60">
            No hosts added yet. Add yourself first below.
          </div>
        )}
      </div>

      <button
        onClick={() => addHost(eventId, { role: hosts.length === 0 ? "Host" : "Co-host", name: "", showContact: false })}
        className="w-full rounded-md border border-velvet/40 bg-velvet/5 px-4 py-3 text-sm font-medium text-velvet hover:bg-velvet/10"
      >
        + Add a {hosts.length === 0 ? "host" : "co-host"}
      </button>

      <SectionDivider
        title="Collaborators"
        subtitle="The list above is who guests see. This is who can actually get into the planning."
      />
      <HostAndAtelierGate
        minTier="whisper"
        feature="Co-hosts and collaborators"
        description="Sharing an event starts on Whisper (1 collaborator). Host includes 2 and Atelier 5."
      >
        <EventCollaboratorsCard eventId={eventId} />
      </HostAndAtelierGate>
    </div>
  );
}

const THANKS_DESIGNS: { id: ThankYouCard["design"]; name: string; bg: string; ink: string; accent: string }[] = [
  { id: "ivory", name: "Ivory & Gold", bg: "bg-[#fdf8ef]", ink: "text-[#2a221b]", accent: "text-[#b08a3e]" },
  { id: "velvet", name: "Velvet Romance", bg: "bg-[#1f1530]", ink: "text-[#f6efe1]", accent: "text-[#e7b8c5]" },
  { id: "garden", name: "Garden Pastel", bg: "bg-[#eaf3ec]", ink: "text-[#23362a]", accent: "text-[#5a8a64]" },
  { id: "midnight", name: "Midnight Bloom", bg: "bg-[#0f1a2c]", ink: "text-[#eef2ff]", accent: "text-[#a5b4fc]" },
  { id: "confetti", name: "Confetti Pop", bg: "bg-[#fff2f5]", ink: "text-[#2a1722]", accent: "text-[#e85a8a]" },
];




function ThankYouPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const tier = useTier();
  // Host plan needs the $30 add-on to unlock the full studio.
  // Free/Whisper plans see a soft upgrade nudge.
  const [hasThankYouAddon, setHasThankYouAddon] = useState(false);
  const previewTier = usePreviewTier();
  useEffect(() => {
    let alive = true;
    import("@/lib/entitlements-client").then(async ({ getEntitlements }) => {
      try {
        const r = await getEntitlements();
        if (alive) setHasThankYouAddon(!!(r as { thankYouCardsPaid?: boolean }).thankYouCardsPaid);
      } catch {
        /* not signed in */
      }
    });
    return () => {
      alive = false;
    };
  }, [previewTier]);
  const studioUnlocked =
    tier === "atelier" || tier === "owner" || (tier === "host" && hasThankYouAddon);
  const showHostUpsell = tier === "host" && !hasThankYouAddon;

  const cards = event.thankYouCards ?? [];
  const yesGuests = event.guests.filter((g) => g.status === "yes");
  const draft = event.thankYouDraft;
  const defaultMessage = `Thank you so much for celebrating ${event.title} with us. Your presence made the night unforgettable. With love,`;
  // The default is a *seed*, never a regeneration. If the host has any saved
  // copy anywhere (composer draft, or the most recent unsent card), that wins.
  // Regenerating the default over saved content is how a custom, multi-paragraph
  // note used to silently turn back into the template on the next visit.
  const savedCard = [...cards].reverse().find((c) => !c.sentAt && !c.autoSentAt);
  const seed = {
    message: draft?.message ?? savedCard?.message ?? defaultMessage,
    signOff: draft?.signOff ?? savedCard?.signOff ?? "",
    design: draft?.design ?? savedCard?.design ?? ("ivory" as ThankYouCard["design"]),
    channel: (draft?.channel ?? savedCard?.channel ?? "email") as ThankYouChannelLocal,
    recipientIds: draft?.recipientIds ?? savedCard?.recipientIds ?? yesGuests.map((g) => g.id),
    photo: draft?.photo ?? savedCard?.photo,
    gif: draft?.gif ?? savedCard?.gif,
    piece:
      (draft?.pieceUrl ?? savedCard?.pieceUrl)
        ? {
            url: (draft?.pieceUrl ?? savedCard?.pieceUrl)!,
            title: (draft?.pieceTitle ?? savedCard?.pieceTitle) ?? "A piece for you",
            kind: (draft?.pieceKind ?? savedCard?.pieceKind) ?? "song",
          }
        : undefined,
    sendMode: draft?.sendMode ?? "now",
    scheduledFor: draft?.scheduledFor ?? "",
    afterHours: draft?.afterHours ?? savedCard?.autoSendAfterHours ?? 48,
    cardId: draft?.cardId ?? savedCard?.id,
  };
  const [message, setMessage] = useState(seed.message);
  const [signOff, setSignOff] = useState(seed.signOff);
  const [design, setDesign] = useState<ThankYouCard["design"]>(seed.design);
  const [channel, setChannel] = useState<ThankYouChannelLocal>(seed.channel);
  const [recipients, setRecipients] = useState<string[]>(seed.recipientIds);
  const [photo, setPhoto] = useState<string | undefined>(seed.photo);
  const [gif, setGif] = useState<string | undefined>(seed.gif);
  const [piece, setPiece] = useState<AttachedPiece | undefined>(seed.piece);
  const [sendMode, setSendMode] = useState<"now" | "at" | "after">(seed.sendMode);
  const [scheduledFor, setScheduledFor] = useState<string>(seed.scheduledFor);
  const [afterHours, setAfterHours] = useState<number>(seed.afterHours);
  const [linkedCardId, setLinkedCardId] = useState<string | undefined>(seed.cardId);
  const [showEmoji, setShowEmoji] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | undefined>(draft?.updatedAt);
  const [buildingPrintKit, setBuildingPrintKit] = useState(false);
  const [labelStartAt, setLabelStartAt] = useState(1);
  const [addressEdits, setAddressEdits] = useState<Record<string, string>>({});
  const [mailedGuestIds, setMailedGuestIds] = useState<string[]>(savedCard?.mailedGuestIds ?? []);
  const mintLinks = useServerFn(mintThankYouLinks);
  const msgRef = useRef<HTMLTextAreaElement | null>(null);

  // Hydrate once if the saved draft arrives after mount (remote refill) and the
  // host hasn't typed anything yet, so a late sync can't clobber live edits.
  const touchedRef = useRef(false);
  const hydratedRef = useRef(!!draft);
  useEffect(() => {
    if (hydratedRef.current || touchedRef.current || !draft) return;
    hydratedRef.current = true;
    if (draft.message !== undefined) setMessage(draft.message);
    if (draft.signOff !== undefined) setSignOff(draft.signOff);
    if (draft.design) setDesign(draft.design);
    if (draft.channel) setChannel(draft.channel as ThankYouChannelLocal);
    if (draft.recipientIds) setRecipients(draft.recipientIds);
    if (draft.photo !== undefined) setPhoto(draft.photo);
    if (draft.gif !== undefined) setGif(draft.gif);
    if (draft.pieceUrl !== undefined)
      setPiece(
        draft.pieceUrl
          ? {
              url: draft.pieceUrl,
              title: draft.pieceTitle ?? "A piece for you",
              kind: draft.pieceKind ?? "song",
            }
          : undefined,
      );
    if (draft.sendMode) setSendMode(draft.sendMode);
    if (draft.scheduledFor !== undefined) setScheduledFor(draft.scheduledFor);
    if (draft.afterHours !== undefined) setAfterHours(draft.afterHours);
    if (draft.cardId) setLinkedCardId(draft.cardId);
  }, [draft]);

  // Save the composer as the host works. Debounced so typing stays smooth.
  // The latest values also live in a ref so the pending write can be flushed
  // synchronously on unmount: without that, leaving the screen inside the
  // debounce window silently threw away the last edit (the sign-off was the
  // usual casualty, which made persistence look intermittent).
  const draftRef = useRef<Parameters<typeof setThankYouDraft>[1] | null>(null);
  useEffect(() => {
    if (!touchedRef.current) return;
    const snapshot = {
      message,
      signOff,
      design,
      channel,
      recipientIds: recipients,
      photo,
      gif,
      pieceUrl: piece?.url,
      pieceTitle: piece?.title,
      pieceKind: piece?.kind,
      sendMode,
      scheduledFor,
      afterHours,
      cardId: linkedCardId,
    };
    draftRef.current = snapshot;
    const t = setTimeout(() => {
      setThankYouDraft(eventId, snapshot);
      draftRef.current = null;
      setDirty(false);
      setLastSavedAt(new Date().toISOString());
    }, 400);
    return () => clearTimeout(t);
  }, [eventId, message, signOff, design, channel, recipients, photo, gif, piece, sendMode, scheduledFor, afterHours, linkedCardId]);

  useEffect(
    () => () => {
      if (draftRef.current) setThankYouDraft(eventId, draftRef.current);
    },
    [eventId],
  );

  // A hard reload, a tab close, or a swipe back on iOS never unmounts the
  // component, so the unmount flush above cannot run and the last 400ms of
  // typing was lost. pagehide fires in all three cases, visibilitychange covers
  // backgrounding the tab on mobile.
  useEffect(() => {
    const flush = () => {
      if (draftRef.current) {
        setThankYouDraft(eventId, draftRef.current);
        draftRef.current = null;
      }
    };
    const onHidden = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [eventId]);

  // Duplicate unsent cards left over from before the composer was linked to a
  // single card. A duplicated *scheduled* card would send the same note twice.
  const duplicateIds = useMemo(() => findDuplicateThankYouCardIds(cards as never), [cards]);


  /** The host wrote this copy (it isn't the untouched generated template). */
  const hostAuthored = message.trim().length > 0 && message.trim() !== defaultMessage.trim();

  function markTouched() {
    touchedRef.current = true;
    hydratedRef.current = true;
    setDirty(true);
  }


  // What the host sees here has to be what the guest receives. A GIF that is
  // not an absolute https URL renders in this preview and then never loads in
  // an inbox, and an oversized one gets stripped or crawls on mobile data, so
  // both are called out at the moment of choosing.
  const [gifWarning, setGifWarning] = useState<string | null>(null);
  async function inspectGif(url: string | undefined) {
    setGifWarning(null);
    if (!url) return;
    if (isBrowserOnlyMediaUrl(url) || !isEmailSafeImageUrl(url)) {
      setGifWarning(
        "This GIF can't be delivered by email, because it isn't hosted on a public web address. Pick one from the gallery above instead.",
      );
      return;
    }
    try {
      const res = await fetch(url, { method: "HEAD" });
      const size = Number(res.headers.get("content-length") ?? 0);
      if (size > EMAIL_GIF_MAX_BYTES) {
        setGifWarning(
          `This GIF is ${(size / 1_000_000).toFixed(1)} MB. Anything over 1.5 MB is often stripped by email providers or loads very slowly, so a smaller one is safer.`,
        );
      }
    } catch {
      // A blocked HEAD request tells us nothing useful; stay quiet.
    }
  }



  const EMOJI_SET = [
    "❤️","🥰","🌹","✨","🎉","🥂","🍾","💐","🌸","🌟","🙏","💖","💌","🎂","🎈","🥳","🤗","😍","💍","🎁","🌺","🦋","🍀","🌷","💫","🕯️","📸","🎶","🪩","🌙",
  ];

  function insertEmoji(em: string) {
    const ta = msgRef.current;
    if (ta) {
      const start = ta.selectionStart ?? message.length;
      const end = ta.selectionEnd ?? message.length;
      const next = message.slice(0, start) + em + message.slice(end);
      markTouched();
      setMessage(next);
      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + em.length;
      });
    } else {
      markTouched();
      setMessage((m) => m + em);
    }
  }

  function toggle(id: string) {
    markTouched();
    setRecipients((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const toastId = "thank-you-photo";
    toast.loading("Uploading photo...", { id: toastId });
    try {
      const url = await uploadEventMedia(f);
      markTouched();
      setPhoto(url);
      toast.success("Photo uploaded.", { id: toastId });
    } catch (error) {
      toast.error("Couldn't upload that photo.", {
        id: toastId,
        description: toUserMessage(error, "Please try again."),
      });
    }
  }

  /** `send: false` saves a draft only. Otherwise the host's chosen send mode is
   *  the whole instruction: "now" sends immediately, "at"/"after" schedule it
   *  and the cron worker fires it. There is no second switch to arm. */
  async function createDraft(send: boolean) {
    try {
      await assertEventAddonAccess({ data: { eventId, kind: "thank_you_cards" } });
    } catch (error) {
      toast.error(toUserMessage(error, "The thank-you card studio is not unlocked."));
      return;
    }
    if (!message.trim()) {
      toast.error("Add a message first.");
      return;
    }
    if (recipients.length === 0) {
      toast.error("Select at least one recipient.");
      return;
    }
    if (!send) {
      setThankYouDraft(eventId, {
        message,
        signOff,
        design,
        channel,
        recipientIds: recipients,
        photo,
        gif,
        pieceUrl: piece?.url,
        pieceTitle: piece?.title,
        pieceKind: piece?.kind,
        sendMode,
        scheduledFor,
        afterHours,
        cardId: linkedCardId,
      });
      draftRef.current = null;
      const saved = await saveEventsNow(eventId);
      setDirty(false);
      setLastSavedAt(new Date().toISOString());
      if (saved) toast.success("Thank-you card saved.");
      else toast.error("Saved on this device, but cloud sync needs another try.");
      return;
    }

    const scheduledIso =
      send && sendMode === "at" && scheduledFor ? new Date(scheduledFor).toISOString() : undefined;
    const isFutureSchedule = !!scheduledIso && new Date(scheduledIso).getTime() > Date.now();
    const isRelativeSchedule = send && sendMode === "after" && channel === "email";
    if (send && sendMode === "at" && !isFutureSchedule) {
      toast.error("Pick a date and time in the future, or choose Send right away.");
      return;
    }
    const payload = {
      message,
      signOff,
      design,
      photo,
      gif,
      pieceUrl: piece?.url,
      pieceTitle: piece?.title,
      pieceKind: piece?.kind,
      channel,
      recipientIds: recipients,
      scheduledFor: scheduledIso,
      hostAuthored,
      // Re-authoring clears any prior hold so the worker treats it as fresh.
      heldAt: undefined,
      heldReason: undefined,
      // Scheduling *is* the instruction to send: arm the worker in the same step.
      ...(isFutureSchedule || isRelativeSchedule
        ? { autoSend: true, autoSendAfterHours: isRelativeSchedule ? afterHours : undefined }
        : { autoSend: false, autoSendAfterHours: undefined }),
    };
    // Re-saving an edit updates the card the composer is already linked to.
    // Adding a new one every time is how duplicate, near-identical scheduled
    // sends piled up (and guests would have received the same card twice).
    const existing = linkedCardId
      ? cards.find((c) => c.id === linkedCardId && !c.sentAt && !c.autoSentAt)
      : undefined;
    let card: ThankYouCard;
    if (existing) {
      updateThankYouCard(eventId, existing.id, payload);
      card = { ...existing, ...payload } as ThankYouCard;
    } else {
      card = addThankYouCard(eventId, payload);
      setLinkedCardId(card.id);
    }

    if (isFutureSchedule || isRelativeSchedule) {
      // Keep the composer draft: it *is* the host's authored copy, and clearing
      // it was what made the screen fall back to the generated template.
      setThankYouDraft(eventId, { cardId: card.id });
      await saveEventsNow(eventId);
      if (isFutureSchedule) {
        toast.success(`Scheduled. We'll send it ${formatTimestamp(scheduledIso!)}.`);
      } else if (isRelativeSchedule) {
        toast.success(`Scheduled. We'll send it ${afterHours} hours after the event.`);
      }
      return;
    }



    const list = event.guests.filter((g) => recipients.includes(g.id));

    if (channel === "print") {
      setThankYouDraft(eventId, { cardId: card.id });
      await saveEventsNow(eventId);
      toast.success("Print-at-home card saved. Choose the files you need below.");
      return;
    }

    if (channel === "sms") {
      // SMS still hands off to the device messaging app (we don't send SMS server-side).
      const phones = list.map((g) => g.phone).filter(Boolean).join(",");
      const bodyText = `${message}\n\n${signOff || ""}${
        piece ? `\n\nListen and read it here: ${piece.url}` : ""
      }${gif ? `\n\n${gif}` : ""}`;
      if (phones) {
        markThankYouSent(eventId, card.id);
        setThankYouDraft(eventId, { cardId: card.id });
        window.location.href = `sms:${phones}?body=${encodeURIComponent(bodyText)}`;
        toast.success(`Opened your messages app for ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}.`);
      } else {
        toast.error("None of those guests have a phone on file.");
      }
      return;
    }

    // Email — send directly from the website via Lovable email queue.
    const withEmail = list.filter((g) => !!g.email);
    if (withEmail.length === 0) {
      toast.error("None of those guests have an email on file.");
      return;
    }

    const pending = toast.loading(`Sending to ${withEmail.length} guest${withEmail.length === 1 ? "" : "s"}…`);
    let sent = 0;
    const failures: string[] = [];
    for (const g of withEmail) {
      try {
        await sendTransactionalEmail({
          eventId,
          templateName: "thank-you-card",
          recipientEmail: g.email!,
          idempotencyKey: `thankyou-${card.id}-${g.id}`,
          templateData: {
            eventTitle: event.title,
            message,
            signOff,
            gif,
            photo,
            pieceUrl: piece?.url,
            pieceTitle: piece?.title,
            pieceKind: piece?.kind,
            recipientName: g.name,
          },
        });
        sent += 1;
      } catch (err) {
        failures.push(g.email!);
        console.error("thank-you send failed", g.email, err);
      }
    }
    toast.dismiss(pending);
    if (sent > 0) {
      markThankYouSent(eventId, card.id);
      setThankYouDraft(eventId, { cardId: card.id });
      toast.success(
        failures.length === 0
          ? `✨ Sent ${sent} thank-you note${sent === 1 ? "" : "s"} — GIFs included!`
          : `Sent ${sent} of ${withEmail.length}. ${failures.length} failed.`,
      );
    } else {
      toast.error("Couldn't send any emails. Check the console for details.");
    }
  }

  const palette = THANKS_DESIGNS.find((d) => d.id === design)!;
  const printGuests = yesGuests.filter((g) => recipients.includes(g.id));
  const addressedPrintGuests = printGuests.filter((g) => (addressEdits[g.id] ?? g.address ?? "").trim());
  const missingAddressGuests = printGuests.filter((g) => !(addressEdits[g.id] ?? g.address ?? "").trim());
  const printUnavailable = event._isDemo || isShowcaseEvent(eventId);

  async function ensurePrintableCard(): Promise<ThankYouCard | null> {
    if (printUnavailable) {
      toast.error("Print-at-home files are not available for sample events.");
      return null;
    }
    if (!message.trim() || recipients.length === 0) {
      toast.error("Add a message and select at least one guest first.");
      return null;
    }
    const payload = {
      message,
      signOff,
      design,
      photo,
      gif,
      pieceUrl: piece?.url,
      pieceTitle: piece?.title,
      pieceKind: piece?.kind,
      channel: "print" as const,
      recipientIds: recipients,
      hostAuthored,
      autoSend: false,
      mailedGuestIds,
    };
    const existing = linkedCardId ? cards.find((c) => c.id === linkedCardId) : undefined;
    let card: ThankYouCard;
    if (existing) {
      updateThankYouCard(eventId, existing.id, payload);
      card = { ...existing, ...payload };
    } else {
      card = addThankYouCard(eventId, payload);
      setLinkedCardId(card.id);
    }
    setThankYouDraft(eventId, { cardId: card.id, channel: "print" });
    const saved = await saveEventsNow(eventId);
    if (!saved) {
      toast.error("Save this card to the cloud before making print files.");
      return null;
    }
    return card;
  }

  async function downloadPrintFile(kind: "shop" | "letter" | "labels" | "envelopes") {
    setBuildingPrintKit(true);
    try {
      const card = await ensurePrintableCard();
      if (!card) return;
      if ((kind === "labels" || kind === "envelopes") && addressedPrintGuests.length === 0) {
        toast.error("Add a mailing address for at least one selected guest.");
        return;
      }
      const guestsWithAddresses = printGuests.map((g) => ({ ...g, address: addressEdits[g.id] ?? g.address }));
      const needsPrivateCopy = !!(card.pieceUrl || card.gif);
      let tokens: Record<string, string> = {};
      if (needsPrivateCopy) {
        const result = (await mintLinks({ data: { eventId, cardId: card.id, guestIds: recipients } })) as {
          tokens: Record<string, string>;
        };
        tokens = result.tokens;
      }
      const origin = window.location.origin;
      const printable = guestsWithAddresses.map((g) => ({
        ...g,
        copyUrl: tokens[g.id] ? `${origin}/thanks/${tokens[g.id]}` : undefined,
      }));
      const { buildThankYouCardPdf, buildAveryLabelsPdf, buildA7EnvelopesPdf, savePdf } = await import("@/lib/thankyou-print-export");
      if (kind === "shop" || kind === "letter") {
        savePdf(await buildThankYouCardPdf(card, event.title, printable, kind), event.title, kind === "shop" ? "5x7-print-shop" : "letter-two-up");
      } else if (kind === "labels") {
        savePdf(buildAveryLabelsPdf(printable, { startAt: labelStartAt }), event.title, "avery-5160-labels");
      } else {
        savePdf(buildA7EnvelopesPdf(printable), event.title, "a7-envelopes");
      }
      toast.success("Your print-at-home PDF is ready.");
    } catch (error) {
      toast.error(toUserMessage(error, "We couldn't make that PDF."));
    } finally {
      setBuildingPrintKit(false);
    }
  }

  async function saveAddress(guest: Guest) {
    const address = (addressEdits[guest.id] ?? guest.address ?? "").trim();
    updateGuest(eventId, guest.id, { address });
    const saved = await saveEventsNow(eventId);
    if (saved) toast.success(`Saved ${guest.name}'s address.`);
    else toast.error("The address stayed on this device, but cloud sync needs another try.");
  }

  async function toggleMailed(guestId: string) {
    const next = mailedGuestIds.includes(guestId)
      ? mailedGuestIds.filter((id) => id !== guestId)
      : [...mailedGuestIds, guestId];
    setMailedGuestIds(next);
    if (linkedCardId) {
      updateThankYouCard(eventId, linkedCardId, { mailedGuestIds: next });
      await saveEventsNow(eventId);
    }
  }

  if (!studioUnlocked && tier !== "loading") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-velvet/20 bg-gradient-to-br from-velvet/5 to-paper p-8">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-velvet px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
              {tier === "host" ? "Host add-on" : "Atelier"}
            </span>
            <h3 className="font-serif text-xl">Thank-you cards studio</h3>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Send heartfelt thanks with animated GIFs, schedule cards to land later, and download
            free print-at-home cards and mailing labels. {tier === "host"
              ? "Unlock the studio on your Host plan for a one-time $7."
              : "Available on the Atelier plan, or unlock as a $7 add-on on Host."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {tier === "host" ? (
              <Link
                to="/checkout"
                search={{ price: "thank_you_cards_addon" }}
                className="rounded-full bg-velvet px-5 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Add to Host — $7 one-time
              </Link>
            ) : (
              <Link
                to="/pricing"
                className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper hover:opacity-90"
              >
                Upgrade to Atelier
              </Link>
            )}
            <Link
              to="/pricing"
              className="rounded-full border border-ink/10 px-5 py-2 text-sm hover:bg-secondary"
            >
              Compare plans
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HelpCard>
        After the celebration, send a heartfelt thank-you to everyone who came. Pick a design, add a
        celebratory GIF, write your note, and choose to send now or schedule it for later. We'll open
        your email or texts with the message ready to go.
      </HelpCard>

      {showHostUpsell && (
        <div className="rounded-xl border border-velvet/20 bg-velvet/5 p-4 text-xs text-ink/80">
          You're previewing the studio. Unlock scheduled sends, GIFs, and print-at-home files for your Host
          plan with a one-time $7 add-on. <Link to="/checkout" search={{ price: "thank_you_cards_addon" }} className="font-medium text-velvet underline">Add to my plan</Link>.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-ink/5 bg-card p-5">
          <Field label="Card design">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {THANKS_DESIGNS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => { markTouched(); setDesign(d.id); }}
                  className={`rounded-lg border p-2 text-left ${
                    design === d.id ? "border-velvet ring-2 ring-velvet/40" : "border-ink/10"
                  }`}
                >
                  <div className={`h-12 rounded ${d.bg} ring-1 ring-black/5`} />
                  <div className="mt-1 text-[11px]">{d.name}</div>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Your message">
            <textarea
              ref={msgRef}
              value={message}
              onChange={(e) => { markTouched(); setMessage(e.target.value); }}
              rows={6}
              className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowEmoji((s) => !s)}
                className="rounded-full bg-secondary px-3 py-1 text-xs hover:bg-secondary/70"
              >
                😊 Add emoji
              </button>
              <span className="text-[11px] text-muted-foreground">{message.length} chars</span>
            </div>
            {showEmoji && (
              <div className="mt-2 grid grid-cols-10 gap-1 rounded-lg border border-ink/10 bg-paper p-2">
                {EMOJI_SET.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => insertEmoji(em)}
                    className="rounded p-1 text-lg hover:bg-secondary"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field label="Sign-off (optional)">
            <input
              value={signOff}
              onChange={(e) => { markTouched(); setSignOff(e.target.value); }}
              placeholder="e.g. Sophia & Marcus"
              className="w-full rounded-md bg-secondary px-3 py-2 text-sm focus:outline-none"
            />
          </Field>

          <Field label="Add a photo from the night (optional)">
            <input type="file" accept="image/*" onChange={onPhoto} className="text-xs" />
          </Field>

          <Field label="Celebration GIF (optional)">
            <GiphyPicker
              value={gif}
              onChange={(v) => {
                markTouched();
                setGif(v);
                void inspectGif(v);
              }}
            />
            {gif && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Outlook shows the first frame only, so some guests will see a still image, so pick a
                GIF whose opening frame already makes sense on its own.
              </p>
            )}
            {gifWarning && <p className="mt-1 text-[11px] text-amber-700">{gifWarning}</p>}
          </Field>

          <Field label="Attach a letter, poem, or song (optional)">
            <ThankYouPiecePicker
              value={piece}
              onChange={(v) => {
                markTouched();
                setPiece(v);
              }}
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Guests get a link to a page that plays it and always prints the written words, so
              anyone can read it instead of listening.
            </p>
          </Field>



          <Field label="Send via">
            <div className="flex gap-2">
              {(["email", "sms", "print"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => { markTouched(); setChannel(c); }}
                  className={`flex-1 rounded-md px-3 py-2 text-xs capitalize ${
                    channel === c ? "bg-velvet text-white" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {c === "sms" ? "Text" : c === "print" ? "Print at home" : "Email"}
                </button>
              ))}
            </div>
            {channel === "print" && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Free PDF files for your own printer or print shop. We do not print or mail anything.
              </p>
            )}
          </Field>

          <Field label="When should this go out?">
            <div className="space-y-2">
              {([
                { id: "now", label: "Send right away" },
                { id: "at", label: "On a date and time I pick" },
                { id: "after", label: "Automatically after the event" },
              ] as const).map((opt) => (
                <label
                  key={opt.id}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 transition ${
                    sendMode === opt.id ? "bg-velvet/10 ring-velvet/40" : "bg-secondary ring-ink/10"
                  }`}
                >
                  <input
                    type="radio"
                    name="thankyou-send-mode"
                    checked={sendMode === opt.id}
                    onChange={() => {
                      markTouched();
                      setSendMode(opt.id);
                    }}
                  />
                  <span>{opt.label}</span>
                  {opt.id === "after" && channel !== "email" && (
                    <span className="ml-auto text-[11px] text-muted-foreground">email only</span>
                  )}
                </label>
              ))}
            </div>

            {sendMode === "at" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => {
                    markTouched();
                    setScheduledFor(e.target.value);
                  }}
                  min={new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)}
                  className="min-h-11 rounded-md bg-secondary px-3 py-1.5 text-sm focus:outline-none"
                />
                {scheduledFor && (
                  <span className="text-[11px] text-velvet">📅 {formatTimestamp(scheduledFor)}</span>
                )}
              </div>
            )}

            {sendMode === "after" && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={afterHours}
                  onChange={(e) => {
                    markTouched();
                    setAfterHours(Math.max(1, Math.min(720, Number(e.target.value) || 48)));
                  }}
                  className="min-h-11 w-20 rounded-md bg-secondary px-3 py-1.5 text-sm focus:outline-none"
                />
                <span className="text-muted-foreground">hours after the event ends</span>
              </div>
            )}

            {sendMode !== "now" && channel === "email" && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Choosing a time is all it takes. We send it for you, once, and mark it complete.
                Nothing else to switch on.
              </p>
            )}
            {sendMode !== "now" && channel !== "email" && (
              <p className="mt-2 text-[11px] text-amber-700">
                Only emailed cards can be sent automatically. {channel === "sms" ? "Texts" : "Print-at-home files"}{" "}
                stay in your hands.
              </p>
            )}

            {gif && channel !== "print" && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                💡 Your GIF link is added to the end of the message — Gmail, Apple Mail, Outlook,
                and most SMS apps render it inline as an animated preview.
              </p>
            )}
          </Field>

          <Field label={`Recipients (${recipients.length} of ${yesGuests.length} confirmed guests)`}>
            <div className="max-h-48 overflow-y-auto rounded-md bg-secondary/40 p-2">
              {yesGuests.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">
                  No confirmed guests yet. Once people RSVP yes, they'll show up here.
                </p>
              ) : (
                yesGuests.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 rounded p-1 text-sm hover:bg-secondary">
                    <input
                      type="checkbox"
                      checked={recipients.includes(g.id)}
                      onChange={() => toggle(g.id)}
                    />
                    <span>{g.name}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {channel === "sms" ? g.phone || "no phone" : channel === "print" ? g.address || "no address" : g.email || "no email"}
                    </span>
                  </label>
                ))
              )}
            </div>
            <div className="mt-2 flex gap-2 text-[11px]">
              <button onClick={() => { markTouched(); setRecipients(yesGuests.map((g) => g.id)); }} className="text-velvet">
                Select all
              </button>
              <button onClick={() => { markTouched(); setRecipients([]); }} className="text-muted-foreground">
                Clear
              </button>
            </div>
          </Field>

          {channel === "print" && (
            <section className="space-y-4 border-t border-ink/10 pt-4" aria-label="Print-at-home files">
              {printUnavailable ? (
                <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
                  Print-at-home files are unavailable for sample events.
                </p>
              ) : (
                <>
                  <div>
                    <h3 className="text-sm font-semibold">Card PDFs</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Print at 100% scale. The print-shop file includes 0.125-inch bleed and crop marks.</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button type="button" disabled={buildingPrintKit} onClick={() => void downloadPrintFile("shop")} className="min-h-11 rounded-md border border-ink/15 px-3 text-sm hover:bg-secondary disabled:opacity-50">Download 5×7 print-shop PDF</button>
                      <button type="button" disabled={buildingPrintKit} onClick={() => void downloadPrintFile("letter")} className="min-h-11 rounded-md border border-ink/15 px-3 text-sm hover:bg-secondary disabled:opacity-50">Download Letter two-up PDF</button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold">Addresses</h3>
                    {missingAddressGuests.length > 0 && (
                      <p className="mt-1 text-xs text-amber-700">
                        {missingAddressGuests.length} selected {missingAddressGuests.length === 1 ? "guest needs" : "guests need"} a mailing address before labels or envelopes can be made.
                      </p>
                    )}
                    <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                      {printGuests.map((guest) => (
                        <div key={guest.id} className="rounded-md bg-secondary/50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor={`address-${guest.id}`} className="text-xs font-medium">{guest.name}</label>
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <input type="checkbox" checked={mailedGuestIds.includes(guest.id)} onChange={() => void toggleMailed(guest.id)} /> Mailed
                            </label>
                          </div>
                          <textarea
                            id={`address-${guest.id}`}
                            rows={2}
                            value={addressEdits[guest.id] ?? guest.address ?? ""}
                            placeholder="Street, apartment, city, state, ZIP"
                            onChange={(e) => setAddressEdits((current) => ({ ...current, [guest.id]: e.target.value }))}
                            className="mt-2 w-full rounded-md border border-ink/10 bg-card px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-velvet/30"
                          />
                          <button type="button" onClick={() => void saveAddress(guest)} className="mt-2 text-xs font-medium text-velvet">Save address</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold">Labels and envelopes</h3>
                    <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      Start Avery 5160 sheet at label
                      <input type="number" min={1} max={30} value={labelStartAt} onChange={(e) => setLabelStartAt(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} className="w-16 rounded-md border border-ink/10 bg-card px-2 py-1.5 text-ink" />
                    </label>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button type="button" disabled={buildingPrintKit || addressedPrintGuests.length === 0} onClick={() => void downloadPrintFile("labels")} className="min-h-11 rounded-md border border-ink/15 px-3 text-sm hover:bg-secondary disabled:opacity-50">Download Avery 5160 labels</button>
                      <button type="button" disabled={buildingPrintKit || addressedPrintGuests.length === 0} onClick={() => void downloadPrintFile("envelopes")} className="min-h-11 rounded-md border border-ink/15 px-3 text-sm hover:bg-secondary disabled:opacity-50">Download A7 envelopes</button>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={() => setPreviewOpen(true)}
              className="rounded-full border border-velvet/40 px-4 py-2 text-sm text-velvet hover:bg-velvet/10"
            >
              👀 Preview as recipient
            </button>
            <button
              onClick={() => createDraft(false)}
              className={`rounded-full px-4 py-2 text-sm ${
                dirty
                  ? "bg-ink text-paper hover:opacity-90"
                  : "border border-ink/10 hover:bg-secondary"
              }`}
            >
              {dirty ? "Save changes" : "Saved"}
            </button>
            <button
              onClick={() => createDraft(true)}
              className="rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={recipients.length === 0 || !message.trim()}
            >
              {sendMode !== "now" && channel === "email"
                ? `📅 Schedule for ${recipients.length}`
                : channel === "print"
                  ? "Save print-at-home card"
                  : `Send to ${recipients.length}`}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {dirty
              ? "Unsaved changes. They save automatically a moment after you stop typing, or hit Save changes now."
              : lastSavedAt
                ? `Saved ${formatTimestamp(lastSavedAt)}. Your wording and sign-off stay exactly as you wrote them.`
                : "Your wording, sign-off, photo and picks are saved as you type. You can leave and come back."}
          </p>
          {!hostAuthored && (
            <p className="text-[11px] text-amber-700">
              This is still our suggested wording. Edit it so guests hear it in your voice, a
              scheduled card is held rather than sent when the message hasn't been written by you.
            </p>
          )}


        </div>

        {/* Live preview */}
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Live preview</p>
          <div className={`rounded-2xl p-8 shadow-xl ${palette.bg} ${palette.ink}`}>
            <div className={`text-[10px] font-medium uppercase tracking-[0.3em] ${palette.accent}`}>
              Thank you
            </div>
            <h3 className="mt-2 font-serif text-3xl">{event.title}</h3>
            {/* Order and framing match the email template exactly: photo, then
                message, then GIF, each shown whole rather than cropped. */}
            {photo && (
              <img
                src={photo}
                alt={`A photo from ${event.title}`}
                className="mt-4 max-h-72 w-full rounded-lg object-contain ring-1 ring-white/20"
              />
            )}
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{message}</p>
            {gif && (
              <img
                src={gif}
                alt={`An animated thank-you from ${event.title}`}
                className="mt-4 max-h-72 w-full rounded-lg object-contain ring-1 ring-white/20"
              />
            )}
            {signOff && <p className={`mt-4 font-serif text-xl ${palette.accent}`}>— {signOff}</p>}

          </div>
        </div>
      </div>

      {/* History */}
      {cards.length > 0 && (
        <div className="rounded-xl border border-ink/5 bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-serif text-lg">Cards you've sent or scheduled</h3>
            <RunPendingThankYousButton />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            A scheduled card sends itself, once, at the time you chose. Nothing else to switch on.
          </p>
          {duplicateIds.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
              <span>
                {duplicateIds.length} of these are repeat copies of a card you have not sent yet. Left in place, a
                repeated scheduled card would reach your guests twice.
              </span>
              <button
                type="button"
                onClick={async () => {
                  for (const id of duplicateIds) removeThankYouCard(eventId, id);
                  await saveEventsNow(eventId);
                  toast.success(
                    `Removed ${duplicateIds.length} repeat cop${duplicateIds.length === 1 ? "y" : "ies"}. Your card is untouched.`,
                  );
                }}
                className="shrink-0 rounded-full bg-ink px-3 py-1.5 font-medium text-paper"
              >
                Remove the repeats
              </button>
            </div>
          )}

          <div className="mt-3 space-y-2">
            {cards.map((c) => {
              const hours = c.autoSendAfterHours ?? 48;
              const isScheduled = !c.autoSentAt && !c.sentAt && (!!c.scheduledFor || !!c.autoSend);
              return (
                <div key={c.id} className="rounded-lg bg-secondary/50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {c.recipientIds.length} {c.channel === "print" ? "print-at-home cards" : `${c.channel} notes`} ·{" "}
                        <span className="text-muted-foreground">{c.design}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.autoSentAt
                          ? `✓ Sent automatically ${formatTimestamp((c.autoSentAt))}`
                          : c.sentAt
                            ? `Sent ${formatTimestamp((c.sentAt))}`
                            : c.scheduledFor
                              ? `📅 Sending ${formatTimestamp((c.scheduledFor))}`
                              : c.autoSend
                                ? `📅 Sending ${hours}h after the event`
                                : "Draft, not scheduled"}
                      </div>
                      {c.signOff ? (
                        <div className="text-[11px] text-muted-foreground">Signed “{c.signOff}”</div>
                      ) : (
                        !c.autoSentAt &&
                        !c.sentAt && (
                          <div className="text-[11px] text-amber-700">
                            No sign-off, this card will go out unsigned.
                          </div>
                        )
                      )}
                    </div>
                    <button
                      onClick={() => removeThankYouCard(eventId, c.id)}
                      className="shrink-0 text-[11px] text-muted-foreground hover:text-red-500"
                    >
                      Remove
                    </button>
                  </div>
                  {isScheduled && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-ink/5 pt-2 text-[11px]">
                      <button
                        onClick={() =>
                          updateThankYouCard(eventId, c.id, {
                            autoSend: false,
                            scheduledFor: undefined,
                            autoSendAfterHours: undefined,
                          })
                        }
                        className="text-muted-foreground underline hover:text-ink"
                      >
                        Cancel this send
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}






      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-[fade-in_0.2s_ease-out]"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="relative w-full max-w-lg animate-[scale-in_0.25s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewOpen(false)}
              className="absolute -top-10 right-0 text-xs text-white/80 hover:text-white"
            >
              Close ✕
            </button>
            <div className="rounded-2xl bg-paper p-4 shadow-2xl">
              <p className="mb-3 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                What your guest will see ·{" "}
                {channel === "email" ? "Email preview" : channel === "sms" ? "Text preview" : "Printed card preview"}
              </p>
              {channel === "email" && (
                <div className="rounded-lg border border-ink/10 bg-white text-ink">
                  <div className="border-b border-ink/10 p-3 text-xs">
                    <div><span className="text-muted-foreground">From:</span> {event.hosts?.[0]?.name || "Your host"}</div>
                    <div><span className="text-muted-foreground">Subject:</span> Thank you — {event.title}</div>
                  </div>
                  <div className={`m-3 rounded-xl p-6 ${palette.bg} ${palette.ink}`}>
                    <div className={`text-[10px] font-medium uppercase tracking-[0.3em] ${palette.accent}`}>Thank you</div>
                    <h3 className="mt-2 font-serif text-2xl">{event.title}</h3>
                    {photo && <img src={photo} alt={`A photo from ${event.title}`} className="mt-3 max-h-56 w-full rounded-lg object-contain" />}
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{message}</p>
                    {gif && <img src={gif} alt={`An animated thank-you from ${event.title}`} className="mt-3 max-h-56 w-full rounded-lg object-contain" />}
                    {signOff && <p className={`mt-3 font-serif text-lg ${palette.accent}`}>— {signOff}</p>}
                  </div>
                </div>
              )}
              {channel === "sms" && (
                <div className="rounded-3xl bg-[#e5e5ea] p-4">
                  {gif && <img src={gif} alt={`An animated thank-you from ${event.title}`} className="mb-2 ml-auto block max-h-56 max-w-[85%] rounded-2xl object-contain" />}
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[#2997ff] px-4 py-3 text-sm text-white whitespace-pre-wrap">
                    {message}
                    {signOff && `\n\n— ${signOff}`}
                  </div>
                  <p className="mt-2 text-center text-[10px] text-muted-foreground">Delivered · iMessage</p>
                </div>
              )}
              {channel === "print" && (
                <div className="space-y-2">
                  <div className={`mx-auto aspect-[3/2] w-full rounded-lg p-6 shadow-2xl ${palette.bg} ${palette.ink}`}>
                    <div className={`text-[9px] font-medium uppercase tracking-[0.3em] ${palette.accent}`}>Thank you</div>
                    <h3 className="mt-2 font-serif text-2xl">{event.title}</h3>
                    {photo && <img src={photo} alt={`A photo from ${event.title}`} className="mt-2 max-h-24 w-full rounded object-contain" />}
                    <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed">{message}</p>
                    {signOff && <p className={`mt-3 font-serif text-base ${palette.accent}`}>— {signOff}</p>}
                  </div>
                  <p className="text-center text-[10px] text-muted-foreground">
                    Download at actual size. {gif || piece ? "A private QR code carries the digital part." : "You print and mail it yourself."}
                  </p>
                </div>
              )}
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Sending to {recipients.length} {recipients.length === 1 ? "guest" : "guests"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ThankYouChannelLocal = "email" | "sms" | "print";

function RunPendingThankYousButton() {
  const run = useServerFn(runPendingThankYousNow);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const pending = toast.loading("Checking for pending auto-thank-yous…");
        try {
          const r = (await run({} as any)) as any;
          toast.dismiss(pending);
          if (r?.emailsQueued > 0) {
            toast.success(`Queued ${r.emailsQueued} thank-you email${r.emailsQueued === 1 ? "" : "s"} across ${r.cardsFired} card${r.cardsFired === 1 ? "" : "s"}.`);
          } else if (r?.cardsFired > 0) {
            toast.success(`${r.cardsFired} card${r.cardsFired === 1 ? "" : "s"} processed — no recipients needed mailing.`);
          } else {
            toast.message("Nothing pending right now.");
          }
        } catch (e: any) {
          toast.dismiss(pending);
          toast.error(e?.message ?? "Couldn't run pending thank-yous.");
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-full border border-velvet/30 bg-velvet/10 px-3 py-1 text-[11px] font-medium text-velvet hover:bg-velvet/15 disabled:opacity-50"
      title="Owner/admin only — fires any auto-thank-yous whose window has elapsed."
    >
      {busy ? "Running…" : "Run pending now"}
    </button>
  );
}

/**
 * Guest notes live in the Share step (well wishes + invitation comments). This
 * surfaces them from Review & save so they are never buried, and badges unread
 * guest comments.
 */
function GuestNotesQuickLink({ eventId }: { eventId: string }) {
  const notes = useGuestNoteCount(eventId);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/5 bg-card p-5">
      <div className="min-w-0">
        <h3 className="font-serif text-lg">Guest notes</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {notes.wishes} message{notes.wishes === 1 ? "" : "s"} for the guest of honor ·{" "}
          {notes.comments} comment{notes.comments === 1 ? "" : "s"} on your invitation
          {notes.unreadComments > 0 ? ` · ${notes.unreadComments} unread` : ""}
        </p>
      </div>
      <Link
        to="/events/$eventId"
        params={{ eventId }}
        search={{ step: "share" } as never}
        className="inline-flex min-h-11 items-center rounded-full bg-velvet px-5 text-sm font-medium text-white hover:opacity-90"
      >
        Open well wishes &amp; comments
      </Link>
    </div>
  );
}
