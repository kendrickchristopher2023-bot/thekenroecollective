import { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'cookie-notice-dismissed';

/**
 * Essential-cookies notice. Fixed to the bottom, but it must never trap or
 * block the page:
 *  - it reflows (stacks) on narrow screens and scrolls on short ones, so the
 *    accept/decline buttons are always reachable
 *  - it reserves space by padding the document body while visible, so page
 *    buttons are never hidden behind it
 *  - it clears the floating desktop helper buttons in the bottom right, so its
 *    own accept/decline controls are never sitting underneath them
 */
export function CookieNotice() {
  const [isVisible, setIsVisible] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dismissed: string | null = null;
    try {
      dismissed = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage blocked: show the notice, dismissal just will not persist */
    }
    if (!dismissed) setIsVisible(true);
  }, []);

  // Reserve room at the bottom of the page while the notice is on screen.
  useEffect(() => {
    if (!isVisible) return;
    const el = barRef.current;
    if (!el) return;

    const apply = () => {
      document.body.style.paddingBottom = `${el.offsetHeight}px`;
      // Floating mobile controls read this so they sit above the notice.
      document.documentElement.style.setProperty(
        '--kc-cookie-h',
        `${el.offsetHeight}px`,
      );
    };
    apply();

    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener('resize', apply);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', apply);
      document.body.style.paddingBottom = '';
      document.documentElement.style.removeProperty('--kc-cookie-h');
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      /* ignore */
    }
    document.body.style.paddingBottom = '';
    document.documentElement.style.removeProperty('--kc-cookie-h');
    setIsVisible(false);
  };

  return (
    <div
      ref={barRef}
      role="region"
      aria-label="Cookie notice"
      className="fixed left-0 right-0 z-[45] max-h-[45vh] overflow-y-auto overscroll-contain bg-ink/95 px-4 py-3 text-paper shadow-lg bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] sm:bottom-[env(safe-area-inset-bottom)] md:pr-40"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="min-w-0 text-sm leading-relaxed">
          We use essential cookies only (authentication, session management). No tracking or
          advertising cookies. See our{' '}
          <a href="/privacy" className="underline">
            privacy policy
          </a>
          .
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex min-h-11 items-center rounded-full border border-paper/40 px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-paper/10"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex min-h-11 items-center rounded-full bg-paper px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
