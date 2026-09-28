import { toUserMessage } from "@/lib/user-error";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import QRCode from "qrcode";
import { FileText, Printer, QrCode, ExternalLink } from "lucide-react";
import { checkInSummary, findGuestTable, isCheckedIn, isWalkIn, partyHeadcount, type KEvent } from "@/lib/events-store";
import { exportGuestQrCardsPdf, exportGuestQrCardsWord } from "@/lib/qr-card-export";
import { markEventMaterialUse } from "@/lib/pass-material-use.functions";
import { formatTimestamp } from "@/lib/datetime";
import { resolveDoorToken } from "@/lib/door-token";

export function CheckInPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const summary = checkInSummary(event);
  // The door token is server-managed, so a cached event copy may not carry it.
  // Resolve it authoritatively before building any door link or QR code.
  const [doorToken, setDoorToken] = useState<string | null>(event.shareToken ?? null);
  useEffect(() => {
    let cancelled = false;
    resolveDoorToken(event, eventId)
      .then((t) => {
        if (!cancelled) setDoorToken(t);
      })
      .catch(() => {
        /* the buttons below stay disabled until a token is available */
      });
    return () => {
      cancelled = true;
    };
  }, [event.shareToken, eventId]);

  const tokenParam = doorToken ? `?t=${encodeURIComponent(doorToken)}` : "";
  const checkinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/checkin/${eventId}${tokenParam}`
      : `/checkin/${eventId}${tokenParam}`;

  const [eventQr, setEventQr] = useState<string>("");
  const [exporting, setExporting] = useState<"pdf" | "word" | null>(null);

  useEffect(() => {
    if (!doorToken) return;
    QRCode.toDataURL(checkinUrl, { width: 200, margin: 1 }).then(setEventQr).catch(() => {});
  }, [checkinUrl, doorToken]);

  // Fire-and-forget: opening the check-in panel counts as material use for
  // the 24h refund window.
  useEffect(() => {
    markEventMaterialUse({ data: { eventId, reason: "checkin_activated" } }).catch(() => {});
  }, [eventId]);

  const handleExport = async (type: "pdf" | "word") => {
    setExporting(type);
    try {
      if (type === "pdf") await exportGuestQrCardsPdf(event, eventId);
      else await exportGuestQrCardsWord(event, eventId);
      markEventMaterialUse({ data: { eventId, reason: `export_${type}` } }).catch(() => {});
    } catch (error) {
      console.error(error);
      toast(toUserMessage(error, "Export failed. Please try again."));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-velvet/15 bg-velvet/5 p-4 text-sm text-ink/80">
        💡 Two ways to use this at the door: (1) open the door scanner on a tablet and tap names as
        guests arrive, or (2) print per-guest QR codes — each guest scans and is checked in instantly.
      </div>

      {/* Counts are PEOPLE, not rows: a guest checked in with their party of
          four counts as four, using the same partyHeadcount helper as the
          capacity cap so the door and the cap can never disagree. */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Invited arrived" value={summary.invitedArrivedHeads} />
        <Stat label="Walk-ins" value={summary.walkInHeads} />
        <Stat label="Expected (invited)" value={summary.expectedHeads} />
        <Stat
          label="Yet to arrive"
          value={summary.yetToArriveHeads}
          tone={summary.yetToArriveHeads > 0 ? "warn" : "ok"}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        {summary.totalOnSiteHeads} {summary.totalOnSiteHeads === 1 ? "person" : "people"} on site
        {summary.walkInCount > 0
          ? `, including ${summary.walkInCount} walk-in ${summary.walkInCount === 1 ? "party" : "parties"}`
          : ""}
        .
      </div>


      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-velvet" />
            <h3 className="font-serif text-base">Door scanner</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Open this on a tablet or phone at the door. Tap a guest as they arrive.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {eventQr && <img src={eventQr} alt="Door scanner QR" className="h-32 w-32 rounded-lg ring-1 ring-ink/10" />}
            <div className="flex flex-col gap-2">
              <Link
                to="/checkin/$eventId"
                params={{ eventId }}
                search={doorToken ? { t: doorToken, g: undefined } : { t: undefined, g: undefined }}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-full bg-velvet px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open door scanner
              </Link>
              <button
                onClick={() => navigator.clipboard.writeText(checkinUrl).then(() => toast("Copied!"))}
                className="rounded-full bg-secondary px-3 py-1.5 text-xs hover:bg-ink/10"
              >
                Copy link
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-velvet" />
            <h3 className="font-serif text-base">Printable guest QR cards</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Print one card per guest. They scan with their phone camera to check themselves in.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleExport("pdf")}
              disabled={exporting !== null}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5" /> {exporting === "pdf" ? "Exporting…" : "Export PDF"}
            </button>
            <button
              type="button"
              onClick={() => handleExport("word")}
              disabled={exporting !== null}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-ink/10 disabled:opacity-50"
            >
              <FileText className="h-3.5 w-3.5" /> {exporting === "word" ? "Exporting…" : "Export Word"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
        <div className="mb-3 font-serif text-base">Arrivals log</div>
        {(event.checkIns ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No one has checked in yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {(event.checkIns ?? [])
              .slice()
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((c) => {
                const g = event.guests.find((x) => x.id === c.guestId);
                const seatedAt = g ? findGuestTable(event, g.id) : undefined;
                const heads = c.heads ?? (g ? partyHeadcount(g) : 1);
                return (
                  <li key={c.guestId} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span>{g?.name ?? "Unknown guest"}</span>
                      {g && isWalkIn(g) && (
                        <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                          Walk-in
                        </span>
                      )}
                      {heads > 1 && (
                        <span className="rounded-full bg-ink/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          party of {heads}
                        </span>
                      )}
                      {seatedAt && (
                        <span className="rounded-full bg-velvet/10 px-1.5 py-0.5 text-[10px] text-velvet ring-1 ring-velvet/20">
                          {seatedAt.label}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">{formatTimestamp(c.at)}</span>
                  </li>
                );
              })}
          </ul>
        )}
        <div className="mt-3 text-[11px] text-muted-foreground">
          Guests not yet arrived:{" "}
          {summary.invitedExpected
            .filter((g) => !isCheckedIn(event, g.id))
            .map((g) => {
              const t = findGuestTable(event, g.id);
              return t ? `${g.name} (${t.label})` : g.name;
            })
            .join(", ") || "everyone is here ✨"}
        </div>


      </div>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "ok" | "warn" }) {
  const ring = tone === "warn" ? "ring-amber-300/60" : tone === "ok" ? "ring-emerald-300/40" : "ring-ink/5";
  return (
    <div className={`rounded-2xl bg-card p-4 ring-1 ${ring}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-serif text-2xl">{value}</div>
    </div>
  );
}
