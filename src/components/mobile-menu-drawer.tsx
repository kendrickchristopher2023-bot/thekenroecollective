import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { MobileLinks } from "@/components/site-nav";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/use-auth-ready";
import { meIsAdmin, meIsOwner } from "@/lib/pricing.functions";
import { useDialogA11y } from "@/lib/use-dialog-a11y";

/**
 * Full-screen mobile menu, mounted once globally in __root so the bottom tab
 * bar's "Menu" button works on EVERY page. It used to live inside SiteNav, so
 * on the ~20 routes that don't render that header (including "/"), tapping
 * Menu did nothing at all. It is also fixed/overlaid now instead of inline in
 * the header, so it can't open off-screen when the page is scrolled.
 */
export function MobileMenuDrawer() {
  const [open, setOpen] = useState(false);
  const { ready: authReady, user } = useAuthReady();
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    function onOpen() { setOpen(true); }
    window.addEventListener("kenroe:open-mobile-menu", onOpen);
    return () => window.removeEventListener("kenroe:open-mobile-menu", onOpen);
  }, []);

  // Any navigation closes the sheet.
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!authReady || !user?.id) { setIsOwner(false); setIsAdmin(false); return; }
    let active = true;
    Promise.all([meIsOwner(), meIsAdmin()])
      .then(([o, a]) => { if (active) { setIsOwner(o.isOwner); setIsAdmin(a.isAdmin); } })
      .catch(() => { if (active) { setIsOwner(false); setIsAdmin(false); } });
    return () => { active = false; };
  }, [authReady, user?.id]);

  // Lock body scroll and hide the floating mobile buttons while open.
  useEffect(() => {
    const el = document.documentElement;
    if (!open) return;
    el.setAttribute("data-mobile-menu", "open");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el.removeAttribute("data-mobile-menu");
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return <Sheet
    onClose={() => setOpen(false)}
    authReady={authReady}
    email={authReady ? user?.email ?? null : null}
    showAdmin={isOwner || isAdmin}
    isOwner={isOwner}
    onSignOut={async () => {
      await supabase.auth.signOut();
      setOpen(false);
      navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
    }}
  />;
}

function Sheet({
  onClose,
  authReady,
  email,
  showAdmin,
  isOwner,
  onSignOut,
}: {
  onClose: () => void;
  authReady: boolean;
  email: string | null;
  showAdmin: boolean;
  isOwner: boolean;
  onSignOut: () => void | Promise<void>;
}) {
  const dialogRef = useDialogA11y(onClose);

  return (
    <div className="fixed inset-0 z-[90] sm:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-ink/40 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 top-10 flex flex-col overflow-hidden rounded-t-2xl bg-paper shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
          <span className="text-base font-semibold text-ink">Menu</span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-ink/15 bg-paper px-3 text-sm font-medium text-ink hover:bg-secondary"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
            <span>Close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-2">
          <MobileLinks
            onNavigate={onClose}
            authReady={authReady}
            email={email}
            showAdmin={showAdmin}
            isOwner={isOwner}
            onSignOut={onSignOut}
          />
        </div>
      </div>
    </div>
  );
}
