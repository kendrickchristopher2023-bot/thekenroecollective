import { useState } from "react";
import { toast } from "sonner";
import { getTipJar, type KEvent, type TipRecipient } from "@/lib/events-store";

/**
 * Tip Jar section shown on the public invitation page.
 * Renders a deep link button for each payment method a recipient has configured.
 * No money flows through the platform — the guest's payment app opens with the
 * recipient handle (and amount where supported) pre-filled.
 */
export function TipJarSection({ event }: { event: KEvent }) {
  const jar = getTipJar(event);
  if (!jar.enabled) return null;
  const recipients = jar.recipients.filter(hasAnyHandle);
  if (recipients.length === 0) return null;

  const presets = (jar.presetAmounts ?? [10, 20, 50, 100]).filter((n) => n > 0);
  const eventNote = `${event.title} tip`;

  return (
    <section className="mx-auto max-w-2xl px-6 pb-10">
      <div className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-velvet">Tip jar</p>
          <h3 className="mt-1 font-serif text-2xl">{jar.title || "Leave a tip"}</h3>
          {jar.message && (
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{jar.message}</p>
          )}
        </div>

        <div className="mt-6 space-y-5">
          {recipients.map((r) => (
            <RecipientBlock key={r.id} recipient={r} presets={presets} note={eventNote} />
          ))}
        </div>
      </div>
    </section>
  );
}

function RecipientBlock({
  recipient,
  presets,
  note,
}: {
  recipient: TipRecipient;
  presets: number[];
  note: string;
}) {
  const [amount, setAmount] = useState<number | "">(presets[0] ?? "");
  const amt = typeof amount === "number" && amount > 0 ? amount : undefined;
  const methods = buildMethods(recipient, amt, note);

  return (
    <div className="rounded-xl border border-ink/10 bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-serif text-lg">{recipient.name || "Recipient"}</p>
          {recipient.role && (
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{recipient.role}</p>
          )}
          {recipient.note && (
            <p className="mt-1 text-xs italic text-muted-foreground">"{recipient.note}"</p>
          )}
        </div>
      </div>

      {presets.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(p)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                amount === p
                  ? "bg-velvet text-white"
                  : "bg-secondary text-ink hover:bg-secondary/70"
              }`}
            >
              ${p}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <span>Custom $</span>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => {
                const v = e.target.value;
                setAmount(v === "" ? "" : Math.max(1, Number(v)));
              }}
              className="w-20 rounded-md bg-secondary px-2 py-1 text-right text-xs outline-none focus:ring-2 focus:ring-velvet/30"
            />
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {methods.map((m) => (
          <MethodButton key={m.label} method={m} />
        ))}
      </div>
    </div>
  );
}

function MethodButton({ method }: { method: TipMethod }) {
  if (method.kind === "link") {
    return (
      <a
        href={method.href}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 rounded-full bg-ink px-3 py-2 text-xs font-medium text-white transition hover:bg-velvet"
        aria-label={`Tip via ${method.label}`}
      >
        <span aria-hidden>{method.icon}</span>
        <span>{method.label}</span>
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(method.value);
          toast.success(`${method.label} copied: ${method.value}`);
        } catch {
          toast.message(`${method.label}: ${method.value}`);
        }
      }}
      className="flex items-center justify-center gap-2 rounded-full bg-secondary px-3 py-2 text-xs font-medium text-ink ring-1 ring-ink/10 transition hover:bg-secondary/70"
      aria-label={`Copy ${method.label} handle`}
    >
      <span aria-hidden>{method.icon}</span>
      <span className="truncate">{method.label}</span>
    </button>
  );
}

type TipMethod =
  | { kind: "link"; label: string; icon: string; href: string }
  | { kind: "copy"; label: string; icon: string; value: string };

function buildMethods(r: TipRecipient, amount: number | undefined, note: string): TipMethod[] {
  const methods: TipMethod[] = [];
  const noteParam = encodeURIComponent(note);

  if (r.venmo) {
    const params = new URLSearchParams({ txn: "pay", audience: "private", note });
    if (amount) params.set("amount", String(amount));
    methods.push({
      kind: "link",
      label: "Venmo",
      icon: "💸",
      href: `https://venmo.com/${encodeURIComponent(r.venmo)}?${params.toString()}`,
    });
  }
  if (r.cashapp) {
    methods.push({
      kind: "link",
      label: "Cash App",
      icon: "💵",
      href: amount
        ? `https://cash.app/$${encodeURIComponent(r.cashapp)}/${amount}`
        : `https://cash.app/$${encodeURIComponent(r.cashapp)}`,
    });
  }
  if (r.paypal) {
    methods.push({
      kind: "link",
      label: "PayPal",
      icon: "🅿️",
      href: amount
        ? `https://paypal.me/${encodeURIComponent(r.paypal)}/${amount}`
        : `https://paypal.me/${encodeURIComponent(r.paypal)}`,
    });
  }
  if (r.zelle) {
    methods.push({ kind: "copy", label: `Zelle: ${r.zelle}`, icon: "🏦", value: r.zelle });
  }
  if (r.applePay) {
    // There's no web API to invoke Apple Pay/Apple Cash directly — this opens
    // a pre-filled Messages/Mail draft to the host so the guest can send
    // Apple Cash themselves. Labeled to make that clear rather than implying
    // an in-page Apple Pay button.
    const isPhone = /^[+\d][\d\s\-().]+$/.test(r.applePay);
    methods.push({
      kind: "link",
      label: "Apple Cash (opens Messages)",
      icon: "",
      href: isPhone
        ? `sms:${r.applePay.replace(/[^+\d]/g, "")}?body=${noteParam}`
        : `mailto:${r.applePay}?subject=${noteParam}`,
    });
  }
  if (r.googlePay) {
    methods.push({
      kind: "copy",
      label: `Google Pay: ${r.googlePay}`,
      icon: "🅖",
      value: r.googlePay,
    });
  }
  if (r.customUrl) {
    methods.push({
      kind: "link",
      label: r.customLabel || "More",
      icon: "🔗",
      href: r.customUrl,
    });
  }
  return methods;
}

function hasAnyHandle(r: TipRecipient): boolean {
  return Boolean(r.venmo || r.cashapp || r.zelle || r.paypal || r.applePay || r.googlePay || r.customUrl);
}
