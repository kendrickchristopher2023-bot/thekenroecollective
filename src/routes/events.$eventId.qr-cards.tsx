import { toUserMessage } from "@/lib/user-error";
import { toast } from "sonner";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { fetchViewerEvent, useEvent, type KEvent } from "@/lib/events-store";
import { exportGuestQrCardsPdf, exportGuestQrCardsWord } from "@/lib/qr-card-export";
import { resolveDoorToken } from "@/lib/door-token";

export const Route = createFileRoute("/events/$eventId/qr-cards")({
  validateSearch: (s: Record<string, unknown>) => ({
    t: typeof s.t === "string" ? s.t : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Guest QR cards — The Kenroe Collective" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QrCardsPage,
});

function QrCardsPage() {
  const { eventId } = Route.useParams();
  const { t: tokenParam } = Route.useSearch();
  const localEvent = useEvent(eventId);
  const [remoteEvent, setRemoteEvent] = useState<KEvent | null | undefined>(undefined);
  useEffect(() => {
    if (localEvent) return;
    let cancelled = false;
    fetchViewerEvent(eventId, tokenParam).then((e) => { if (!cancelled) setRemoteEvent(e ?? null); });
    return () => { cancelled = true; };
  }, [eventId, localEvent, tokenParam]);
  const event = localEvent ?? (remoteEvent || undefined);
  const tokenOk = !!localEvent || (event?.shareToken ? event.shareToken === tokenParam : false);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState<"pdf" | "word" | null>(null);

  useEffect(() => {
    if (!event || !tokenOk || typeof window === "undefined") return;
    let cancelled = false;
    const origin = window.location.origin;
    const expected = event.guests.filter((g) => g.status !== "no");
    // The token is server-managed and can be absent from a cached copy: resolve
    // it authoritatively, otherwise every card here would be un-scannable.
    resolveDoorToken(event, eventId)
      .then((token) =>
        Promise.all(
          expected.map(async (g) => {
            const url = `${origin}/checkin/${eventId}?g=${g.id}&t=${encodeURIComponent(token)}`;
            const data = await QRCode.toDataURL(url, { width: 240, margin: 1 });
            return [g.id, data] as const;
          }),
        ),
      )
      .then((pairs) => {
        if (!cancelled) setQrs(Object.fromEntries(pairs));
      })
      .catch((err) => {
        if (!cancelled) toast(toUserMessage(err, "Could not build guest cards."));
      });
    return () => {
      cancelled = true;
    };
  }, [event, eventId, tokenOk]);

  if (!event) {
    if (!localEvent && remoteEvent === undefined) return <div className="p-8 text-sm text-muted-foreground">Loading guest cards…</div>;
    return <div className="p-8">Event not found.</div>;
  }
  if (!tokenOk) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        These guest cards need an access code. Ask the event host to re-share the link from their dashboard.
      </div>
    );
  }


  const handleExport = async (type: "pdf" | "word") => {
    setExporting(type);
    try {
      if (type === "pdf") await exportGuestQrCardsPdf(event, eventId);
      else await exportGuestQrCardsWord(event, eventId);
    } catch (error) {
      console.error(error);
      toast("Export failed. Please try again.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="min-h-screen bg-white p-6 print:p-0">
      <style>{`
        @media print {
          @page { margin: 0.5in; }
          .no-print { display: none !important; }
          .card { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      <div className="no-print mx-auto mb-6 flex max-w-4xl items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl">QR cards · {event.title}</h1>
          <p className="text-xs text-muted-foreground">
            Print these and hand them out at the door — each guest scans to check in.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={exporting !== null}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {exporting === "pdf" ? "Exporting…" : "Export PDF"}
          </button>
          <button
            type="button"
            onClick={() => handleExport("word")}
            disabled={exporting !== null}
            className="rounded-full bg-secondary px-4 py-2 text-sm font-medium text-ink hover:bg-ink/10 disabled:opacity-50"
          >
            {exporting === "word" ? "Exporting…" : "Export Word"}
          </button>
        </div>
      </div>
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3">
        {event.guests
          .filter((g) => g.status !== "no")
          .map((g) => (
            <div key={g.id} className="card flex flex-col items-center rounded-2xl border border-gray-200 p-4 text-center">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">{event.title}</div>
              <div className="mt-1 font-serif text-base">{g.name}</div>
              {qrs[g.id] && <img src={qrs[g.id]} alt={`QR for ${g.name}`} className="my-3 h-32 w-32" />}
              <div className="text-[10px] text-gray-500">Scan to check in</div>
            </div>
          ))}
      </div>
    </div>
  );
}

