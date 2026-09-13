import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { type CandidateLabel } from "@/lib/guest-lookup";
import { submitGuestRequest, selfAddGuest } from "@/lib/guest-requests.functions";
import {
  formatMoney,
  partyPhrase,
  requestOwed,
  type RequestPricingEvent,
} from "@/lib/guest-request-review";

/**
 * "Is this you?" picker. The rows arrive already masked from the server: the
 * guest list itself never reaches an unauthenticated browser, so there is no
 * full guest record here to leak.
 */
export function GuestCandidatePicker({
  rows,
  onPick,
  onCancel,
}: {
  rows: CandidateLabel[];
  onPick: (guestId: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Is this you?</p>
      <ul className="divide-y divide-ink/5 overflow-hidden rounded-xl ring-1 ring-ink/10">
        {rows.map((row) => {
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onPick(row.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition hover:bg-secondary"
              >
                <span className="font-medium">{row.label}</span>
                {row.hint && <span className="text-xs text-muted-foreground">{row.hint}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        Names and contact details are partly hidden to protect the guest list. If two rows still look
        the same, choose &ldquo;None of these are me&rdquo; and reach the host.
      </p>
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-muted-foreground underline underline-offset-4"
      >
        None of these are me
      </button>
    </div>
  );
}


interface HostContact {
  name?: string;
  email?: string;
  phone?: string;
}

/**
 * "Can't find your name?" — the fallback for guests who arrived from a
 * forwarded link. Offers the host's contact details when the host chose to
 * share them, plus a request the host reviews in the dashboard. When the host
 * opened the guest list, the same form adds the guest directly.
 */
export function GuestLookupFallback({
  eventId,
  hosts,
  openGuestList,
  typedName,
  pricing,
  onSelfAdded,
}: {
  eventId: string;
  hosts?: HostContact[];
  openGuestList?: boolean;
  typedName?: string;
  /** Payment settings, so the requester sees the cost for their whole party. */
  pricing?: RequestPricingEvent;
  onSelfAdded?: (guest: { id: string; name: string; email?: string; phone?: string }) => void;
}) {
  const [name, setName] = useState(typedName || "");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const requestFn = useServerFn(submitGuestRequest);
  const selfAddFn = useServerFn(selfAddGuest);

  const owed = requestOwed(pricing || {}, partySize);

  // Opt-IN only: a host who never ticked "share my contact details" must not
  // have their email or phone printed on a forwardable public page. The public
  // payload now strips those fields too, so this is belt and braces.
  const shareable = (hosts || []).filter((h) => h && (h as any).showContact === true && (h.email || h.phone));


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanContact = contact.trim();
    if (cleanName.length < 2) {
      toast.error("Please enter your full name.");
      return;
    }
    if (cleanContact.length < 5) {
      toast.error("Please add an email address or mobile number so the host can reach you.");
      return;
    }
    setBusy(true);
    try {
      if (openGuestList) {
        const isEmail = cleanContact.includes("@");
        const res = await selfAddFn({
          data: {
            eventId,
            name: cleanName,
            email: isEmail ? cleanContact : undefined,
            phone: isEmail ? undefined : cleanContact,
          },
        });
        if (!res.ok) {
          toast.error(
            res.reason === "already_listed"
              ? "You're already on the guest list — search for your name again."
              : res.reason === "at_capacity"
                ? "This event is at capacity. Reach out to the host directly."
                : "We couldn't add you just now. Please try again.",
          );
          return;
        }
        toast.success("You're on the list. You can RSVP now.");
        setDone(true);
        if (res.guestId) {
          onSelfAdded?.({
            id: res.guestId,
            name: cleanName,
            email: isEmail ? cleanContact : undefined,
            phone: isEmail ? undefined : cleanContact,
          });
        }
        return;
      }

      const res = await requestFn({
        data: {
          eventId,
          name: cleanName,
          contact: cleanContact,
          note: note.trim() || undefined,
          partySize,
        },
      });
      if (!res.ok) {
        toast.error(
          res.reason === "rate_limited"
            ? "There have been a lot of requests for this event. Please try again a little later."
            : "We couldn't send that request. Please try again.",
        );
        return;
      }
      setDone(true);
      toast.success("Request sent to the host.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl bg-secondary/60 p-5 ring-1 ring-ink/5">
      <p className="text-sm font-medium">Can&apos;t find your name?</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Invitations get forwarded, so you may be listed under a different name or address. Try your
        other email or mobile number first, then use the options below.
      </p>

      {shareable.length > 0 && (
        <div className="mt-4 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-velvet">Reach the host</p>
          {shareable.map((h, i) => (
            <p key={i} className="text-sm">
              {h.name || "Your host"}{" "}
              {h.email && (
                <a href={`mailto:${h.email}`} className="text-velvet underline underline-offset-4">
                  {h.email}
                </a>
              )}
              {h.email && h.phone ? " · " : ""}
              {h.phone && (
                <a href={`tel:${h.phone}`} className="text-velvet underline underline-offset-4">
                  {h.phone}
                </a>
              )}
            </p>
          ))}
        </div>
      )}

      {done ? (
        <p className="mt-4 text-sm text-velvet">
          {openGuestList
            ? "You've been added. Your RSVP form is ready above."
            : "Sent. The host will add you and you'll hear back at the contact you gave."}
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-velvet">
            {openGuestList ? "Add yourself" : "Ask the host to add me"}
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            className="w-full rounded-lg border border-ink/10 bg-card px-4 py-3 text-sm focus:border-velvet focus:outline-none"
          />
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Email address or mobile number"
            className="w-full rounded-lg border border-ink/10 bg-card px-4 py-3 text-sm focus:border-velvet focus:outline-none"
          />
          {!openGuestList && (
            <>
              <div className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground" htmlFor="lookup-party">
                  People in your party
                </label>
                <input
                  id="lookup-party"
                  type="number"
                  min={1}
                  max={20}
                  value={partySize}
                  onChange={(e) => setPartySize(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="w-20 rounded-lg border border-ink/10 bg-card px-3 py-2 text-sm focus:border-velvet focus:outline-none"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Count yourself and anyone you&apos;d bring
                {partySize > 1 ? `, so ${partyPhrase(partySize)}` : ""}.
              </p>
              {owed > 0 && (
                <p className="rounded-lg bg-velvet/10 px-3 py-2 text-xs text-ink">
                  This event asks guests to contribute. For your party that comes to{" "}
                  <strong>{formatMoney(owed)}</strong>, payable after the host adds you. Nothing is
                  charged when you send this request.
                </p>
              )}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Anything the host should know (optional)"
                className="w-full rounded-lg border border-ink/10 bg-card px-4 py-3 text-sm focus:border-velvet focus:outline-none"
              />
            </>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-velvet px-6 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Sending…" : openGuestList ? "Add me to the guest list" : "Send request to host"}
          </button>
        </form>
      )}
    </div>
  );
}
