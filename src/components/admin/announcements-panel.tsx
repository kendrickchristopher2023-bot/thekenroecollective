import { toUserMessage } from "@/lib/user-error";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sparkles, Send, Save, Calendar, Trash2, Copy, Mail, MessageSquareText,
  MapPin, AlertTriangle, Megaphone, Plus,
} from "lucide-react";
import {
  listAnnouncements,
  upsertAnnouncement,
  sendAnnouncement,
  deleteAnnouncement,
  draftCommunication,
} from "@/lib/announcements.functions";
import { listAllEventsAdmin } from "@/lib/events-admin.functions";
import { sendTransactionalEmail } from "@/lib/email/send";
import { MediaPickerButton } from "@/components/media-picker-button";
import { confirmDialog } from "@/lib/confirm-dialog";
import { useIsOwner } from "@/lib/use-is-owner";
import { formatTimestamp } from "@/lib/datetime";


type AType = "venue_change" | "cancellation" | "date_change" | "general";
type AStatus = "draft" | "scheduled" | "sent";
type AAudience = "all_users" | "event";
type AChannel = "in_app" | "email" | "sms";

type Announcement = {
  id: string;
  type: AType;
  title: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
  audience: AAudience;
  event_id: string | null;
  event_title: string | null;
  channels: string[];
  status: AStatus;
  scheduled_for: string | null;
  sent_at: string | null;
  email_subject: string | null;
  email_body: string | null;
  sms_text: string | null;
  image_url: string | null;
  created_at: string;
};

type LocalEvent = { id: string; title: string; guests?: { email?: string; phone?: string }[] };

const TYPE_OPTS: { value: AType; label: string; icon: typeof Megaphone }[] = [
  { value: "venue_change", label: "Venue change", icon: MapPin },
  { value: "cancellation", label: "Cancellation", icon: AlertTriangle },
  { value: "date_change",  label: "Date change",  icon: Calendar },
  { value: "general",      label: "General update", icon: Megaphone },
];

const blankDraft = (): Partial<Announcement> => ({
  type: "general",
  title: "",
  body: "",
  link_url: "",
  link_label: "",
  audience: "all_users",
  event_id: "",
  event_title: "",
  channels: ["in_app"],
  status: "draft",
  scheduled_for: null,
  email_subject: "",
  email_body: "",
  sms_text: "",
  image_url: "",
});

function isoForLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AnnouncementsPanel() {
  const list = useServerFn(listAnnouncements);
  const save = useServerFn(upsertAnnouncement);
  const send = useServerFn(sendAnnouncement);
  const del = useServerFn(deleteAnnouncement);
  const draft = useServerFn(draftCommunication);
  // Broadcasting to every customer is owner-only (server + RLS enforce it too);
  // plain admins never see the "Everyone" audience option.
  const { isOwner } = useIsOwner();

  const [items, setItems] = useState<Announcement[]>([]);
  const [composer, setComposer] = useState<Partial<Announcement>>(blankDraft());

  // Non-owner admins can only compose event-scoped announcements.
  useEffect(() => {
    if (!isOwner) {
      setComposer((c) => (c.audience === "all_users" ? { ...c, audience: "event" } : c));
    }
  }, [isOwner]);



  const [scheduleLocal, setScheduleLocal] = useState("");
  const [loading, setLoading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [eventSearch, setEventSearch] = useState("");
  const [searchingEvents, setSearchingEvents] = useState(false);
  const editing = !!composer.id;

  const load = async () => setItems(((await list()) as Announcement[]) ?? []);
  useEffect(() => { load(); }, []);

  // Any host's event, looked up on the server (admin/owner only) — not just
  // events cached in this admin's own browser, so announcements can actually
  // target the event they're meant for.
  useEffect(() => {
    let cancelled = false;
    setSearchingEvents(true);
    const t = setTimeout(async () => {
      try {
        const rows = (await listAllEventsAdmin({
          data: { search: eventSearch, scope: "all", limit: 20 },
        })) as { id: string; data: { title?: string; guests?: { email?: string; phone?: string }[] } }[];
        if (cancelled) return;
        setEvents(
          rows.map((r) => ({
            id: r.id,
            title: r.data?.title || "(untitled event)",
            guests: r.data?.guests ?? [],
          })),
        );
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setSearchingEvents(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [eventSearch]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === composer.event_id),
    [events, composer.event_id],
  );

  const recipients = useMemo(() => {
    if (composer.audience !== "event" || !selectedEvent) return { emails: [], phones: [] };
    const emails: string[] = [];
    const phones: string[] = [];
    (selectedEvent.guests ?? []).forEach((g) => {
      if (g.email) emails.push(g.email);
      if (g.phone) phones.push(g.phone);
    });
    return { emails, phones };
  }, [composer.audience, selectedEvent]);

  function setField<K extends keyof Announcement>(k: K, v: Announcement[K] | string | null | undefined) {
    setComposer((c) => ({ ...c, [k]: v as Announcement[K] }));
  }

  function toggleChannel(ch: AChannel) {
    const cur = new Set(composer.channels ?? []);
    cur.has(ch) ? cur.delete(ch) : cur.add(ch);
    if (cur.size === 0) cur.add("in_app");
    setComposer({ ...composer, channels: Array.from(cur) });
  }

  async function runDraft() {
    if (!composer.title?.trim() || !composer.body?.trim()) {
      toast.error("Add a title and a short description first.");
      return;
    }
    setDrafting(true);
    try {
      const r = await draft({
        data: {
          type: composer.type as AType,
          title: composer.title!,
          body: composer.body!,
          event_title: composer.audience === "event" ? (selectedEvent?.title || composer.event_title || null) : null,
          link_url: composer.link_url || null,
        },
      });
      setComposer((c) => ({ ...c, email_subject: r.email_subject, email_body: r.email_body, sms_text: r.sms_text }));
      toast.success("Draft generated. Edit anything you like.");
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn't draft"));
    } finally {
      setDrafting(false);
    }
  }

  function newComposer() { setComposer(blankDraft()); setScheduleLocal(""); }
  function editItem(a: Announcement) {
    setComposer({ ...a });
    setScheduleLocal(a.scheduled_for ? isoForLocalInput(new Date(a.scheduled_for)) : "");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function persist(targetStatus: AStatus) {
    if (!composer.title?.trim() || !composer.body?.trim()) {
      toast.error("Title and body are required."); return;
    }
    if (targetStatus === "scheduled" && !scheduleLocal) {
      toast.error("Pick a date & time to schedule."); return;
    }
    if (composer.audience === "event" && !selectedEvent) {
      toast.error("Pick an event for event-scoped audience."); return;
    }
    setLoading(true);
    try {
      await save({
        data: {
          id: composer.id,
          type: composer.type as AType,
          title: composer.title!.trim(),
          body: composer.body!.trim(),
          link_url: composer.link_url?.trim() || null,
          link_label: composer.link_label?.trim() || null,
          audience: composer.audience as AAudience,
          event_id: composer.audience === "event" ? selectedEvent?.id || null : null,
          event_title: composer.audience === "event" ? selectedEvent?.title || null : null,
          channels: (composer.channels ?? ["in_app"]) as AChannel[],
          status: targetStatus,
          scheduled_for: targetStatus === "scheduled" ? new Date(scheduleLocal).toISOString() : null,
          email_subject: composer.email_subject?.trim() || null,
          email_body: composer.email_body?.trim() || null,
          sms_text: composer.sms_text?.trim() || null,
          image_url: composer.image_url?.trim() || null,
        },
      });
      const msg = targetStatus === "sent" ? "Announcement published"
        : targetStatus === "scheduled" ? "Scheduled" : "Saved as draft";
      toast.success(msg);
      newComposer();
      load();
    } catch (e) {
      toast.error(toUserMessage(e, "Failed to save"));
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); }
    catch { toast.error("Copy failed"); }
  }

  async function sendTestEmail() {
    const addr = window.prompt("Send a test email to which address?", "");
    if (!addr) return;
    try {
      await sendTransactionalEmail({
        templateName: "event-announcement",
        recipientEmail: addr.trim(),
        idempotencyKey: `test-announcement-${Date.now()}`,
        templateData: {
          title: composer.email_subject?.trim() || composer.title?.trim() || "Test announcement",
          body: composer.email_body?.trim() || composer.body?.trim() || "This is a test announcement from The Kenroe Collective.",
          type_label: composer.type ?? "general",
          event_title: composer.audience === "event" ? (selectedEvent?.title ?? composer.event_title ?? null) : null,
          link_url: composer.link_url?.trim() || null,
          link_label: composer.link_label?.trim() || null,
        },
      });
      toast.success(`Test email queued to ${addr}`);
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn’t send test email"));
    }
  }

  async function broadcastEmail() {
    if (composer.audience !== "event" || recipients.emails.length === 0) {
      toast.error("Pick an event with guests that have email addresses.");
      return;
    }
    const subject = composer.email_subject?.trim() || composer.title?.trim();
    const bodyText = composer.email_body?.trim() || composer.body?.trim();
    if (!subject || !bodyText) {
      toast.error("Add a subject and body first (use “Draft with AI” if you like).");
      return;
    }
    if (!(await confirmDialog({ title: `Send this email to ${recipients.emails.length} guest(s) now?` }))) return;
    let ok = 0, fail = 0;
    for (const addr of recipients.emails) {
      try {
        await sendTransactionalEmail({
          templateName: "event-announcement",
          recipientEmail: addr,
          idempotencyKey: `announce-${composer.id ?? "new"}-${addr}-${Date.now()}`,
          templateData: {
            title: subject,
            body: bodyText,
            type_label: composer.type ?? "general",
            event_title: selectedEvent?.title ?? null,
            link_url: composer.link_url?.trim() || null,
            link_label: composer.link_label?.trim() || null,
          },
        });
        ok++;
      } catch { fail++; }
    }
    toast[fail ? "warning" : "success"](`Emails queued: ${ok} sent${fail ? `, ${fail} failed` : ""}`);
  }

  const channels = new Set(composer.channels ?? []);
  const typeMeta = TYPE_OPTS.find((t) => t.value === composer.type)!;
  const TypeIcon = typeMeta.icon;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl">Announcements</h2>
          <p className="mt-1 text-xs text-muted-foreground">Send venue changes, cancellations, date changes, and updates to guests — in-app, by email, or by text.</p>
        </div>
        {editing && (
          <button onClick={newComposer} className="rounded-full bg-secondary px-3 py-1.5 text-xs">
            <Plus className="mr-1 inline h-3 w-3" /> New
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5 space-y-5">
        {/* Type chips */}
        <div className="flex flex-wrap gap-2">
          {TYPE_OPTS.map((opt) => {
            const Icon = opt.icon;
            const active = composer.type === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setField("type", opt.value)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  active ? "bg-velvet text-white" : "bg-secondary text-ink hover:bg-ink/10"
                }`}
              >
                <Icon className="h-3 w-3" /> {opt.label}
              </button>
            );
          })}
        </div>

        {/* Title + body */}
        <div className="grid gap-3">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Headline</label>
            <input
              value={composer.title ?? ""}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="e.g. Venue moved to The Glass Pavilion"
              className="mt-1 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              What changed? <span className="font-normal normal-case text-muted-foreground/70">— a few sentences. AI will polish.</span>
            </label>
            <textarea
              value={composer.body ?? ""}
              onChange={(e) => setField("body", e.target.value)}
              rows={3}
              placeholder="Quick notes on the change. The AI will turn this into a polished email and SMS."
              className="mt-1 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Link (optional)</label>
              <input
                value={composer.link_url ?? ""}
                onChange={(e) => setField("link_url", e.target.value)}
                placeholder="https://…"
                className="mt-1 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Link label</label>
              <input
                value={composer.link_label ?? ""}
                onChange={(e) => setField("link_label", e.target.value)}
                placeholder="See new venue"
                className="mt-1 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Hero image */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Hero image (optional)</label>
            <div className="mt-1 flex items-center gap-3">
              {composer.image_url ? (
                <img src={composer.image_url} alt="" className="h-14 w-14 rounded-md object-cover ring-1 ring-ink/10" />
              ) : (
                <div className="h-14 w-14 rounded-md bg-secondary text-[10px] flex items-center justify-center text-muted-foreground">None</div>
              )}
              <MediaPickerButton source="announcement" label={composer.image_url ? "Change image" : "Choose image"} onPick={(url) => setField("image_url", url)} />
              {composer.image_url ? (
                <button type="button" onClick={() => setField("image_url", "")} className="text-[11px] text-muted-foreground hover:text-destructive">Remove</button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Audience */}
        <div className="space-y-2">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Audience</label>
          <div className="flex flex-wrap gap-2">
            {isOwner && (
              <button
                onClick={() => setField("audience", "all_users")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${composer.audience === "all_users" ? "bg-ink text-paper" : "bg-secondary text-ink hover:bg-ink/10"}`}
              >Everyone</button>
            )}

            <button
              onClick={() => setField("audience", "event")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${composer.audience === "event" ? "bg-ink text-paper" : "bg-secondary text-ink hover:bg-ink/10"}`}
            >Specific event</button>
            {composer.audience === "event" && (
              <>
                <input
                  type="text"
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  placeholder="Search events by title…"
                  className="rounded-full border border-ink/15 bg-paper px-3 py-1.5 text-xs"
                />
                <select
                  value={composer.event_id ?? ""}
                  onChange={(e) => setField("event_id", e.target.value)}
                  className="rounded-full border border-ink/15 bg-paper px-3 py-1.5 text-xs"
                >
                  <option value="">{searchingEvents ? "Searching…" : "Choose an event…"}</option>
                  {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
                </select>
              </>
            )}
          </div>
          {composer.audience === "event" && selectedEvent && (
            <p className="text-[11px] text-muted-foreground">
              {(selectedEvent.guests?.length ?? 0)} guests · {recipients.emails.length} with email · {recipients.phones.length} with phone
            </p>
          )}
        </div>

        {/* Channels */}
        <div className="space-y-2">
          <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Channels</label>
          <div className="flex flex-wrap gap-2">
            <ChannelChip active={channels.has("in_app")} onClick={() => toggleChannel("in_app")} icon={<Megaphone className="h-3 w-3" />} label="In-app banner" />
            <ChannelChip active={channels.has("email")} onClick={() => toggleChannel("email")} icon={<Mail className="h-3 w-3" />} label="Email" />
            <ChannelChip active={channels.has("sms")} onClick={() => toggleChannel("sms")} icon={<MessageSquareText className="h-3 w-3" />} label="SMS / text" />
          </div>
        </div>

        {/* AI draft */}
        <div className="rounded-xl bg-velvet/5 p-4 ring-1 ring-velvet/15">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-velvet">
              <Sparkles className="h-4 w-4" /> AI-drafted email + SMS
            </div>
            <button
              onClick={runDraft}
              disabled={drafting}
              className="rounded-full bg-velvet px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {drafting ? "Drafting…" : composer.email_body ? "Re-draft" : "Draft with AI"}
            </button>
          </div>

          {(channels.has("email") || composer.email_body) && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Email subject</span>
                <button onClick={() => copy(composer.email_subject ?? "", "Subject")} className="text-[11px] text-velvet hover:underline"><Copy className="mr-0.5 inline h-3 w-3" /> Copy</button>
              </div>
              <input
                value={composer.email_subject ?? ""}
                onChange={(e) => setField("email_subject", e.target.value)}
                placeholder="Subject line"
                className="w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Email body</span>
                <div className="flex gap-3">
                  <button onClick={() => copy(composer.email_body ?? "", "Email body")} className="text-[11px] text-velvet hover:underline"><Copy className="mr-0.5 inline h-3 w-3" /> Copy</button>
                  {composer.audience === "event" && recipients.emails.length > 0 && (
                    <a
                      href={`mailto:?bcc=${encodeURIComponent(recipients.emails.join(","))}&subject=${encodeURIComponent(composer.email_subject ?? composer.title ?? "")}&body=${encodeURIComponent(composer.email_body ?? "")}`}
                      className="text-[11px] text-velvet hover:underline"
                    ><Mail className="mr-0.5 inline h-3 w-3" /> Open in email ({recipients.emails.length})</a>
                  )}
                </div>
              </div>
              <textarea
                value={composer.email_body ?? ""}
                onChange={(e) => setField("email_body", e.target.value)}
                rows={6}
                placeholder="Email body — generate with AI, then edit."
                className="w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={sendTestEmail}
                  className="rounded-full bg-ink/90 px-3 py-1.5 text-[11px] font-medium text-paper hover:bg-ink"
                >
                  <Mail className="mr-1 inline h-3 w-3" /> Send test email
                </button>
                {composer.audience === "event" && recipients.emails.length > 0 && (
                  <button
                    type="button"
                    onClick={broadcastEmail}
                    className="rounded-full bg-velvet px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90"
                  >
                    <Send className="mr-1 inline h-3 w-3" /> Send to {recipients.emails.length} guest{recipients.emails.length === 1 ? "" : "s"}
                  </button>
                )}
              </div>
            </div>
          )}

          {(channels.has("sms") || composer.sms_text) && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">SMS text <span className="ml-1 text-muted-foreground/70">({(composer.sms_text ?? "").length}/300)</span></span>
                <div className="flex gap-3">
                  <button onClick={() => copy(composer.sms_text ?? "", "SMS text")} className="text-[11px] text-velvet hover:underline"><Copy className="mr-0.5 inline h-3 w-3" /> Copy text</button>
                  {composer.audience === "event" && recipients.phones.length > 0 && (
                    <button onClick={() => copy(recipients.phones.join(", "), "Phone list")} className="text-[11px] text-velvet hover:underline"><Copy className="mr-0.5 inline h-3 w-3" /> Copy phone list ({recipients.phones.length})</button>
                  )}
                </div>
              </div>
              <textarea
                value={composer.sms_text ?? ""}
                onChange={(e) => setField("sms_text", e.target.value.slice(0, 300))}
                rows={3}
                placeholder="Short message for SMS / text. Copy and paste into your phone."
                className="w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Tip: paste this into Messages/WhatsApp to blast everyone manually. Auto-send requires connecting Twilio.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-end gap-2 border-t border-ink/5 pt-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Schedule for later (optional)</label>
            <input
              type="datetime-local"
              value={scheduleLocal}
              onChange={(e) => setScheduleLocal(e.target.value)}
              className="mt-1 w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
          </div>
          <button onClick={() => persist("draft")} disabled={loading} className="rounded-full bg-secondary px-4 py-2 text-xs font-medium hover:bg-ink/10 disabled:opacity-50">
            <Save className="mr-1 inline h-3 w-3" /> Save draft
          </button>
          <button onClick={() => persist("scheduled")} disabled={loading || !scheduleLocal} className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-40">
            <Calendar className="mr-1 inline h-3 w-3" /> Schedule
          </button>
          <button onClick={() => persist("sent")} disabled={loading} className="rounded-full bg-velvet px-5 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
            <Send className="mr-1 inline h-3 w-3" /> {editing ? "Re-publish now" : "Send now"}
          </button>
        </div>
        <p className="-mt-1 text-[11px] text-muted-foreground">
          Drafts and scheduled items appear in a dashed banner at the top of the site — visible only to admins. Click <strong>Send now</strong> to publish to everyone.
        </p>

        {/* Preview */}
        {composer.title && (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Banner preview</div>
            <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ring-1 ${
              composer.type === "cancellation" ? "bg-rose-50 ring-rose-300/60"
              : composer.type === "venue_change" ? "bg-amber-50 ring-amber-300/60"
              : composer.type === "date_change" ? "bg-sky-50 ring-sky-300/60"
              : "bg-card ring-ink/10"
            }`}>
              <TypeIcon className="mt-0.5 h-4 w-4 text-ink/70" />
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ink/60">{typeMeta.label}</div>
                <div className="font-medium text-ink">{composer.title}</div>
                <div className="text-[13px] text-ink/75 whitespace-pre-wrap">{composer.body}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div>
        <h3 className="font-serif text-lg">History</h3>
        <div className="mt-3 space-y-2">
          {items.length === 0 && <p className="text-xs text-muted-foreground">No announcements yet.</p>}
          {items.map((a) => {
            const Icon = (TYPE_OPTS.find((t) => t.value === a.type) ?? TYPE_OPTS[3]).icon;
            return (
              <div key={a.id} className="flex items-start gap-3 rounded-xl bg-card p-3 ring-1 ring-ink/5">
                <Icon className="mt-1 h-4 w-4 text-ink/60" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{a.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      a.status === "sent" ? "bg-emerald-100 text-emerald-700"
                      : a.status === "scheduled" ? "bg-sky-100 text-sky-700"
                      : "bg-secondary text-ink/70"
                    }`}>{a.status}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {a.audience === "event" ? (a.event_title || "specific event") : "everyone"}
                      {" · "}
                      {a.channels.join(", ")}
                      {a.scheduled_for && ` · scheduled ${formatTimestamp((a.scheduled_for))}`}
                      {a.sent_at && ` · sent ${formatTimestamp((a.sent_at))}`}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.body}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => editItem(a)} className="rounded-full bg-secondary px-3 py-1 text-xs">Edit</button>
                  {a.status !== "sent" && (
                    <button onClick={async () => { await send({ data: { id: a.id } }); toast.success("Published"); load(); }} className="rounded-full bg-velvet px-3 py-1 text-xs text-white">Send now</button>
                  )}
                  <button
                    onClick={async () => { if (!(await confirmDialog({ title: "Delete this announcement?" }))) return; await del({ data: { id: a.id } }); toast.success("Deleted"); load(); }}
                    className="rounded-full bg-secondary p-1.5 text-ink/60 hover:text-rose-600"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ChannelChip({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active ? "bg-velvet text-white" : "bg-secondary text-ink hover:bg-ink/10"
      }`}
    >
      {icon} {label}
    </button>
  );
}
