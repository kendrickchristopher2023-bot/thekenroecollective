import { toUserMessage } from "@/lib/user-error";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { listContacts, upsertContactsFromGuests } from "@/lib/contacts.functions";
import { logHostGuestConsent } from "@/lib/host-consent.functions";
import { GuestConsentCheckbox, CONSENT_DISABLED_TOOLTIP } from "@/components/guest-consent-checkbox";
import { addGuest } from "@/lib/events-store";
import { toast } from "sonner";
import { Users2, Search } from "lucide-react";

interface ContactRow {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  tags: string[] | null;
}

export function ContactsPickerButton({
  eventId,
  existingKeys,
  onImported,
}: {
  eventId: string;
  /** Set of "email|phoneDigits|nameLower" keys already present in the event's guests. */
  existingKeys: Set<string>;
  onImported?: (count: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);

  const listFn = useServerFn(listContacts);
  const autoCaptureFn = useServerFn(upsertContactsFromGuests);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFn({ data: { search: search.trim() || undefined, limit: 300 } });
      setRows((res.contacts as ContactRow[]) || []);
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't load contacts."));
    } finally {
      setLoading(false);
    }
  }, [listFn, search]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  function keyOf(c: ContactRow) {
    return `${(c.email || "").toLowerCase()}|${(c.phone || "").replace(/\D/g, "")}|${c.display_name.toLowerCase().trim()}`;
  }

  function isDuplicate(c: ContactRow) {
    return existingKeys.has(keyOf(c));
  }

  async function importSelected() {
    const picked = rows.filter((r) => selected[r.id] && !isDuplicate(r));
    if (picked.length === 0) {
      toast("Select at least one contact to add.");
      return;
    }
    setBusy(true);
    try {
      for (const c of picked) {
        addGuest(eventId, c.display_name, c.email || "", c.phone || "", "");
      }
      // Record the event link on each contact (no dup — upsert on (contact_id, event_id)).
      autoCaptureFn({
        data: {
          eventId,
          guests: picked.map((c) => ({ name: c.display_name, email: c.email, phone: c.phone })),
        },
      }).catch(() => {});
      logHostGuestConsent({ data: { eventId, source: "contacts_picker", guestCount: picked.length } }).catch(() => {});
      toast.success(`Added ${picked.length} guest${picked.length === 1 ? "" : "s"} from your contacts.`);
      onImported?.(picked.length);
      setSelected({});
      setConsent(false);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Users2 className="mr-2 h-4 w-4" /> Pick from Contacts
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add guests from your Contacts</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 opacity-60" />
            <Input
              placeholder="Search by name, email, or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void load(); }
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              Search
            </Button>
          </div>

          <div className="max-h-[420px] overflow-auto rounded-md border">
            {loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No contacts yet. Add them from the Contacts page.
              </div>
            ) : (
              <ul className="divide-y">
                {rows.map((c) => {
                  const dup = isDuplicate(c);
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                      <Checkbox
                        checked={!!selected[c.id]}
                        disabled={dup}
                        onCheckedChange={(v) =>
                          setSelected((prev) => ({ ...prev, [c.id]: !!v }))
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate font-medium">{c.display_name}</div>
                          {dup && <Badge variant="secondary" className="text-[10px]">Already added</Badge>}
                          {(c.tags || []).slice(0, 3).map((t) => (
                            <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                          ))}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {c.email || c.phone || "—"}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <GuestConsentCheckbox checked={consent} onChange={setConsent} id="contacts-picker-consent" />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={importSelected}
              disabled={busy || selectedCount === 0 || !consent}
              title={!consent ? CONSENT_DISABLED_TOOLTIP : undefined}
            >
              {busy ? "Adding…" : selectedCount > 0 ? `Add ${selectedCount} guest${selectedCount === 1 ? "" : "s"}` : "Add selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
