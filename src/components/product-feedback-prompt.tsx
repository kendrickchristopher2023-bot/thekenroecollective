// The gentle feedback reminder. It only appears for a paying customer who has
// been with us a few days and has already created an event or an eCard. The
// three choices are stored in the database, so they are respected on every
// device. After a customer submits, or picks "Don't ask again", it never
// returns.
import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquareHeart, X } from "lucide-react";
import { toast } from "sonner";
import { getFeedbackPromptState, setFeedbackPromptChoice } from "@/lib/product-feedback.functions";
import { ProductFeedbackForm } from "@/components/product-feedback-form";

const HIDDEN_PREFIXES = [
  "/auth",
  "/signup",
  "/reset-password",
  "/checkout",
  "/cart-checkout",
  "/invite",
  "/gift",
  "/wall",
  "/checkin",
  "/wishes",
  "/claim",
  "/rfq-bid",
  "/e/",
  "/p/",
  "/d/",
  "/c/",
  "/r/",
  "/s/",
  "/ec/",
];

export function ProductFeedbackPrompt() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const load = useServerFn(getFeedbackPromptState);
  const choose = useServerFn(setFeedbackPromptChoice);

  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const hidden = HIDDEN_PREFIXES.some((p) => path === p || path.startsWith(p));

  useEffect(() => {
    if (hidden) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        // Only ask the server when the visitor is actually signed in. Calling
        // the protected function without a session throws "Unauthorized", which
        // surfaces as a runtime error in the browser.
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.auth.getSession();
        if (!active || !data.session) return;
        const state = await load({ data: {} });
        if (!active) return;
        setName(state.suggestedName || "");
        setShow(state.shouldShow);
      } catch {
        // No session yet, or the check failed. Stay quiet.
      }
    }, 2500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);


  async function pick(choice: "later" | "never") {
    setShow(false);
    setOpen(false);
    try {
      await choose({ data: { choice } });
      toast.success(
        choice === "later"
          ? "No problem, we will check back in a couple of weeks."
          : "Understood, we will not ask again.",
      );
    } catch {
      toast.error("We could not save that choice. Please try again later.");
    }
  }

  if (hidden || !show) return null;

  if (open) {
    return (
      <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pf-dialog-title"
          className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-xl"
        >
          <div className="flex items-start justify-between gap-4">
            <h2 id="pf-dialog-title" className="font-serif text-2xl text-foreground">
              Tell us how we are doing
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-lg p-2 text-muted-foreground hover:bg-secondary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-2 text-base text-muted-foreground">
            A couple of quick questions, and a comment if you feel like it. It helps us more than
            you would think.
          </p>
          <div className="mt-6">
            <ProductFeedbackForm
              suggestedName={name}
              onDone={() => {
                setOpen(false);
                setShow(false);
              }}
              onCancel={() => setOpen(false)}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[110] sm:bottom-6 sm:left-auto sm:right-6 sm:w-[24rem]">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <MessageSquareHeart className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
          <div>
            <p className="text-lg font-medium text-foreground">How are we doing?</p>
            <p className="mt-1 text-base text-muted-foreground">
              You have been using Kenroe for a little while now. Would you share a quick rating?
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-xl bg-primary px-4 py-2.5 text-base font-medium text-primary-foreground"
          >
            Leave feedback
          </button>
          <button
            type="button"
            onClick={() => pick("later")}
            className="rounded-xl border border-border px-4 py-2.5 text-base text-foreground"
          >
            Remind me later
          </button>
          <button
            type="button"
            onClick={() => pick("never")}
            className="rounded-xl px-4 py-2.5 text-base text-muted-foreground underline"
          >
            Don't ask again
          </button>
        </div>
      </div>
    </div>
  );
}
