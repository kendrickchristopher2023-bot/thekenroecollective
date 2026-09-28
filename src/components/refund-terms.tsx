// The money wording, read from the database every time it is shown, so a change
// in the owner console appears here at once. Used at the point of purchase (with
// a tick box) and on the policy page (as plain reading).
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getRefundCopy, type RefundCopy } from "@/lib/refund-copy.functions";

export function useRefundCopy() {
  const read = useServerFn(getRefundCopy);
  const [copy, setCopy] = useState<RefundCopy | null>(null);
  useEffect(() => {
    let live = true;
    read()
      .then((c) => { if (live) setCopy(c as RefundCopy); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return copy;
}

export function RefundTerms({
  copy,
  acknowledged,
  onAcknowledge,
}: {
  copy: RefundCopy | null;
  acknowledged?: boolean;
  onAcknowledge?: (next: boolean) => void;
}) {
  if (!copy) return <p className="text-xs text-ink/45">Loading the refund terms…</p>;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">{copy.headline}</p>
      <ul className="mt-2 space-y-1.5 text-[13px] text-ink/75">
        {copy.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      {copy.footnote ? <p className="mt-2 text-xs text-ink/45">{copy.footnote}</p> : null}
      {onAcknowledge ? (
        <label className="mt-3 flex items-start gap-2 text-[13px] text-ink/75">
          <input
            type="checkbox"
            checked={acknowledged === true}
            onChange={(e) => onAcknowledge(e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span>I have read the refund terms above and I understand what is and is not refundable.</span>
        </label>
      ) : null}
    </div>
  );
}
