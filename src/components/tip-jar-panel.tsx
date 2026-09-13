import { toast } from "sonner";
import {
  addTipRecipient,
  getTipJar,
  removeTipRecipient,
  setTipJar,
  updateTipRecipient,
  type KEvent,
  type TipRecipient,
} from "@/lib/events-store";
import { confirmDialog } from "@/lib/confirm-dialog";

export function TipJarPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const jar = getTipJar(event);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl">Tip & Donation Jar</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Let guests tip the hosts, DJ, photographer, or anyone you choose — directly through their Venmo,
              Cash App, Zelle, PayPal, Apple Pay or Google Pay. No money flows through The Kenroe Collective; guests tap a
              button and their payment app opens with the handle pre-filled.
            </p>
          </div>
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={jar.enabled}
              onChange={(e) => setTipJar(eventId, { enabled: e.target.checked })}
              className="size-4 accent-velvet"
            />
            <span>Enabled</span>
          </label>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Section title">
            <input
              value={jar.title ?? ""}
              onChange={(e) => setTipJar(eventId, { title: e.target.value })}
              placeholder="Leave a tip"
              className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
            />
          </Field>
          <Field label="Suggested amounts (comma separated)">
            <input
              value={(jar.presetAmounts ?? []).join(", ")}
              onChange={(e) =>
                setTipJar(eventId, {
                  presetAmounts: e.target.value
                    .split(",")
                    .map((s) => Number(s.trim()))
                    .filter((n) => Number.isFinite(n) && n > 0),
                })
              }
              placeholder="10, 20, 50, 100"
              className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
            />
          </Field>
          <Field label="Message to guests" className="sm:col-span-2">
            <textarea
              rows={2}
              value={jar.message ?? ""}
              onChange={(e) => setTipJar(eventId, { message: e.target.value })}
              placeholder="If you'd like to leave a little extra love…"
              className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
            />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl">Recipients</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Add as many people as you'd like — guests can choose who to tip and how to send it.
            </p>
          </div>
          <button
            onClick={() => {
              addTipRecipient(eventId, { name: "" });
              toast.success("Recipient added");
            }}
            className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white hover:opacity-90"
          >
            + Add recipient
          </button>
        </div>

        {jar.recipients.length === 0 ? (
          <p className="mt-4 rounded-lg bg-secondary/60 p-4 text-sm text-muted-foreground">
            No recipients yet. Add yourself, your co-host, or any vendor you'd like guests to be able to tip.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {jar.recipients.map((r) => (
              <RecipientCard key={r.id} eventId={eventId} recipient={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RecipientCard({ eventId, recipient }: { eventId: string; recipient: TipRecipient }) {
  const set = (patch: Partial<TipRecipient>) => updateTipRecipient(eventId, recipient.id, patch);
  return (
    <div className="rounded-xl border border-ink/10 bg-paper p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input
            value={recipient.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. The Bride"
            className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
          />
        </Field>
        <Field label="Role (optional)">
          <input
            value={recipient.role ?? ""}
            onChange={(e) => set({ role: e.target.value })}
            placeholder="DJ, photographer, host…"
            className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
          />
        </Field>
        <Field label="Venmo username" hint="Without the @">
          <input
            value={recipient.venmo ?? ""}
            onChange={(e) => set({ venmo: e.target.value.replace(/^@/, "") })}
            placeholder="kenroe"
            className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
          />
        </Field>
        <Field label="Cash App $cashtag" hint="Without the $">
          <input
            value={recipient.cashapp ?? ""}
            onChange={(e) => set({ cashapp: e.target.value.replace(/^\$/, "") })}
            placeholder="kenroe"
            className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
          />
        </Field>
        <Field label="Zelle (email or phone)">
          <input
            value={recipient.zelle ?? ""}
            onChange={(e) => set({ zelle: e.target.value })}
            placeholder="you@email.com or +15551234567"
            className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
          />
        </Field>
        <Field label="PayPal.me username">
          <input
            value={recipient.paypal ?? ""}
            onChange={(e) => set({ paypal: e.target.value.replace(/^@/, "") })}
            placeholder="kenroe"
            className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
          />
        </Field>
        <Field label="Apple Pay (phone or email)" hint="Sent via Messages">
          <input
            value={recipient.applePay ?? ""}
            onChange={(e) => set({ applePay: e.target.value })}
            placeholder="+15551234567"
            className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
          />
        </Field>
        <Field label="Google Pay (phone or email)">
          <input
            value={recipient.googlePay ?? ""}
            onChange={(e) => set({ googlePay: e.target.value })}
            placeholder="you@email.com"
            className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
          />
        </Field>
        <Field label="Custom label" className="sm:col-span-1">
          <input
            value={recipient.customLabel ?? ""}
            onChange={(e) => set({ customLabel: e.target.value })}
            placeholder="e.g. Honeyfund"
            className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
          />
        </Field>
        <Field label="Custom link">
          <input
            value={recipient.customUrl ?? ""}
            onChange={(e) => set({ customUrl: e.target.value })}
            placeholder="https://…"
            className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
          />
        </Field>
        <Field label="Note for guests (optional)" className="sm:col-span-2">
          <input
            value={recipient.note ?? ""}
            onChange={(e) => set({ note: e.target.value })}
            placeholder="Thanks for celebrating with us!"
            className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
          />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          onClick={async () => {
            if (await confirmDialog({ title: `Remove ${recipient.name || "this recipient"}?` })) {
              removeTipRecipient(eventId, recipient.id);
            }
          }}
          className="rounded-full bg-secondary px-3 py-1 text-xs hover:bg-secondary/70"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {hint ? <span className="ml-2 normal-case tracking-normal text-muted-foreground/70">— {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
