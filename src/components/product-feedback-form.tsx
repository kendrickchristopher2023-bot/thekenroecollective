// Feedback form for paying customers. Used by the gentle reminder card and
// available on its own if you want to drop it on a settings page later.
import { toUserMessage } from "@/lib/user-error";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { submitProductFeedback } from "@/lib/product-feedback.functions";

export function ProductFeedbackForm({
  suggestedName,
  onDone,
  onCancel,
}: {
  suggestedName?: string;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const submit = useServerFn(submitProductFeedback);
  const [nps, setNps] = useState<number | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [allowPublic, setAllowPublic] = useState(false);
  const [publicName, setPublicName] = useState(suggestedName ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (suggestedName && !publicName) setPublicName(suggestedName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedName]);

  const canSend = nps !== null && rating > 0 && !saving;

  async function send() {
    if (nps === null || rating < 1) {
      toast.error("Please pick a score and a star rating.");
      return;
    }
    setSaving(true);
    try {
      await submit({
        data: {
          nps,
          rating,
          comment: comment.trim() || null,
          allowPublic,
          publicName: allowPublic ? publicName.trim() || null : null,
        },
      });
      toast.success("Thank you, your feedback is in.");
      onDone?.();
    } catch (e: unknown) {
      toast.error(toUserMessage(e, "We could not save that. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-lg font-medium text-foreground">
          How likely are you to recommend The Kenroe Collective?
        </legend>
        <p className="mt-1 text-base text-muted-foreground">0 is not likely, 10 is very likely.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNps(n)}
              aria-pressed={nps === n}
              aria-label={`Score ${n} out of 10`}
              className={`h-11 w-11 rounded-xl border text-base font-medium transition-colors ${
                nps === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-secondary"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-lg font-medium text-foreground">
          How would you rate us overall?
        </legend>
        <div className="mt-3 flex gap-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setRating(s)}
              aria-pressed={rating === s}
              aria-label={`${s} star${s === 1 ? "" : "s"}`}
              className="rounded-lg p-1 hover:bg-secondary"
            >
              <Star
                className={`h-9 w-9 ${
                  s <= rating ? "fill-primary text-primary" : "text-muted-foreground"
                }`}
              />
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="pf-comment" className="text-lg font-medium text-foreground">
          Anything you would like to tell us? (optional)
        </label>
        <textarea
          id="pf-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="What is working well, and what could be better?"
          className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-base text-foreground"
        />
      </div>

      <div className="rounded-xl border border-border bg-secondary/40 p-3">
        <label htmlFor="pf-public" className="flex items-start gap-3 text-base text-foreground">
          <input
            id="pf-public"
            type="checkbox"
            checked={allowPublic}
            onChange={(e) => setAllowPublic(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-primary"
          />
          <span>You can show this as a public testimonial</span>
        </label>
        {allowPublic && (
          <div className="mt-3">
            <label htmlFor="pf-public-name" className="text-base text-foreground">
              Name to show publicly
            </label>
            <input
              id="pf-public-name"
              value={publicName}
              onChange={(e) => setPublicName(e.target.value)}
              maxLength={80}
              className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-base text-foreground"
            />
            <p className="mt-1 text-sm text-muted-foreground">
              We only show what you type here. Nothing is published until we review it.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className="rounded-xl bg-primary px-5 py-3 text-base font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Sending..." : "Send feedback"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-border px-5 py-3 text-base text-foreground"
          >
            Not now
          </button>
        )}
      </div>
    </div>
  );
}
