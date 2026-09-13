// Friendly gate for reached-limit scenarios. Shows what was used, the cap,
// and a one-click upgrade CTA. Prefer this over raw error toasts wherever a
// cap (AI generations, reminders, guest count, etc.) can be hit.
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type UpgradeTarget = "whisper" | "host" | "atelier" | "atelier-ai";

const TARGET_COPY: Record<UpgradeTarget, { label: string; blurb: string; href: string }> = {
  whisper: {
    label: "Whisper",
    blurb: "Unlock branded emails, RSVP tracking, and Spanish invites.",
    href: "/pricing?category=events&billing=monthly#whisper",
  },
  host: {
    label: "Host",
    blurb: "750 guests per event, 10 active events, gift registry, analytics, no watermark.",
    href: "/pricing?category=events&billing=monthly#host",
  },
  atelier: {
    label: "Atelier",
    blurb: "Unlimited guests, seating, run-of-show, AI studio.",
    href: "/pricing?category=events&billing=monthly#atelier",
  },
  "atelier-ai": {
    label: "Atelier (unlimited AI)",
    blurb: "Your single-event Atelier pass has a 150-generation fair-use cap. Subscribe to Atelier for unlimited AI runs.",
    href: "/pricing?category=events&billing=monthly#atelier",
  },
};

export function UpgradeLimitModal({
  open,
  onOpenChange,
  title,
  used,
  cap,
  unit = "used",
  target,
  message,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  used?: number;
  cap?: number;
  unit?: string;
  target: UpgradeTarget;
  message?: string;
}) {
  const t = TARGET_COPY[target];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{title}</DialogTitle>
          <DialogDescription className="pt-2 text-sm text-muted-foreground">
            {message ?? "You've reached the limit for your current plan."}
          </DialogDescription>
        </DialogHeader>
        {typeof used === "number" && typeof cap === "number" && (
          <div className="rounded-2xl bg-secondary/50 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Usage</p>
            <p className="mt-1 font-serif text-2xl">
              {used} <span className="text-base text-muted-foreground">/ {cap} {unit}</span>
            </p>
          </div>
        )}
        <div className="rounded-2xl border border-velvet/25 bg-velvet/5 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-velvet">Upgrade to {t.label}</p>
          <p className="mt-1 text-sm text-ink">{t.blurb}</p>
          <Link
            to={t.href as any}
            onClick={() => onOpenChange(false)}
            className="mt-3 inline-flex items-center justify-center rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper"
          >
            See upgrade options →
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
