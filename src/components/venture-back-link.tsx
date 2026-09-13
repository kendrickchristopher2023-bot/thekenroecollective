import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

/**
 * Clearly worded back control for venture interiors. Words, not just an arrow,
 * and a 44px minimum target so it is easy to hit on a phone. It inherits the
 * venture accent from the surrounding .venture-* scope.
 */
export function VentureBackLink({
  to,
  label,
  className = "",
}: {
  to: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      to={to as never}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border border-ink/15 bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-velvet/50 hover:text-velvet ${className}`}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
