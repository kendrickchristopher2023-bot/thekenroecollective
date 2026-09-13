/**
 * Selections drawer — the branded "cart" for The Kenroe Collective.
 *
 * Uses the Sheet component from shadcn/ui. Persists items server-side via
 * cart.functions.ts, only mounts for signed-in users. Click "Review & pay"
 * to navigate to /cart-checkout which mounts embedded Stripe checkout.
 */
import { toUserMessage } from "@/lib/user-error";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ShoppingBag, Trash2, Minus, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { useAuthReady } from "@/hooks/use-auth-ready";
import { getStripeEnvironment } from "@/lib/stripe";
import {
  getCart,
  removeCartItem,
  updateCartItemQuantity,
  clearCart,
  type CartSnapshot,
} from "@/lib/cart.functions";
import { formatMoney } from "@/lib/cart-catalog";

// Fired by "Add to Selections" buttons across the app to nudge the drawer
// to refresh + optionally open.
const REFRESH_EVENT = "kenroe:selections-refresh";
const OPEN_EVENT = "kenroe:selections-open";

export function emitSelectionsChanged(open: boolean = false) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
  if (open) window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function SelectionsDrawer() {
  const { user } = useAuthReady();
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<CartSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const navigate = useNavigate();

  async function refresh() {
    if (!user) return;
    try {
      const s = await getCart({ data: { environment: getStripeEnvironment() } });
      setSnap(s);
    } catch (e) {
      // silent — the drawer just shows empty state
    }
  }

  useEffect(() => {
    if (!user) {
      setSnap(null);
      return;
    }
    refresh();
    function onRefresh() { refresh(); }
    function onOpen() { setOpen(true); refresh(); }
    window.addEventListener(REFRESH_EVENT, onRefresh);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(REFRESH_EVENT, onRefresh);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user) return null;

  const count = snap?.items.reduce((n, it) => n + it.quantity, 0) ?? 0;

  async function handleRemove(itemId: string) {
    setLoading(true);
    setRemovingId(itemId);
    try {
      const s = await removeCartItem({ data: { itemId, environment: getStripeEnvironment() } });
      setSnap(s);
      setConfirmId((c) => (c === itemId ? null : c));
    } catch (e) {
      toast.error(toUserMessage(e, "Could not remove item."));
    } finally {
      setLoading(false);
      setRemovingId(null);
    }
  }

  function requestRemove(itemId: string, needsConfirm: boolean) {
    if (!needsConfirm || confirmId === itemId) {
      handleRemove(itemId);
      return;
    }
    setConfirmId(itemId);
    setTimeout(() => {
      setConfirmId((c) => (c === itemId ? null : c));
    }, 3000);
  }

  async function handleQuantity(itemId: string, quantity: number) {
    if (quantity < 1) return;
    setLoading(true);
    try {
      const s = await updateCartItemQuantity({
        data: { itemId, quantity, environment: getStripeEnvironment() },
      });
      setSnap(s);
    } catch (e) {
      toast.error(toUserMessage(e, "Could not update quantity."));
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    setLoading(true);
    try {
      const s = await clearCart({ data: { environment: getStripeEnvironment() } });
      setSnap(s);
    } finally {
      setLoading(false);
    }
  }

  function handleCheckout() {
    setOpen(false);
    navigate({ to: "/cart-checkout" });
  }

  const items = snap?.items ?? [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={`Open Selections (${count} item${count === 1 ? "" : "s"})`}
          className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-ink/10 bg-paper text-ink/70 transition-colors hover:bg-secondary hover:text-ink"
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-velvet px-1 text-[10px] font-semibold text-white">
              {count}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="border-b border-ink/5 pb-4">
          <SheetTitle className="text-xl">Your Selections</SheetTitle>
          <SheetDescription>
            Bundle add-ons and check out in one payment. Plans are purchased separately from the pricing page.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {items.length === 0 ? (
            <div className="mx-auto max-w-xs pt-12 text-center">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-secondary text-ink/40">
                <ShoppingBag className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-ink">Nothing selected yet</p>
              <p className="mt-1 text-xs text-ink/60">
                Add-ons you save from an event's add-ons panel land here so you can review and pay for them together.
              </p>
            </div>
          ) : (
            <ul className="space-y-3 px-1">
              {items.map((it) => {
                const entry = it.catalog;
                const name = entry?.name ?? it.sku;
                const unit = it.unit_amount_cents ?? entry?.unitAmountCents ?? 0;
                const canQuantity = !!entry?.allowQuantity;
                const scope = it.event_id
                  ? "For this event"
                  : it.project_id
                    ? "For a project"
                    : "Account unlock";
                return (
                  <li key={it.id} className="rounded-xl border border-ink/5 bg-paper p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{name}</p>
                      <p className="text-[11px] uppercase tracking-wider text-ink/40">{scope}</p>
                      {entry?.blurb ? (
                        <p className="mt-1 line-clamp-2 text-xs text-ink/60">{entry.blurb}</p>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      {canQuantity ? (
                        <div className="inline-flex items-center gap-1 rounded-full border border-ink/10 p-0.5">
                          <button
                            type="button"
                            onClick={() => handleQuantity(it.id, it.quantity - 1)}
                            disabled={loading || it.quantity <= 1}
                            aria-label="Decrease quantity"
                            className="grid h-7 w-7 place-items-center rounded-full text-ink/60 hover:bg-secondary disabled:opacity-30"
                          >
                            <Minus className="h-3 w-3" aria-hidden="true" />
                          </button>
                          <span className="min-w-6 text-center text-sm font-medium text-ink">{it.quantity}</span>
                          <button
                            type="button"
                            onClick={() => handleQuantity(it.id, it.quantity + 1)}
                            disabled={loading || (entry?.maxQuantity != null && it.quantity >= entry.maxQuantity)}
                            aria-label="Increase quantity"
                            className="grid h-7 w-7 place-items-center rounded-full text-ink/60 hover:bg-secondary disabled:opacity-30"
                          >
                            <Plus className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-ink/40">Qty 1</span>
                      )}
                      <span className="text-sm font-semibold text-ink">
                        {formatMoney(unit * it.quantity, it.currency)}
                      </span>
                    </div>
                    <div className="mt-3 flex justify-end">
                      {(() => {
                        const lineTotal = unit * it.quantity;
                        const needsConfirm = it.quantity > 1 || lineTotal >= 5000;
                        const isConfirming = confirmId === it.id;
                        const isRemoving = removingId === it.id;
                        return (
                          <button
                            type="button"
                            onClick={() => requestRemove(it.id, needsConfirm)}
                            disabled={loading}
                            aria-label={`Remove ${name}`}
                            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors disabled:opacity-40 ${
                              isConfirming
                                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                : "bg-destructive/5 text-destructive hover:bg-destructive/10"
                            }`}
                          >
                            {isRemoving ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            )}
                            <span>{isConfirming ? "Tap again to remove" : "Remove"}</span>
                          </button>
                        );
                      })()}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <SheetFooter className="border-t border-ink/5 pt-4">
            <div className="w-full space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink/60">Subtotal</span>
                <span className="text-lg font-semibold text-ink">
                  {formatMoney(snap?.subtotal_cents ?? 0)}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={loading}
                  className="rounded-full border border-ink/15 px-4 py-2 text-xs font-medium text-ink/70 hover:bg-secondary disabled:opacity-40"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={loading}
                  className="flex-1 rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                >
                  Review & pay
                </button>
              </div>
              <p className="text-[11px] text-ink/40">
                Taxes calculated at checkout.
              </p>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
