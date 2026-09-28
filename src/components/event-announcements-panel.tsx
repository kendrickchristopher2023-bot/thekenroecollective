import { toUserMessage } from "@/lib/user-error";
import { useEffect, useMemo, useState } from "react";
import { useLocalDraft } from "@/hooks/use-local-draft";

import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Megaphone, Send, Trash2, Sparkles, Lock, Mail, MessageSquareText, MapPin, Calendar, AlertTriangle } from "lucide-react";
import {
  listEventAnnouncements,
  upsertAnnouncement,
  sendAnnouncement,
  deleteAnnouncement,
  draftCommunication,
  getAnnouncementPermissions,
} from "@/lib/announcements.functions";
import { queueSms, getSmsProviderStatus } from "@/lib/sms.functions";
import { sendTransactionalEmail } from "@/lib/email/send";
import { confirmDialog } from "@/lib/confirm-dialog";
import { useIsPostcard } from "@/lib/postcard-gates";
import type { Guest } from "@/lib/events-store";
import { formatTimestamp } from "@/lib/datetime";


// Server-reported SMS provider status (Twilio). The composer's SMS toggle
// is only enabled when the server has TWILIO_AUTH_TOKEN + a sender configured.
// See src/lib/sms.functions.ts -> getSmsProviderStatus.

type AType = "venue_change" | "cancellation" | "date_change" | "general";
type AChannel = "in_app" | "email" | "sms";
type AudienceFilter = "all" | "attending" | "pending";

type Announcement = {
  id: string;
  type: AType;
  title: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
  audience: "event" | "all_users";
  event_id: string | null;
  event_title: string | null;
  channels: string[];
  status: "draft" | "scheduled" | "sent";
  sent_at: string | null;
  created_at: string;
};

const TYPE_OPTS: { value: AType; label: string; icon: typeof Megaphone }[] = [
  { value: "general", label: "General update", icon: Megaphone },
  { value: "venue_change", label: "Venue change", icon: MapPin },
  { value: "date_change", label: "Date change", icon: Calendar },
  { value: "cancellation", label: "Cancellation", icon: AlertTriangle },
];

