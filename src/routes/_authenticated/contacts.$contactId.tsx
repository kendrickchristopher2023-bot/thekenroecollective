import { toUserMessage } from "@/lib/user-error";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { getContact, upsertContact, getContactActivity, setContactEmailPref, removeFromGroup } from "@/lib/contacts.functions";
import { formatEventDateNumeric, formatStampDate } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/contacts/$contactId")({
  head: () => ({ meta: [{ title: "Contact — The Kenroe Collective" }] }),
  component: ContactDetailPage,
});

type ActivityLink = {
  event_id: string;
  rsvp_status: string | null;
  gift_amount_cents: number | null;
  thankyou_sent_at: string | null;
  created_at: string;
  event: { id: string; title: string; date: string | null } | null;
};

function ContactDetailPage() {
  const { contactId } = Route.useParams();
  const fetchOne = useServerFn(getContact);
  const save = useServerFn(upsertContact);
  const activity = useServerFn(getContactActivity);
  const setEmailPref = useServerFn(setContactEmailPref);
  const removeGroup = useServerFn(removeFromGroup);

  const [contact, setContact] = useState<any | null>(null);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const [links, setLinks] = useState<ActivityLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [c, a] = await Promise.all([
          fetchOne({ data: { id: contactId } }),
          activity({ data: { id: contactId } }),
        ]);
        if (!alive) return;
        setContact(c.contact);
        setNotes(c.contact?.notes || "");
        setTags((c.contact?.tags || []).join(", "));
        setGroups((c as any).groups || []);
        setLinks(a.links as any);
      } catch (e) {
        if (alive) setError(toUserMessage(e, "Failed to load"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [contactId]);

  async function saveNotes() {
    if (!contact) return;
    setSaving(true);
    try {
      await save({
        data: {
          id: contact.id,
          display_name: contact.display_name,
          email: contact.email,
          phone: contact.phone,
          notes,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        },
      });
      toast.success("Saved");
    } catch (e) {
      toast.error(toUserMessage(e, "Failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <div className="text-xs">
          <Link to="/contacts" className="text-velvet hover:underline">← All contacts</Link>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="rounded-2xl bg-card p-8 ring-1 ring-ink/5 text-sm text-red-500">{error}</div>
        ) : contact ? (
          <>
            <header className="rounded-3xl bg-card p-6 ring-1 ring-ink/5">
              <h1 className="font-serif text-3xl">{contact.display_name}</h1>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                {contact.email && <span>✉︎ {contact.email}</span>}
                {contact.phone && <span>☎︎ {contact.phone}</span>}
                <span>Source: {contact.source}</span>
                <span>Added {formatStampDate(contact.created_at)}</span>
              </div>
              <label className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!!contact.email_opt_out}
                  onChange={async (e) => {
                    await setEmailPref({ data: { id: contact.id, emailOptOut: e.target.checked } });
                    setContact({ ...contact, email_opt_out: e.target.checked });
                    toast.success("Preference saved");
                  }}
                />
                Opted out of broadcasts
              </label>
              {groups.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Groups:</span>
                  {groups.map((g) => (
                    <span key={g.id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs">
                      {g.name}
                      <button
                        onClick={async () => {
                          await removeGroup({ data: { groupId: g.id, contactId: contact.id } });
                          setGroups((prev) => prev.filter((x) => x.id !== g.id));
                          toast.success(`Removed from ${g.name}`);
                        }}
                        aria-label={`Remove from ${g.name}`}
                        className="text-muted-foreground hover:text-ink"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </header>

            <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5">
              <h2 className="font-serif text-xl">Tags & notes</h2>
              <label className="mt-4 block text-xs text-muted-foreground">
                Tags (comma-separated)
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
                />
              </label>
              <label className="mt-3 block text-xs text-muted-foreground">
                Notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
                  placeholder="Dietary restrictions, preferred pronouns, VIP notes…"
                />
              </label>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={saveNotes}
                  disabled={saving}
                  className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </section>

            <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5">
              <h2 className="font-serif text-xl">Event history</h2>
              {links.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No events linked yet.</p>
              ) : (
                <ul className="mt-4 divide-y divide-ink/5">
                  {links.map((l) => (
                    <li key={l.event_id + l.created_at} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {l.event?.title || l.event_id}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {l.event?.date ? formatEventDateNumeric(l.event.date) + " · " : ""}
                          Linked {formatStampDate(l.created_at)}
                          {l.rsvp_status ? ` · RSVP: ${l.rsvp_status}` : ""}
                          {l.gift_amount_cents ? ` · Gift $${(l.gift_amount_cents / 100).toFixed(2)}` : ""}
                          {l.thankyou_sent_at ? " · Thank-you sent" : ""}
                        </div>
                      </div>
                      {l.event?.id && (
                        <Link
                          to="/events/$eventId"
                          params={{ eventId: l.event.id }}
                          className="text-xs text-velvet hover:underline"
                        >
                          Open →
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
      <SiteFooter />
    </div>
  );
}
