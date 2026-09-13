import { Link } from "@tanstack/react-router";
import logo from "@/assets/kenroes-logo.png";
import { useDraggable } from "@/lib/use-draggable";
import { GripVertical } from "lucide-react";

/**
 * Watermark shown on public/shared pages for Free Trial and Postcard-tier hosts.
 * Removed automatically when:
 *  - the event has the `branding_removal` add-on, OR
 *  - the owner is on a paid Whisper/Host/Atelier subscription.
 * Renders a faint diagonal repeating monogram + wordmark behind content AND a
 * draggable footer pill (position persisted in localStorage).
 */
export function KenroesWatermark({ show }: { show: boolean }) {
  const { ref, style, handleProps } = useDraggable("kenroe-watermark-pill", () => ({
    x: typeof window !== "undefined" ? Math.max(16, window.innerWidth - 340) : 16,
    // On phone widths the bottom band already holds the cookie notice, the
    // guest/owner preview toggle and the concierge bubble, so seat the pill
    // higher by default instead of stacking it on top of them.
    y:
      typeof window !== "undefined"
        ? Math.max(16, window.innerHeight - (window.innerWidth < 640 ? 260 : 72))
        : 16,
  }));

  if (!show) return null;

  return (
    <>
      {/* Faint diagonal monogram + wordmark behind content */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[45] overflow-hidden opacity-[0.14] select-none mix-blend-multiply"
      >
        <div
          className="absolute inset-0 flex flex-wrap content-around items-center justify-around gap-x-8 gap-y-8 sm:gap-x-14 sm:gap-y-10"
          style={{ transform: "rotate(-24deg) scale(1.4)", transformOrigin: "center" }}
        >
          {Array.from({ length: 48 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1 whitespace-nowrap">
              <img src={logo} alt="" className="h-9 w-auto sm:h-12 2xl:h-14" />
              <span className="font-serif text-[10px] italic tracking-[0.2em] text-velvet">
                The Kenroe Collective
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Draggable prestige pill */}
      <div
        ref={ref}
        style={style}
        className="z-50 group"
      >
        <div className="relative">
          {/* Soft gilded glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-[2px] rounded-full opacity-70 blur-sm transition group-hover:opacity-100"
            style={{
              background:
                "linear-gradient(135deg, rgba(212,175,55,0.55), rgba(92,29,29,0.35) 45%, rgba(212,175,55,0.55))",
            }}
          />
          <div className="relative flex max-w-[calc(100vw-2rem)] items-center rounded-full border border-[#d4af37]/40 bg-velvet/95 pl-1.5 pr-3 py-1.5 text-white shadow-[0_10px_30px_-10px_rgba(92,29,29,0.6)] backdrop-blur-sm">
            {/* Drag handle (span, not button — hook ignores buttons) */}
            <span
              role="button"
              tabIndex={0}
              aria-label="Drag to reposition"
              {...handleProps}
              className="mr-1.5 grid h-6 w-5 place-items-center rounded-full text-white/60 hover:text-white select-none"
              style={{ ...handleProps.style }}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>


            <Link
              to="/pricing"
              className="flex items-center gap-2 text-xs font-medium tracking-wide sm:text-sm"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-white/20">
                <img src={logo} alt="" className="h-4 w-auto brightness-0 invert" />
              </span>
              <span className="hidden sm:inline">
                Made with{" "}
                <span className="font-serif italic text-[#e9c46a]">The Kenroe Collective</span>
              </span>
              <span className="sm:hidden font-serif italic text-[#e9c46a]">Kenroe</span>
              <span aria-hidden className="ml-0.5 text-[#e9c46a] transition group-hover:translate-x-0.5">↗</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