export function EventAnnouncementsPanel({
  eventId,
  eventTitle,
  coverImage,
  guests = [],
}: {
  eventId: string;
  eventTitle: string;
  /** Event cover art; only inbox-safe https URLs survive the send path. */
  coverImage?: string;
  guests?: Guest[];
}) {
  const getPerms = useServerFn(getAnnouncementPermissions);
  const listFn = useServerFn(listEventAnnouncements);
  const { isPostcard } = useIsPostcard();
  const upsertFn = useServerFn(upsertAnnouncement);
  const sendFn = useServerFn(sendAnnouncement);
  const deleteFn = useServerFn(deleteAnnouncement);
  const draftFn = useServerFn(draftCommunication);
  const enqueueSms = useServerFn(queueSms);
  const getSmsStatus = useServerFn(getSmsProviderStatus);
  const [smsProviderConnected, setSmsProviderConnected] = useState(false);
  // Postcard free-tier lockdown: paid channels (email/SMS) are disabled for
  // free users. In-app announcements remain available.
  const SMS_PROVIDER_CONNECTED = smsProviderConnected && !isPostcard;


  const [perms, setPerms] = useState<{ canPublishEvent: boolean; isOwner: boolean } | null>(null);
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const [type, setType] = useState<AType>("general");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [channels, setChannels] = useState<AChannel[]>(isPostcard ? ["in_app"] : ["in_app", "email"]);
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>("all");

  // Typed announcement copy survives navigation and reloads; cleared once the
  // announcement is actually saved or sent.
  const composerDraft = useMemo(
    () => ({ type, title, body, linkUrl, linkLabel }),
    [type, title, body, linkUrl, linkLabel],
  );
  const clearComposerDraft = useLocalDraft(
    `kenroe:announcement-draft:${eventId}`,
    composerDraft,
    (d) => {
      if (d.type) setType(d.type as AType);
      if (typeof d.title === "string") setTitle(d.title);
      if (typeof d.body === "string") setBody(d.body);
      if (typeof d.linkUrl === "string") setLinkUrl(d.linkUrl);
      if (typeof d.linkLabel === "string") setLinkLabel(d.linkLabel);
    },
    (d) => !String(d.title ?? "").trim() && !String(d.body ?? "").trim(),
  );


  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, rows, sms] = await Promise.all([
          getPerms(),
          listFn({ data: { event_id: eventId } }).catch(() => []),
          getSmsStatus().catch(() => ({ configured: false })),
        ]);
        if (!alive) return;
        setPerms({ canPublishEvent: p.canPublishEvent, isOwner: p.isOwner });
        setItems(rows as Announcement[]);
        // `configured` (credentials present) keeps the SMS channel usable and
        // queueing while the A2P campaign awaits carrier approval.
        setSmsProviderConnected(!!sms?.configured);

      } catch {
        // list requires admin — non-admins get []; that's fine
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [eventId, getPerms, listFn, getSmsStatus]);

  const refresh = async () => {
    try {
      const rows = (await listFn({ data: { event_id: eventId } })) as Announcement[];
      setItems(rows);
    } catch {
      // ignore
    }
  };

  const toggleChannel = (c: AChannel) => {
    if (c === "sms" && !SMS_PROVIDER_CONNECTED) return;
    if (isPostcard && (c === "email" || c === "sms")) {
      toast.message("Upgrade to Whisper to send announcements by email or SMS.");
      return;
    }
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };


  // Filter guests to the selected audience (RSVP status). Matches the SMS
  // reminders panel semantics: "attending" = yes, "pending" = pending or blank.
  const filteredGuests = useMemo(() => {
    return (guests ?? []).filter((g) => {
      if (audienceFilter === "all") return true;
      if (audienceFilter === "attending") return g.status === "yes";
      if (audienceFilter === "pending") return !g.status || g.status === "pending";
      return true;
    });
  }, [guests, audienceFilter]);

  const recipientEmails = useMemo(
    () => filteredGuests.map((g) => g.email).filter((e): e is string => !!e && !!e.trim()),
    [filteredGuests],
  );
  const recipientPhoneEntries = useMemo(
    () =>
      filteredGuests
        .filter((g) => !!g.phone)
        .map((g) => ({ phone: g.phone as string, guestId: g.id, guestName: g.name })),
    [filteredGuests],
  );

  async function fanOutEmail(subject: string, bodyText: string, forAnnouncementId?: string) {
    if (recipientEmails.length === 0) return { ok: 0, fail: 0 };
    const results = await Promise.allSettled(
      recipientEmails.map((addr) =>
        sendTransactionalEmail({
          templateName: "event-announcement",
          recipientEmail: addr,
          idempotencyKey: `announce-${forAnnouncementId ?? "new"}-${addr}-${Date.now()}`,
          templateData: {
            title: subject,
            body: bodyText,
            type_label: type,
            event_title: eventTitle,
            coverImage: coverImage || "",
            link_url: linkUrl.trim() || null,
            link_label: linkLabel.trim() || null,
          },
        }),
      ),
    );
    let ok = 0;
    let fail = 0;
    for (const r of results) (r.status === "fulfilled" ? ok++ : fail++);
    return { ok, fail };
  }

  async function fanOutSms(smsBody: string) {
    if (!SMS_PROVIDER_CONNECTED || recipientPhoneEntries.length === 0) {
      return { queued: 0, blockedOptOut: 0, blockedCap: 0, error: null as string | null };
    }
    try {
      const r = await enqueueSms({
        data: { eventId, body: smsBody, recipients: recipientPhoneEntries },
      });
      return { queued: r.queued ?? 0, blockedOptOut: r.blockedOptOut ?? 0, blockedCap: r.blockedCap ?? 0, error: null };
    } catch (e) {
      // Previously swallowed entirely — the host saw "0 SMS queued" with no
      // way to tell a real failure (e.g. hit the tier's SMS cap) apart from
      // "nothing to send."
      const message = toUserMessage(e, "SMS send failed.");
      console.error("fanOutSms failed", e);
      return { queued: 0, blockedOptOut: 0, blockedCap: 0, error: message };
    }
  }

  const aiDraft = async () => {
    if (!title.trim() && !body.trim()) {
      toast.error("Add a title or a short note first, then I'll polish it.");
      return;
    }
    setDrafting(true);
    try {
      const out = await draftFn({
        data: {
          type,
          title: title || `Update — ${eventTitle}`,
          body: body || "Please see the note below.",
          event_title: eventTitle,
          link_url: linkUrl || null,
          event_id: eventId,
        },
      });
      if (out?.email_body) setBody(out.email_body);
      if (!title && out?.email_subject) setTitle(out.email_subject);
      toast.success("Draft polished");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not draft right now.");
    } finally {
      setDrafting(false);
    }
  };

  const publish = async (status: "draft" | "sent") => {
    if (!title.trim() || !body.trim()) {
      toast.error("Add a title and a message.");
      return;
    }
    setBusy(true);
    try {
      const trimmedTitle = title.trim();
      const trimmedBody = body.trim();
      const smsCopy = trimmedBody.slice(0, 300);
      const saved = await upsertFn({
        data: {
          type,
          title: trimmedTitle,
          body: trimmedBody,
          link_url: linkUrl.trim() || null,
          link_label: linkLabel.trim() || null,
          audience: "event",
          event_id: eventId,
          event_title: eventTitle,
          channels,
          status,
          email_subject: trimmedTitle,
          email_body: trimmedBody,
          sms_text: smsCopy,
        },
      });

      if (status !== "sent") {
        toast.success("Draft saved.");
      } else {
        // Fan-out to email + (future) SMS. Only for status='sent'; drafts do
        // nothing besides persist.
        const wantEmail = channels.includes("email");
        const wantSms = channels.includes("sms") && SMS_PROVIDER_CONNECTED;
        const [emailRes, smsRes] = await Promise.all([
          wantEmail ? fanOutEmail(trimmedTitle, trimmedBody, saved?.id) : Promise.resolve({ ok: 0, fail: 0 }),
          wantSms ? fanOutSms(smsCopy) : Promise.resolve({ queued: 0, blockedOptOut: 0, blockedCap: 0, error: null }),
        ]);

        const parts = ["banner live"];
        if (wantEmail) parts.push(`${emailRes.ok} email${emailRes.ok === 1 ? "" : "s"} delivered`);
        if (wantSms) parts.push(smsRes.error ? "SMS failed" : `${smsRes.queued} SMS queued`);
        const summary = `Announcement sent — ${parts.join(", ")}`;
        if ((wantEmail && emailRes.fail > 0) || smsRes.error || smsRes.blockedCap > 0) {
          const extra = [
            emailRes.fail ? `${emailRes.fail} email failed` : null,
            smsRes.error ? smsRes.error : null,
            smsRes.blockedCap > 0 ? `${smsRes.blockedCap} guest(s) hit your plan's SMS limit` : null,
          ].filter(Boolean).join(", ");
          toast.warning(`${summary}${extra ? `, ${extra}` : ""}`);
        } else {
          toast.success(summary);
        }
      }

      clearComposerDraft();
      setTitle("");
      setBody("");
      setLinkUrl("");
      setLinkLabel("");

      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save announcement.");
    } finally {
      setBusy(false);
    }
  };

  const sendOne = async (id: string) => {
    setBusy(true);
    try {
      await sendFn({ data: { id } });
      // Fan out email/sms for the newly-sent announcement using the current
      // audience filter + composer link fields. Historic drafts don't carry
      // link_url in state; use whatever's in the composer as a best-effort.
      const target = items.find((a) => a.id === id);
      if (target) {
        const wantEmail = (target.channels ?? []).includes("email");
        const wantSms = (target.channels ?? []).includes("sms") && SMS_PROVIDER_CONNECTED;
        const [emailRes, smsRes] = await Promise.all([
          wantEmail ? fanOutEmail(target.title, target.body, target.id) : Promise.resolve({ ok: 0, fail: 0 }),
          wantSms ? fanOutSms(target.body.slice(0, 300)) : Promise.resolve({ queued: 0, blockedOptOut: 0, blockedCap: 0, error: null }),
        ]);
        const parts = ["banner live"];
        if (wantEmail) parts.push(`${emailRes.ok} email${emailRes.ok === 1 ? "" : "s"} delivered`);
        if (wantSms) parts.push(smsRes.error ? "SMS failed" : `${smsRes.queued} SMS queued`);
        const hasIssue = (wantEmail && emailRes.fail > 0) || smsRes.error || smsRes.blockedCap > 0;
        const extra = [
          wantEmail && emailRes.fail ? `${emailRes.fail} email failed` : null,
          smsRes.error ? smsRes.error : null,
          smsRes.blockedCap > 0 ? `${smsRes.blockedCap} guest(s) hit your plan's SMS limit` : null,
        ].filter(Boolean).join(", ");
        toast[hasIssue ? "warning" : "success"](
          `Announcement sent — ${parts.join(", ")}${extra ? `, ${extra}` : ""}`,
        );
      } else {
        toast.success("Announcement sent.");
      }
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send.");
    } finally {
      setBusy(false);
    }
  };

  const removeOne = async (id: string) => {
    const ok = await confirmDialog({
      title: "Delete this announcement?",
      body: "Guests who already received it won't be un-notified, but it will be removed from the banner.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteFn({ data: { id } });
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not delete.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-ink/5 bg-card p-5">
        <div className="h-6 w-40 animate-pulse rounded bg-ink/5" />
        <div className="mt-3 h-20 animate-pulse rounded bg-ink/5" />
      </div>
    );
  }

  // Locked state — free/postcard tier
  if (perms && !perms.canPublishEvent) {
    return (
      <div className="rounded-xl border border-ink/10 bg-gradient-to-br from-velvet/5 to-transparent p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-velvet/10 p-2 text-velvet">
            <Lock className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-serif text-xl">Announce updates to guests</h3>
            <p className="mt-1 text-sm text-ink/70">
              Publish venue changes, schedule tweaks, or notes that appear as a banner at the top of your
              invitation, gift, wall, and check-in pages — with optional email + SMS fan-out.
            </p>
            <p className="mt-3 text-xs uppercase tracking-wider text-ink/50">Included with Whisper, Host & Atelier</p>
            <Link
              to="/pricing"
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Upgrade to unlock announcements
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ink/5 bg-card p-5">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-velvet" />
        <h3 className="font-serif text-xl">Announcements</h3>
      </div>
      <p className="mt-1 text-sm text-ink/60">
        Publishing shows a banner across your invite, gift, wall & check-in pages. Email + SMS reach guests directly.
        Limit: 3 announcements per event per 24 hours.
      </p>

      {/* Composer */}
      <div className="mt-4 space-y-3 rounded-lg border border-ink/5 bg-background/60 p-4">
        <div className="flex flex-wrap gap-2">
          {TYPE_OPTS.map((t) => {
            const Icon = t.icon;
            const active = type === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  active ? "border-velvet bg-velvet text-white" : "border-ink/10 bg-background text-ink/70 hover:border-ink/30"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-ink/60">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Venue moved to The Rosewood Ballroom"
            className="mt-1 w-full rounded-lg border border-ink/10 bg-background px-3 py-3 text-base"
            maxLength={200}
          />
        </div>

        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-ink/60">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share the details your guests need — new address, updated time, or a quick note."
            rows={5}
            className="mt-1 w-full rounded-lg border border-ink/10 bg-background px-3 py-3 text-base leading-relaxed"
            maxLength={4000}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-ink/60">Optional link (URL)</label>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
              className="mt-1 w-full rounded-lg border border-ink/10 bg-background px-3 py-3 text-base"
              maxLength={500}
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-ink/60">Link label</label>
            <input
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="See new venue"
              className="mt-1 w-full rounded-lg border border-ink/10 bg-background px-3 py-3 text-base"
              maxLength={120}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["in_app", "email", "sms"] as AChannel[]).map((c) => {
            const active = channels.includes(c);
            const label = c === "in_app" ? "In-app banner" : c === "email" ? "Email guests" : "SMS guests";
            const Icon = c === "email" ? Mail : c === "sms" ? MessageSquareText : Megaphone;
            const disabled = c === "sms" && !SMS_PROVIDER_CONNECTED;
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleChannel(c)}
                disabled={disabled}
                title={disabled ? "SMS requires a connected SMS provider — coming soon" : undefined}
                aria-disabled={disabled}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  disabled
                    ? "cursor-not-allowed border-ink/10 bg-background text-ink/40"
                    : active
                    ? "border-ink bg-ink text-background"
                    : "border-ink/10 bg-background text-ink/70 hover:border-ink/30"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {disabled && <span className="ml-1 text-[10px] uppercase tracking-wider">soon</span>}
              </button>
            );
          })}
        </div>

        {/* Audience filter — mirrors SMS reminders panel; controls the guest
            list used for the email/sms fan-out on Send now. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink/50">Send to</span>
          {(["all", "attending", "pending"] as AudienceFilter[]).map((f) => {
            const active = audienceFilter === f;
            const label = f === "all" ? "All guests" : f === "attending" ? "Attending" : "Not yet RSVP'd";
            return (
              <button
                key={f}
                type="button"
                onClick={() => setAudienceFilter(f)}
                className={`rounded-full px-3 py-1 text-[11px] ${
                  active ? "bg-ink text-background" : "border border-ink/10 bg-background text-ink/70 hover:border-ink/30"
                }`}
              >
                {label}
              </button>
            );
          })}
          <span className="ml-auto text-[11px] text-ink/50">
            {recipientEmails.length} email{recipientEmails.length === 1 ? "" : "s"}
            {SMS_PROVIDER_CONNECTED ? ` · ${recipientPhoneEntries.length} phone${recipientPhoneEntries.length === 1 ? "" : "s"}` : ""}
          </span>
        </div>


        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={aiDraft}
            disabled={drafting || busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-background px-4 py-2 text-sm font-medium text-ink/80 hover:border-ink/30 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {drafting ? "Polishing…" : "AI polish"}
          </button>
          <button
            type="button"
            onClick={() => publish("draft")}
            disabled={busy}
            className="rounded-full border border-ink/10 bg-background px-4 py-2 text-sm font-medium text-ink/80 hover:border-ink/30 disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={() => publish("sent")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {busy ? "Sending…" : "Send now"}
          </button>
        </div>
      </div>

      {/* History */}
      {items.length > 0 && (
        <div className="mt-5">
          <h4 className="text-xs font-medium uppercase tracking-wider text-ink/60">Recent announcements</h4>
          <ul className="mt-2 space-y-2">
            {items.slice(0, 8).map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-ink/5 bg-background/60 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        a.status === "sent" ? "bg-emerald-500" : a.status === "scheduled" ? "bg-amber-500" : "bg-ink/30"
                      }`}
                    />
                    <span className="truncate text-sm font-medium">{a.title}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink/60">{a.body}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wider text-ink/40">
                    {a.status === "sent" && a.sent_at ? `Sent ${formatTimestamp((a.sent_at))}` : a.status}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {a.status !== "sent" && (
                    <button
                      type="button"
                      onClick={() => sendOne(a.id)}
                      disabled={busy}
                      className="rounded-full bg-velvet px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Send
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeOne(a.id)}
                    disabled={busy}
                    aria-label="Delete announcement"
                    className="rounded-full border border-ink/10 p-2 text-ink/60 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
