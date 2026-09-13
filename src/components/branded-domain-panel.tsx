import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { KEvent } from "@/lib/events-store";
import { isSlugAvailable, normalizeSlug, updateEvent } from "@/lib/events-store";
import { checkBrandedSlug } from "@/lib/events-sync.functions";
import { toast } from "sonner";

type Status = "idle" | "checking" | "ok" | "taken" | "invalid";

export function BrandedDomainPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const [slug, setSlug] = useState(event.brandedSlug || "");
  const [status, setStatus] = useState<Status>("idle");
  const seq = useRef(0);

  // Availability is checked on the server across EVERY host's events, not just
  // this device's local cache, so two accounts can never both claim /e/slug.
  useEffect(() => {
    if (!slug) return setStatus("idle");
    const cleaned = normalizeSlug(slug);
    if (cleaned.length < 3) return setStatus("invalid");
    if (cleaned === (event.brandedSlug || "")) return setStatus("ok");
    if (!isSlugAvailable(cleaned, eventId)) return setStatus("taken");

    const mine = ++seq.current;
    setStatus("checking");
    const t = setTimeout(async () => {
      try {
        const r = await checkBrandedSlug({ data: { slug: cleaned, eventId } });
        if (seq.current !== mine) return;
        setStatus(r.available ? "ok" : "taken");
      } catch {
        // Offline or signed out: fall back to the local check and let the
        // server-side save be the final word.
        if (seq.current === mine) setStatus("ok");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [slug, eventId, event.brandedSlug]);

  async function save() {
    const cleaned = normalizeSlug(slug);
    if (cleaned.length < 3) {
      toast.error("Slug needs to be at least 3 characters");
      return;
    }
    if (cleaned !== (event.brandedSlug || "")) {
      try {
        const r = await checkBrandedSlug({ data: { slug: cleaned, eventId } });
        if (!r.available) {
          setStatus("taken");
          toast.error("That link is already taken by another event");
          return;
        }
      } catch {
        // Let the save proceed; the server rejects duplicates on write.
      }
    }
    updateEvent(eventId, { brandedSlug: cleaned });
    setSlug(cleaned);
    toast.success("Branded URL saved");
  }

  function clear() {
    updateEvent(eventId, { brandedSlug: undefined });
    setSlug("");
    toast.success("Branded URL removed");
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://thekenroecollective.com";
  const vanityPath = event.brandedSlug ? `${origin}/e/${event.brandedSlug}` : null;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-velvet/15 bg-velvet/5 p-4 text-sm text-ink/80">
        💡 Pick a short word or phrase that becomes your event's vanity link. Send "maya-and-jordan" instead of a random ID.
      </div>

      <section className="rounded-2xl bg-card p-5 ring-1 ring-ink/5 space-y-3">
        <label className="text-sm font-medium">Your branded slug</label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">thekenroecollective.com/e/</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="maya-and-jordan"
            className="flex-1 rounded border border-ink/10 px-3 py-2 text-sm"
          />
        </div>
        <div className="text-xs">
          {status === "checking" && <span className="text-muted-foreground">Checking availability…</span>}
          {status === "ok" && <span className="text-emerald-600">✓ Available</span>}
          {status === "taken" && <span className="text-rose-600">Already taken by another event</span>}
          {status === "invalid" && <span className="text-muted-foreground">Must be at least 3 characters; letters, numbers, and dashes only</span>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={status !== "ok"}
            className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
          >
            Save branded URL
          </button>
          {event.brandedSlug && (
            <button onClick={clear} className="rounded-full bg-secondary px-4 py-2 text-xs font-medium">
              Remove
            </button>
          )}
        </div>
      </section>

      {vanityPath && (
        <section className="rounded-2xl bg-card p-5 ring-1 ring-ink/5 space-y-3">
          <h3 className="font-serif text-lg">Your vanity link</h3>
          <div className="text-sm">
            <div className="text-xs font-medium text-muted-foreground">Live now</div>
            <Link to="/e/$slug" params={{ slug: event.brandedSlug || "" }} className="text-velvet underline underline-offset-4 break-all">{vanityPath}</Link>
            <p className="mt-1 text-xs text-muted-foreground">
              Share this anywhere, it forwards guests straight to your invite. Your link is reserved for this event, so no
              other host can claim it.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
