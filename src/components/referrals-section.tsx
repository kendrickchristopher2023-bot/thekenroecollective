import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Gift, Mail, Share2 } from "lucide-react";
import {
  getOrCreateMyReferralCode,
  getMyReferralStats,
} from "@/lib/referrals.functions";

export function ReferralsSection() {
  const getCode = useServerFn(getOrCreateMyReferralCode);
  const getStats = useServerFn(getMyReferralStats);
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; pending: number; credited: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, s] = await Promise.all([getCode(), getStats()]);
        if (!alive) return;
        setCode(c.code);
        setStats({ total: s.total, pending: s.pending, credited: s.credited });
      } catch (e: any) {
        toast.error(e?.message ?? "Couldn't load referrals.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [getCode, getStats]);

  const shareUrl = code
    ? `${typeof window !== "undefined" ? window.location.origin : "https://thekenroecollective.com"}/pricing?ref=${encodeURIComponent(code)}`
    : "";

  const copy = async (val: string, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(val);
      toast.success(label);
    } catch {
      toast.error("Couldn't copy — long-press to copy manually.");
    }
  };

  const shareNative = async () => {
    if (!shareUrl) return;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: "The Kenroe Collective",
          text: "I've been using The Kenroe Collective to host beautifully. Here's 20% off your first month:",
          url: shareUrl,
        });
        return;
      } catch {
        // user cancelled — fall through to copy
      }
    }
    copy(shareUrl, "Link copied");
  };

  const mailto = `mailto:?subject=${encodeURIComponent("A little something from me")}&body=${encodeURIComponent(
    `I've been using The Kenroe Collective to host our gatherings and thought you'd love it. Here's 20% off your first month:\n\n${shareUrl}\n\n— sent from The Kenroe Collective`,
  )}`;

  const sms = `sms:?body=${encodeURIComponent(`20% off The Kenroe Collective for you: ${shareUrl}`)}`;

  if (loading) {
    return (
      <div className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">
        <div className="h-6 w-40 animate-pulse rounded bg-ink/5" />
        <div className="mt-3 h-24 animate-pulse rounded bg-ink/5" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-velvet/5 via-transparent to-gold/5 p-6 ring-1 ring-ink/5">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-velvet text-paper">
          <Gift className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="font-serif text-2xl">Refer a friend</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Share your code — friends get <strong>20% off</strong> their first month. When they subscribe, you get
            <strong> one free month</strong> credited to your plan.
          </p>
        </div>
      </div>

      {code && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl bg-background/60 p-3 ring-1 ring-ink/10">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Your code</span>
            <code className="flex-1 font-mono text-lg font-semibold text-ink">{code}</code>
            <button
              type="button"
              onClick={() => copy(code, "Code copied")}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-background px-3 py-2 text-xs font-medium hover:border-ink/30"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy code
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-background/60 p-3 ring-1 ring-ink/10">
            <span className="text-xs uppercase tracking-wider text-muted-foreground shrink-0">Share link</span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink/80">{shareUrl}</span>
            <button
              type="button"
              onClick={() => copy(shareUrl, "Link copied")}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-background px-3 py-2 text-xs font-medium hover:border-ink/30"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy link
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={shareNative}
              className="inline-flex items-center gap-1.5 rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
            <a
              href={mailto}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-background px-4 py-2 text-sm font-medium text-ink/80 hover:border-ink/30"
            >
              <Mail className="h-4 w-4" />
              Email a friend
            </a>
            <a
              href={sms}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-background px-4 py-2 text-sm font-medium text-ink/80 hover:border-ink/30"
            >
              Text a friend
            </a>
          </div>
        </>
      )}

      {stats && (
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat label="Redemptions" value={stats.total} />
          <Stat label="Rewards pending" value={stats.pending} />
          <Stat label="Free months earned" value={stats.credited} />
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Rewards are credited automatically after your friend's first successful payment. Self-referrals and duplicate
        accounts don't qualify.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-background/60 p-3 text-center ring-1 ring-ink/10">
      <div className="font-serif text-2xl text-ink">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}
