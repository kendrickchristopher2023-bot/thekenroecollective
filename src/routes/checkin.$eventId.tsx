import { toUserMessage } from "@/lib/user-error";
import { formatTimestamp } from "@/lib/datetime";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Search, Undo2, UserPlus } from "lucide-react";
import {
  fetchViewerEvent,
  findGuestTable,
  isCheckedIn,
  isWalkIn,
  checkInSummary,
  partyHeadcount,
  clampPartyCount,
  useEvent,
  type KEvent,
} from "@/lib/events-store";
import { submitGuestCheckin, submitWalkIn } from "@/lib/events-sync.functions";

import { useEventRealtime } from "@/hooks/use-event-realtime";

type CheckInEntry = NonNullable<KEvent["checkIns"]>[number];
type DoorGuest = KEvent["guests"][number];

export const Route = createFileRoute("/checkin/$eventId")({
  validateSearch: (s: Record<string, unknown>) => ({
    g: typeof s.g === "string" ? s.g : undefined,
    t: typeof s.t === "string" ? s.t : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Door check-in — The Kenroe Collective" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckInPage,
});

function CheckInPage() {
  const { eventId } = Route.useParams();
  const { g: guestParam, t: tokenParam } = Route.useSearch();
  const localEvent = useEvent(eventId);
  const [remoteEvent, setRemoteEvent] = useState<KEvent | null | undefined>(undefined);

  // The door page is a live view of the SERVER copy. It never writes through
  // the local events store: that queued a whole-event push on every scan, which
  // raced the authoritative check-in RPC, flipped the global "Syncing changes"
  // pill, and left the row stale until the operator refreshed by hand.
  const doorToken = tokenParam ?? localEvent?.shareToken ?? remoteEvent?.shareToken;
  const doorTokenForFetch = tokenParam ?? localEvent?.shareToken;

  const syncFromServer = useCallback(async () => {
    const fresh = await fetchViewerEvent(eventId, doorTokenForFetch);
    if (fresh) setRemoteEvent(fresh);
    return fresh;
  }, [eventId, doorTokenForFetch]);

  const loadedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    fetchViewerEvent(eventId, doorTokenForFetch).then((e) => {
      if (cancelled) return;
      loadedRef.current = true;
      setRemoteEvent(e ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, doorTokenForFetch]);

  const onRealtime = useCallback((next: KEvent | null) => {
    if (next) setRemoteEvent(next);
  }, []);
  useEventRealtime(eventId, onRealtime);

  const [query, setQuery] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInAdults, setWalkInAdults] = useState(1);
  const [walkInKids, setWalkInKids] = useState(0);
  const [walkInSaving, setWalkInSaving] = useState(false);
  const [pending, setPending] = useState<Record<string, true>>({});
  // Instant, per-guest optimistic overlay: `entry` = arrived, `null` = undone.
  const [overrides, setOverrides] = useState<Record<string, CheckInEntry | null>>({});
  const [extraGuests, setExtraGuests] = useState<DoorGuest[]>([]);

  const base = remoteEvent ?? localEvent;
  const event = useMemo<KEvent | undefined>(() => {
    if (!base) return undefined;
    const overrideIds = Object.keys(overrides);
    if (overrideIds.length === 0 && extraGuests.length === 0) return base;
    const checkIns: CheckInEntry[] = (base.checkIns ?? []).filter(
      (c) => !(c.guestId in overrides),
    );
    for (const id of overrideIds) {
      const entry = overrides[id];
      if (entry) checkIns.push(entry);
    }
    const guests = extraGuests.length
      ? [...base.guests, ...extraGuests.filter((g) => !base.guests.some((x) => x.id === g.id))]
      : base.guests;
    return { ...base, checkIns, guests };
  }, [base, overrides, extraGuests]);

  const clearOverride = useCallback((guestId: string) => {
    setOverrides((o) => {
      if (!(guestId in o)) return o;
      const next = { ...o };
      delete next[guestId];
      return next;
    });
  }, []);

  const releasePending = useCallback((guestId: string) => {
    setPending((p) => {
      if (!(guestId in p)) return p;
      const next = { ...p };
      delete next[guestId];
      return next;
    });
  }, []);

  async function markCheckedIn(guestId: string, note?: string, heads?: number) {
    if (!doorToken || pending[guestId]) return;
    setPending((p) => ({ ...p, [guestId]: true }));
    setError(null);
    setOverrides((o) => ({
      ...o,
      [guestId]: { guestId, at: new Date().toISOString(), note, heads },
    }));
    try {
      await submitGuestCheckin({
        data: { eventId, guestId, checkedIn: true, note, heads, shareToken: doorToken },
      });
      await syncFromServer();
      clearOverride(guestId);
    } catch (err) {
      console.warn("[checkin] remote sync failed", err);
      clearOverride(guestId);
      setError(toUserMessage(err, "Check-in could not be saved. Try again."));
    } finally {
      releasePending(guestId);
    }
  }

  async function markUndoCheckIn(guestId: string) {
    if (!doorToken || pending[guestId]) return;
    setPending((p) => ({ ...p, [guestId]: true }));
    setError(null);
    setOverrides((o) => ({ ...o, [guestId]: null }));
    try {
      await submitGuestCheckin({
        data: { eventId, guestId, checkedIn: false, shareToken: doorToken },
      });
      await syncFromServer();
      clearOverride(guestId);
      setFlash("Check-in reversed");
      setTimeout(() => setFlash(null), 2500);
    } catch (err) {
      console.warn("[checkin] remote sync failed", err);
      clearOverride(guestId);
      setError(toUserMessage(err, "That change could not be saved. Try again."));
    } finally {
      releasePending(guestId);
    }
  }

  // Walk-in: someone who was never on the invite list. The server creates the
  // guest row (source:"walkin", status:"yes") and its arrival in one write, so
  // a failed request can never leave a phantom guest behind.
  async function addWalkIn() {
    const name = walkInName.trim();
    if (!name || walkInSaving) return;
    setWalkInSaving(true);
    setError(null);
    try {
      const adults = Math.max(1, clampPartyCount(walkInAdults));
      const children = clampPartyCount(walkInKids);
      const res = await submitWalkIn({
        data: { eventId, name, adults, children, shareToken: doorToken },
      });
      setExtraGuests((list) => [
        ...list,
        {
          id: res.guestId,
          name,
          email: "",
          phone: "",
          status: "yes" as const,
          adults,
          children,
          source: "walkin" as const,
        },
      ]);
      setOverrides((o) => ({
        ...o,
        [res.guestId]: {
          guestId: res.guestId,
          at: new Date().toISOString(),
          heads: res.heads,
          note: "walk-in",
        },
      }));
      const fresh = await syncFromServer();
      if (fresh?.guests.some((g) => g.id === res.guestId)) {
        setExtraGuests((list) => list.filter((g) => g.id !== res.guestId));
        clearOverride(res.guestId);
      }
      setFlash(`Walk-in added: ${name}${res.heads > 1 ? ` (party of ${res.heads})` : ""}`);
      setTimeout(() => setFlash(null), 3000);
      setWalkInName("");
      setWalkInAdults(1);
      setWalkInKids(0);
      setWalkInOpen(false);
    } catch (err) {
      setError(toUserMessage(err, "That walk-in could not be saved. Try again."));
    } finally {
      setWalkInSaving(false);
    }
  }

  // Gate: door check-in requires the per-event share token. The owner reaches
  // this page from their dashboard with the token already attached, and every
  // generated QR / share link includes it. localEvent (owner's own cache) is
  // always allowed so the owner never gets locked out.
  const tokenOk =
    !!localEvent ||
    (event?.shareToken
      ? event.shareToken.trim() === (tokenParam ?? "").trim()
      : false);

  // If linked from a per-guest QR (?g=...), check them in automatically.
  const autoRanRef = useRef<string | null>(null);
  useEffect(() => {
    if (!event || !guestParam || !tokenOk) return;
    if (autoRanRef.current === guestParam) return;
    autoRanRef.current = guestParam;
    const guest = event.guests.find((x) => x.id === guestParam);
    if (!guest) return;
    const t = findGuestTable(event, guest.id);
    if (!isCheckedIn(event, guest.id)) {
      const heads = partyHeadcount(guest);
      void markCheckedIn(guest.id, undefined, heads);
      setFlash(
        `Welcome, ${guest.name}${heads > 1 ? ` + party of ${heads}` : ""} ✨${t ? ` — seated at ${t.label}` : ""}`,
      );
    } else {
      setFlash(`${guest.name} is already checked in${t ? ` — seated at ${t.label}` : ""}`);
    }
    const timer = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, guestParam, eventId, tokenOk]);



  if (!event) {
    if (!localEvent && remoteEvent === undefined) {
      return (
        <div className="min-h-screen bg-paper px-6 py-24 text-center text-sm text-muted-foreground">
          Loading door check-in…
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-paper px-6 py-24 text-center">
        <h1 className="font-serif text-3xl">We couldn't open this event</h1>
        <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
          The link may be out of date, or the event may have been archived. Open the event from your
          events list and copy a fresh check-in link.
        </p>
        <Link to="/events" className="mt-6 inline-block text-sm text-velvet underline underline-offset-4">
          ← Back
        </Link>
      </div>
    );
  }

  if (!tokenOk) {
    return (
      <div className="min-h-screen bg-paper px-6 py-24 text-center">
        <h1 className="font-serif text-3xl">This link needs a fresh access code</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          For privacy, door check-in links are now token-gated. Ask the event host to share the
          current link from their event dashboard (Check-in tab → "Copy link" or "Open door scanner").
        </p>
        <Link to="/events" className="mt-6 inline-block text-sm text-velvet underline underline-offset-4">
          ← Back to your events
        </Link>
      </div>
    );
  }


  const summary = checkInSummary(event);
  const expected = event.guests.filter((x) => isWalkIn(x) || x.status === "yes" || x.status === "maybe");
  const filtered = (query
    ? expected.filter((g) => g.name.toLowerCase().includes(query.toLowerCase()))
    : expected
  ).slice(0, 60);

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-10 border-b border-ink/10 bg-paper/90 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">Door check-in</div>
            <h1 className="font-serif text-xl leading-tight">{event.title}</h1>
          </div>

          <div className="text-xs sm:text-right">
            <div className="font-serif text-2xl">
              {summary.invitedArrivedHeads}
              <span className="text-muted-foreground"> / {summary.expectedHeads}</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              invited here
              {summary.walkInHeads > 0
                ? ` · +${summary.walkInHeads} walk-in${summary.walkInHeads === 1 ? "" : "s"}`
                : ""}
            </div>
          </div>

        </div>
      </header>



      {flash && (
        <div className="sticky top-[72px] z-10 mx-auto max-w-2xl px-4 py-2">
          <div className="rounded-2xl bg-emerald-500 px-4 py-3 text-center text-sm font-medium text-white shadow-lg">
            ✨ {flash}
          </div>
        </div>
      )}

      {error && (
        <div className="mx-auto max-w-2xl px-4 pt-2">
          <div className="flex items-start justify-between gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs underline underline-offset-2">
              Dismiss
            </button>
          </div>
        </div>
      )}


      <div className="mx-auto max-w-2xl px-4 py-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guest name…"
            className="w-full rounded-full bg-card py-3 pl-11 pr-4 text-base ring-1 ring-ink/10 focus:outline-none focus:ring-velvet"
          />
        </div>

        {/* Three-up even on a phone: door staff need the headcounts in one
            glance, not three stacked full-width cards pushing the list off
            screen. */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <DoorStat label="Invited arrived" value={summary.invitedArrivedHeads} />
          <DoorStat label="Walk-ins" value={summary.walkInHeads} />
          <DoorStat label="Yet to arrive" value={summary.yetToArriveHeads} />
        </div>

        <div className="mt-3 rounded-2xl bg-card p-4 ring-1 ring-ink/10">
          {!walkInOpen ? (
            <button
              type="button"
              onClick={() => setWalkInOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
            >
              <UserPlus className="h-4 w-4" /> Add walk-in
            </button>
          ) : (
            <div className="space-y-3">
              <div className="font-serif text-base">Add a walk-in</div>
              <input
                autoFocus
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                placeholder="Name"
                maxLength={80}
                className="w-full rounded-xl bg-paper px-3 py-2 text-base ring-1 ring-ink/10 focus:outline-none focus:ring-velvet"
              />
              <div className="flex gap-3">
                <label className="flex-1 text-xs text-muted-foreground">
                  Adults
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={walkInAdults}
                    onChange={(e) => setWalkInAdults(clampPartyCount(Number(e.target.value)))}
                    className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-base text-ink ring-1 ring-ink/10 focus:outline-none focus:ring-velvet"
                  />
                </label>
                <label className="flex-1 text-xs text-muted-foreground">
                  Kids
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={walkInKids}
                    onChange={(e) => setWalkInKids(clampPartyCount(Number(e.target.value)))}
                    className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-base text-ink ring-1 ring-ink/10 focus:outline-none focus:ring-velvet"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addWalkIn}
                  disabled={walkInSaving || !walkInName.trim()}
                  className="rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {walkInSaving ? "Saving…" : "Add and check in"}
                </button>
                <button
                  type="button"
                  onClick={() => setWalkInOpen(false)}
                  className="rounded-full bg-secondary px-4 py-2 text-sm hover:bg-ink/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <ul className="mt-4 space-y-2">
          {filtered.map((g) => {
            const here = isCheckedIn(event, g.id);
            const arrival = (event.checkIns ?? []).find((c) => c.guestId === g.id);
            const seatedAt = findGuestTable(event, g.id);
            const party = partyHeadcount(g);
            const walkIn = isWalkIn(g);
            return (
              <li
                key={g.id}
                className={`flex items-center justify-between gap-3 rounded-2xl p-4 ring-1 transition ${
                  here ? "bg-emerald-50 ring-emerald-200" : "bg-card ring-ink/10"
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-serif text-lg">{g.name}</span>
                    {walkIn && (
                      <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                        Walk-in
                      </span>
                    )}
                    {seatedAt && (
                      <span className="rounded-full bg-velvet/10 px-2 py-0.5 text-[10px] font-medium text-velvet ring-1 ring-velvet/20">
                        {seatedAt.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[
                      party > 1 ? `party of ${party}` : null,
                      g.adults && `${g.adults} adult${g.adults > 1 ? "s" : ""}`,
                      g.children && `${g.children} kid${g.children > 1 ? "s" : ""}`,
                      g.plusOnes?.length ? `${g.plusOnes.length} plus-one${g.plusOnes.length > 1 ? "s" : ""}` : null,
                      g.dietary,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {here && arrival && (
                    <div className="mt-1 text-[11px] text-emerald-700">
                      Checked in {formatTimestamp(arrival.at)}
                    </div>
                  )}
                </div>
                {here ? (
                  <button
                    onClick={() => void markUndoCheckIn(g.id)}
                    disabled={!!pending[g.id]}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-emerald-300 hover:bg-emerald-100"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Here
                    <Undo2 className="h-3 w-3 text-muted-foreground" />
                  </button>
                ) : (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button
                      onClick={() => {
                         void markCheckedIn(g.id, undefined, party);
                        setFlash(
                          `Welcome, ${g.name}${party > 1 ? ` + party of ${party}` : ""} ✨${seatedAt ? ` — seated at ${seatedAt.label}` : ""}`,
                        );
                        setTimeout(() => setFlash(null), 2500);
                      }}
                       disabled={!!pending[g.id]}
                       className="rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {party > 1 ? `Check in party of ${party}` : "Check in"}
                    </button>
                    {party > 1 && (
                      <button
                        onClick={() => {
                           void markCheckedIn(g.id, "arrived alone", 1);
                          setFlash(`Welcome, ${g.name} ✨ (1 person)`);
                          setTimeout(() => setFlash(null), 2500);
                        }}
                         disabled={!!pending[g.id]}
                         className="inline-flex min-h-11 items-center justify-center px-2 text-xs text-muted-foreground underline underline-offset-2 disabled:opacity-50"
                      >
                        just them (1)
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}


          {filtered.length === 0 && (
            <li className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-ink/5">
              No matching guests.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function DoorStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-card p-3 ring-1 ring-ink/10">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-serif text-xl">{value}</div>
    </div>
  );
}

