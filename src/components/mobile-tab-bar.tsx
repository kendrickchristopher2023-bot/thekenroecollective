import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarHeart, Sparkles, Store, Menu } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

/**
 * Persistent bottom tab bar for mobile (sm:hidden). Icons + text labels for the
 * five most-used destinations. Every tab is a 56×56+ hit area — well over the
 * 44×44 WCAG target — so novice and elderly users can hit them reliably.
 *
 * Hidden on fullscreen / guest-facing routes (wall slideshow, check-in, public
 * share pages) where a fixed bottom bar would cover content.
 */

type Item = {
  to: "/gatherings" | "/events" | "/studio" | "/vendors";
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  exact?: boolean;
};

const ITEMS: Item[] = [
  { to: "/gatherings", label: "Home", Icon: Home, exact: true },
  { to: "/events", label: "Events", Icon: CalendarHeart },
  { to: "/studio", label: "Studio", Icon: Sparkles },
  { to: "/vendors", label: "Vendors", Icon: Store },
];

const HIDDEN_PREFIXES = [
  "/wall/",
  "/checkin/",
  "/e/",
  "/p/",
  "/d/",
  "/gift/",
  "/invite/",
  "/claim/",
  "/rfq-bid/",
  "/auth",
  "/reset-password",
  "/[.mcp]",
  "/[.well-known]",
];

export function MobileTabBar({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return null;
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-paper/95 backdrop-blur-md sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-1">
        {ITEMS.map(({ to, label, Icon, exact }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              activeOptions={{ exact: !!exact }}
              activeProps={{ className: "text-velvet" }}
              inactiveProps={{ className: "text-ink/60" }}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium leading-tight transition-colors hover:text-ink"
            >
              <Icon className="h-6 w-6" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          </li>
        ))}
        <li className="flex-1">
          <button
            type="button"
            onClick={() => {
              if (onOpenMenu) onOpenMenu();
              else {
                // Fallback: dispatch a global event site-nav listens to.
                window.dispatchEvent(new CustomEvent("kenroe:open-mobile-menu"));
              }
            }}
            aria-label="Open full menu"
            className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium leading-tight text-ink/60 transition-colors hover:text-ink"
          >
            <Menu className="h-6 w-6" aria-hidden="true" />
            <span>Menu</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
