import { Link, useNavigate } from "@tanstack/react-router";
import logoImg from "@/assets/kenroes-logo.png";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPublicTiers, meIsAdmin, meIsOwner, type PricingTier } from "@/lib/pricing.functions";
import { useAuthReady } from "@/hooks/use-auth-ready";

import { WhatsNewBell } from "@/components/whats-new";
import { AdminNotificationBell } from "@/components/admin-notification-bell";
import { LanguagePicker } from "@/components/language-picker";
import { useLanguage, LANGUAGES } from "@/lib/i18n";
import { useSignInRedirect } from "@/hooks/use-signin-redirect";
import { useDarkMode } from "@/components/dark-mode-toggle";
import { useAccessibilityPrefs } from "@/components/accessibility-menu";
import { useUiMode } from "@/lib/ui-mode";

import { SelectionsDrawer } from "@/components/selections-drawer";
import {
  Home as HomeIcon,
  CalendarHeart as CalendarHeartIcon,
  Sparkles as SparklesIcon,
  Store as StoreIcon,
  FolderKanban as FolderKanbanIcon,
  Tag as TagIcon,
  HelpCircle as HelpCircleIcon,
  Mail as MailIcon,
  User as UserIcon,
  Shield as ShieldIcon,
  LogOut as LogOutIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  Globe as GlobeIcon,
  Sun as SunIcon,
  Moon as MoonIcon,
  Type as TypeIcon,
  Contrast as ContrastIcon,
  Check as CheckIcon,
} from "lucide-react";

/**
 * SINGLE SOURCE OF TRUTH for the "Explore the collective" destinations.
 * Both the desktop `CollectiveMenu` dropdown and the mobile `MobileLinks`
 * drawer render from this one array, so the two surfaces cannot drift apart
 * again. Add a destination here once and it appears on both.
 *
 * `requiresAuth: true` keeps the exact same visibility rule Contacts had
 * before this refactor (it was rendered behind an `email ?` guard on mobile).
 */
type CollectiveTo =
  | "/"
  | "/gatherings"
  | "/workroom"
  | "/events"
  | "/projects"
  | "/vendors"
  | "/studio"
  | "/ecards"
  | "/contacts";

type CollectiveItem = {
  to: CollectiveTo;
  label: string;
  blurb: string;
  Icon: typeof HomeIcon;
  badge?: string;
  /** Only shown to signed-in visitors. */
  requiresAuth?: boolean;
  /**
   * Which menu column the entry belongs to. "explore" = what the product does
   * (public overview pages), "mine" = the signed-in person's own workspaces.
   * The old menu mixed the two, so "Events & Gatherings" sat next to "Events"
   * with nothing on screen explaining the difference.
   */
  group: "explore" | "mine";
  /**
   * Within the "explore" column, "secondary" entries are the other ventures.
   * They stay clickable but render as a compact, lighter list below the
   * communications product, which is what a first-time organizer wants.
   */
  weight?: "primary" | "secondary";
  /** Short label used in the compact secondary list. */
  shortBlurb?: string;
};

const COLLECTIVE_ITEMS: CollectiveItem[] = [
  {
    to: "/gatherings",
    label: "Events & Gatherings",
    blurb: "Send invitations, collect RSVPs, and design the invite. Overview and pricing.",
    Icon: HomeIcon,
    group: "explore",
    weight: "primary",
  },
  {
    to: "/vendors",
    label: "Vendors & Registry",
    blurb: "Find venues and caterers, or set up a gift registry.",
    Icon: StoreIcon,
    group: "explore",
    weight: "primary",
  },
  {
    to: "/studio",
    label: "Design Studio",
    blurb: "Design menus, signs, and printables, then export or print them.",
    shortBlurb: "Menus, signs, and printables",
    Icon: SparklesIcon,
    group: "explore",
    weight: "secondary",
  },
  {
    to: "/workroom",
    label: "Project Boards",
    blurb: "Track tasks and share work with your team. No event needed.",
    shortBlurb: "Tasks and team work",
    Icon: FolderKanbanIcon,
    group: "explore",
    weight: "secondary",
  },
  {
    to: "/ecards",
    label: "Group eCards",
    blurb: "One card, many signers. Everyone adds a message, revealed on the day.",
    shortBlurb: "One card, many signers",
    Icon: SparklesIcon,
    badge: "New",
    group: "explore",
    weight: "secondary",
  },
  {
    to: "/",
    label: "All Kenroe products",
    blurb: "See everything we make in one place.",
    shortBlurb: "Everything we make",
    Icon: GlobeIcon,
    group: "explore",
    weight: "secondary",
  },
  {
    to: "/events",
    label: "My events",
    blurb: "Open the events you are hosting and check guests in.",
    Icon: CalendarHeartIcon,
    group: "mine",
  },
  {
    to: "/projects",
    label: "My project boards",
    blurb: "Open your own boards, tasks, and collaborators.",
    Icon: FolderKanbanIcon,
    group: "mine",
  },
  {
    to: "/contacts",
    label: "My contacts",
    blurb: "Your saved guests, reuse them on any event.",
    Icon: UserIcon,
    badge: "Atelier plan",
    requiresAuth: true,
    group: "mine",
  },
];

function visibleCollectiveItems(signedIn: boolean): CollectiveItem[] {
  return COLLECTIVE_ITEMS.filter((it) => !it.requiresAuth || signedIn);
}

const COLUMN_HEADERS: Record<CollectiveItem["group"], string> = {
  explore: "What we make",
  mine: "Your own workspace",
};



export function SiteNav() {
  const { ready: authReady, user } = useAuthReady();
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rolesReady, setRolesReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!authReady) return;
    let active = true;
    if (!user) {
      setIsOwner(false);
      setIsAdmin(false);
      setRolesReady(true);
      return;
    }
    setRolesReady(false);
    Promise.all([meIsOwner(), meIsAdmin()])
      .then(([ownerRes, adminRes]) => {
        if (!active) return;
        setIsOwner(ownerRes.isOwner);
        setIsAdmin(adminRes.isAdmin);
        setRolesReady(true);
      })
      .catch(() => {
        if (!active) return;
        setIsOwner(false);
        setIsAdmin(false);
        setRolesReady(true);
      });
    return () => {
      active = false;
    };
  }, [authReady, user?.id]);


  const showAdmin = isOwner || isAdmin;
  const email = authReady ? user?.email ?? null : null;
  
  const [signInSearch, setSignInSearch] = useState<{ redirect?: string }>({});




  useEffect(() => {
    const here = window.location.pathname + window.location.search;
    if (here.startsWith("/auth") || here.startsWith("/reset-password")) {
      setSignInSearch({});
    } else {
      setSignInSearch({ redirect: here });
    }
  }, []);

  // The mobile drawer lives in MobileMenuDrawer (mounted globally in __root).


  return (
    <nav className="sticky top-0 z-40 border-b border-ink/5 bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:h-20 sm:px-6 lg:h-28">
        <Link to="/gatherings" aria-label="The Kenroe Collective — events home" className="flex min-w-0 items-center" data-notranslate>
          {/* Logo steps up only at lg. At tablet the 240px-wide mark crowded the
              link row and pushed the account chip past the right edge. */}
          <img src={logoImg} alt="" width={240} height={96} className="h-12 w-auto sm:h-14 lg:h-24" />
        </Link>

        {/* Desktop nav */}
        {/* The three marketing links only appear from lg up. Between 640 and
            1023 they collided with the account cluster; they stay reachable in
            the footer at those widths. */}
        <div className="hidden shrink-0 items-center gap-4 sm:flex lg:gap-6">
          <CollectiveMenu signedIn={!!email} />
          <Link to="/pricing" className="text-sm font-medium text-ink/60 transition-colors hover:text-ink" activeProps={{ className: "text-ink" }}>
            Pricing
          </Link>
          <Link to="/tutorials" className="hidden text-sm font-medium text-ink/60 transition-colors hover:text-ink lg:inline" activeProps={{ className: "text-ink" }}>
            How it works
          </Link>
          <Link to="/faq" className="hidden text-sm font-medium text-ink/60 transition-colors hover:text-ink lg:inline" activeProps={{ className: "text-ink" }}>
            FAQ
          </Link>
          <Link to="/contact" className="hidden text-sm font-medium text-ink/60 transition-colors hover:text-ink lg:inline" activeProps={{ className: "text-ink" }}>
            Contact
          </Link>
        </div>

        {/* Desktop right side — min-width keeps the header row from shifting
            while the session and role checks resolve. */}
        <div className="hidden items-center justify-end gap-2 sm:flex lg:min-w-[440px]">
          <DisplaySettingsMenu />

          {!authReady || !rolesReady ? (
            <div className="h-9 w-[140px] lg:w-[360px]" aria-hidden="true" />
          ) : email ? (
            <>

              <span className="mx-1 h-5 w-px bg-ink/10" aria-hidden="true" />
              <SelectionsDrawer />
              {showAdmin ? <AdminNotificationBell /> : <WhatsNewBell />}
              {isOwner && <OwnerAdminMenu />}
              <AccountMenu
                email={email}
                showAdmin={showAdmin}
                isOwner={isOwner}
                onSignOut={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
                }}
              />
            </>
          ) : (
            <Link
              to="/auth"
              search={signInSearch as any}
              className="rounded-full bg-velvet px-4 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Sign in
            </Link>
          )}
        </div>

        {/* Mobile right side: bell only. The single mobile menu entry point is
            the bottom tab bar's "Menu" tab, which dispatches
            "kenroe:open-mobile-menu". The drawer itself is mounted globally
            (MobileMenuDrawer in __root) so Menu works on every page, including
            pages that don't render this header. */}
        <div className="flex items-center gap-2 sm:hidden">
          <div className="grid min-h-12 min-w-12 place-items-center">
            {authReady && rolesReady && email
              ? (showAdmin ? <AdminNotificationBell /> : <WhatsNewBell />)
              : null}
          </div>
        </div>
      </div>
    </nav>
  );
}

export function MobileLinks({

  onNavigate,
  authReady,
  email,
  showAdmin,
  isOwner,
  onSignOut,
}: {
  onNavigate: () => void;
  authReady: boolean;
  email: string | null;
  showAdmin: boolean;
  isOwner: boolean;
  onSignOut: () => void | Promise<void>;
}) {
  const linkCls = "flex min-h-14 items-center gap-3 rounded-xl px-3 py-3 text-base font-medium text-ink hover:bg-secondary";
  const sectionLabel = "px-3 pb-1 pt-4 text-[13px] font-semibold text-ink/50";
  const { lang, setLang } = useLanguage();
  const { theme, toggle: toggleTheme } = useDarkMode();
  const { size, contrast, pickSize, toggleContrast, SIZES } = useAccessibilityPrefs();
  const uiMode = useUiMode();
  const signInSearch = useSignInRedirect();

  const toggleCls = (active: boolean) =>
    `rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
      active ? "border-velvet bg-velvet text-paper" : "border-ink/15 bg-paper text-ink hover:bg-secondary"
    }`;
  return (
    <div className="flex flex-col">
      {(["explore", "mine"] as const).map((group) => {
        const groupItems = visibleCollectiveItems(!!email).filter((it) => it.group === group);
        if (groupItems.length === 0) return null;
        const primary = groupItems.filter((it) => it.weight !== "secondary");
        const secondary = groupItems.filter((it) => it.weight === "secondary");
        return (
          <div key={group} className="flex flex-col">
            <div className={sectionLabel}>{COLUMN_HEADERS[group]}</div>
            {primary.map(({ to, label, Icon, badge }) => (
              <Link key={to} to={to} onClick={onNavigate} className={linkCls}>
                <Icon className="h-5 w-5 shrink-0 text-ink/60" aria-hidden="true" />
                <span className="flex-1">{label}</span>
                {badge ? (
                  <span className="rounded-full bg-velvet/10 px-2 py-0.5 text-[11px] font-medium text-velvet">{badge}</span>
                ) : null}
              </Link>
            ))}
            {secondary.length > 0 && (
              <>
                <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink/40">
                  Also from the collective
                </div>
                {secondary.map(({ to, label, badge }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={onNavigate}
                    className="flex min-h-12 items-center gap-2 rounded-xl px-3 py-2 text-[15px] font-normal text-ink/70 hover:bg-secondary hover:text-ink"
                  >
                    <span className="flex-1">{label}</span>
                    {badge ? (
                      <span className="rounded-full bg-velvet/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-velvet">{badge}</span>
                    ) : null}
                  </Link>
                ))}
              </>
            )}
          </div>
        );
      })}



      <div className={sectionLabel}>Learn more</div>
      <Link to="/pricing" onClick={onNavigate} className={linkCls}>
        <TagIcon className="h-5 w-5 shrink-0 text-ink/60" aria-hidden="true" /> Pricing
      </Link>
      <Link to="/tutorials" onClick={onNavigate} className={linkCls}>
        <HelpCircleIcon className="h-5 w-5 shrink-0 text-ink/60" aria-hidden="true" /> How it works
      </Link>
      <Link to="/faq" onClick={onNavigate} className={linkCls}>
        <HelpCircleIcon className="h-5 w-5 shrink-0 text-ink/60" aria-hidden="true" /> FAQ
      </Link>
      <Link to="/contact" onClick={onNavigate} className={linkCls}>
        <MailIcon className="h-5 w-5 shrink-0 text-ink/60" aria-hidden="true" /> Contact
      </Link>
      <Link to="/whats-new" onClick={onNavigate} className={linkCls}>
        <SparklesIcon className="h-5 w-5 shrink-0 text-ink/60" aria-hidden="true" /> What's new
      </Link>

      <div className={sectionLabel}>Language</div>
      <div className="px-3 pb-1">
        <LanguagePicker value={lang} onChange={(next) => { void setLang(next); }} className="min-h-12 w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-base" />
      </div>

      <div className={sectionLabel}>Display</div>
      <div className="px-3 pb-2">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          {theme === "dark" ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />} Appearance
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => theme !== "light" && toggleTheme()} aria-pressed={theme === "light"} className={toggleCls(theme === "light")}>
            <SunIcon className="mx-auto h-4 w-4" />
            <span className="mt-1 block">Light</span>
          </button>
          <button type="button" onClick={() => theme !== "dark" && toggleTheme()} aria-pressed={theme === "dark"} className={toggleCls(theme === "dark")}>
            <MoonIcon className="mx-auto h-4 w-4" />
            <span className="mt-1 block">Dark</span>
          </button>
        </div>

        <div className="mb-2 mt-4 flex items-center gap-2 text-sm font-semibold">
          <TypeIcon className="h-4 w-4" /> Text size
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {SIZES.map((s) => (
            <button key={s.id} type="button" onClick={() => pickSize(s.id)} aria-pressed={size === s.id} className={toggleCls(size === s.id)}>
              <span aria-hidden className="block leading-none" style={{ fontSize: s.id === "sm" ? "10px" : s.id === "md" ? "12px" : s.id === "lg" ? "14px" : "17px" }}>
                A
              </span>
              <span className="mt-1 block text-[10px] uppercase tracking-wide opacity-80">{s.label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={toggleContrast}
          aria-pressed={contrast}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-lg border border-ink/10 px-2 py-2 text-left text-sm hover:bg-secondary"
        >
          <span className="flex items-center gap-2">
            <ContrastIcon className="h-4 w-4" />
            <span className="font-medium">High contrast</span>
          </span>
          <span className={`grid h-6 w-6 place-items-center rounded-md border ${contrast ? "border-velvet bg-velvet text-paper" : "border-ink/20 bg-paper text-transparent"}`}>
            <CheckIcon className="h-3.5 w-3.5" />
          </span>
        </button>

        <div className="mb-2 mt-4 text-sm font-semibold">How much do you want to see?</div>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => uiMode.setMode("simple")} aria-pressed={uiMode.simple} className={toggleCls(uiMode.simple)}>
            Beginner
          </button>
          <button type="button" onClick={() => uiMode.setMode("expert")} aria-pressed={uiMode.expert} className={toggleCls(uiMode.expert)}>
            All tools
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Beginner keeps the essentials on screen. All tools shows every optional step.
        </p>
      </div>


      <div className={sectionLabel}>Your account</div>
      {!authReady ? null : email ? (
        <>
          <div className="mx-3 mb-1 flex items-center gap-3 rounded-xl bg-secondary/50 px-3 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-velvet text-sm font-semibold text-white">
              {email.trim()[0]?.toUpperCase() || "?"}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{email}</span>
          </div>
          <Link to="/profile" search={{ tab: undefined }} onClick={onNavigate} className={linkCls}>
            <UserIcon className="h-5 w-5 shrink-0 text-ink/60" aria-hidden="true" /> Profile
          </Link>
          <Link to="/settings/billing" onClick={onNavigate} className={linkCls}>
            <UserIcon className="h-5 w-5 shrink-0 text-ink/60" aria-hidden="true" /> Billing &amp; plan
          </Link>
          {(showAdmin || isOwner) && (
            <Link to="/admin" onClick={onNavigate} className={linkCls}>
              <ShieldIcon className="h-5 w-5 shrink-0 text-ink/60" aria-hidden="true" /> Admin dashboard
            </Link>
          )}
          {isOwner && (
            <Link to="/dev-changelog" onClick={onNavigate} className={linkCls}>
              <ShieldIcon className="h-5 w-5 shrink-0 text-ink/60" aria-hidden="true" /> What's new (internal)
            </Link>
          )}
          <button
            onClick={onSignOut}
            className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-ink/15 bg-paper px-4 py-2 text-base font-medium text-ink hover:bg-secondary"
          >
            <LogOutIcon className="h-5 w-5" aria-hidden="true" /> Sign out
          </button>
        </>
      ) : (
        <Link
          to="/auth"
          onClick={onNavigate}
          search={signInSearch as any}
          className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-velvet px-4 text-base font-semibold text-white hover:opacity-90"
        >
          Sign in
        </Link>
      )}
    </div>
  );
}

function CollectiveMenu({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const items = visibleCollectiveItems(signedIn);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
          open
            ? "border-velvet/40 bg-velvet/10 text-velvet"
            : "border-ink/15 bg-paper text-ink hover:border-velvet/40 hover:bg-velvet/5 hover:text-velvet"
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-velvet" aria-hidden />
        Collective
        <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        // Two labelled columns: the left says what we make, the right is the
        // signed-in person's own workspaces. Headers carry the organizing
        // logic that used to exist only in our heads.
        <div className="absolute left-0 top-full z-50 mt-2 w-[42rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-paper shadow-xl ring-1 ring-ink/10">
          <div className="grid grid-cols-2 gap-2 p-2">
            {(["explore", "mine"] as const).map((group) => {
              const groupItems = items.filter((it) => it.group === group);
              if (groupItems.length === 0) return null;
              const primary = groupItems.filter((it) => it.weight !== "secondary");
              const secondary = groupItems.filter((it) => it.weight === "secondary");
              return (
                <div key={group} className="flex flex-col">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink/45">
                    {COLUMN_HEADERS[group]}
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {primary.map(({ to, label, blurb, Icon, badge }) => (
                      <li key={to}>
                        <Link
                          to={to}
                          onClick={() => setOpen(false)}
                          className="flex h-full items-start gap-2.5 rounded-xl px-3 py-2 hover:bg-secondary"
                        >
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink/50" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-semibold text-ink">{label}</span>
                              {badge && (
                                <span className="rounded-full bg-velvet/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-velvet">
                                  {badge}
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-xs text-ink/60">{blurb}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {secondary.length > 0 && (
                    <div className="mt-auto pt-2">
                      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink/35">
                        Also from the collective
                      </p>
                      <ul className="flex flex-col">
                        {secondary.map(({ to, label, shortBlurb, badge }) => (
                          <li key={to}>
                            <Link
                              to={to}
                              onClick={() => setOpen(false)}
                              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] text-ink/70 hover:bg-secondary hover:text-ink"
                            >
                              <span className="font-normal">{label}</span>
                              {badge && (
                                <span className="rounded-full bg-velvet/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-velvet">
                                  {badge}
                                </span>
                              )}
                              {shortBlurb && (
                                <span className="truncate text-[11px] text-ink/40">· {shortBlurb}</span>
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>


          <div className="border-t border-ink/5 p-2">
            <Link
              to="/whats-new"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 text-sm font-medium text-ink/70 hover:bg-secondary hover:text-ink"
            >
              What's new →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function OwnerAdminMenu() {
  const [open, setOpen] = useState(false);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || tiers.length > 0) return;
    getPublicTiers().then((rows) => {
      setTiers(rows);
      if (rows[0]) setActiveId((c) => c ?? rows[0].id);
    }).catch(() => {});
  }, [open, tiers.length]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const active = tiers.find((t) => t.id === activeId) ?? null;

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
          open ? "border-velvet/40 bg-velvet/10 text-velvet" : "border-velvet/25 bg-velvet/5 text-velvet hover:bg-velvet/10"
        }`}
      >
        Admin
        <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[28rem] overflow-hidden rounded-2xl bg-paper shadow-xl ring-1 ring-ink/10">
          <div className="border-b border-ink/5 px-4 py-3">
            <Link to="/admin" onClick={() => setOpen(false)} className="text-sm font-medium text-velvet hover:underline">
              Open Admin dashboard →
            </Link>
          </div>
          <div className="px-4 pt-3">
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Tier preview</div>
            {tiers.length === 0 ? (
              <p className="my-3 text-xs text-muted-foreground">Loading tiers…</p>
            ) : (
              <div className="mt-2 inline-flex flex-wrap gap-1 rounded-full bg-secondary p-1">
                {tiers.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveId(t.id)}
                    className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                      activeId === t.id ? "bg-paper text-ink shadow-sm" : "text-muted-foreground hover:text-ink"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {active && (
            <div className="px-4 pb-4 pt-3">
              <div className="flex items-baseline justify-between">
                <h4 className="font-serif text-lg">{active.name}</h4>
                <div className="text-xs text-muted-foreground">
                  <span className="font-serif text-base text-ink">${active.price_monthly}</span>
                  {active.id === "free" ? " one-time" : " /mo"}
                </div>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{active.blurb}</p>
              <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {active.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px]">
                    <span className="text-velvet">✓</span>
                    <span className="text-ink/85">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AccountMenu({
  email,
  showAdmin,
  isOwner,
  onSignOut,
}: {
  email: string;
  showAdmin: boolean;
  isOwner: boolean;
  onSignOut: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const initial = email.trim()[0]?.toUpperCase() || "?";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu — signed in as ${email}`}
        className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 text-xs font-medium transition-colors ${
          open ? "border-velvet/40 bg-velvet/10" : "border-ink/15 bg-paper hover:border-velvet/40 hover:bg-velvet/5"
        }`}
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-velvet text-[11px] font-semibold text-white">
          {initial}
        </span>
        {/* Tablet widths have no room for a long address; truncate harder
            below lg so the header row never runs past the viewport. */}
        <span className="hidden max-w-[6rem] truncate text-ink/80 md:inline lg:max-w-[9rem]">{email}</span>
        <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl bg-paper py-1.5 shadow-xl ring-1 ring-ink/10">
          <div className="border-b border-ink/5 px-4 py-2.5">
            <p className="truncate text-xs font-medium text-ink">{email}</p>
          </div>
          <Link
            to="/profile"
            search={{ tab: undefined }}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink/80 hover:bg-secondary"
          >
            <UserIcon className="h-4 w-4 text-ink/50" aria-hidden="true" /> Profile
          </Link>
          <Link
            to="/settings/billing"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink/80 hover:bg-secondary"
          >
            <TagIcon className="h-4 w-4 text-ink/50" aria-hidden="true" /> Billing &amp; plan
          </Link>
          {showAdmin && !isOwner && (
            <Link
              to="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink/80 hover:bg-secondary"
            >
              <ShieldIcon className="h-4 w-4 text-ink/50" aria-hidden="true" /> Admin dashboard
            </Link>
          )}
          {isOwner && (
            <Link
              to="/dev-changelog"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink/80 hover:bg-secondary"
            >
              <ShieldIcon className="h-4 w-4 text-ink/50" aria-hidden="true" /> What's new (internal)
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void onSignOut();
            }}
            className="flex w-full items-center gap-2.5 border-t border-ink/5 px-4 py-2 text-left text-sm text-ink/80 hover:bg-secondary"
          >
            <LogOutIcon className="h-4 w-4 text-ink/50" aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// Consolidates language, light/dark, and accessibility (text size + high
// contrast) into one icon button instead of three separate controls sitting
// side by side in the nav.
function DisplaySettingsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { lang, setLang } = useLanguage();
  const { theme, toggle: toggleTheme } = useDarkMode();
  const { size, contrast, pickSize, toggleContrast, SIZES } = useAccessibilityPrefs();
  const uiMode = useUiMode();


  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Display settings — language, theme, and accessibility"
        title="Display settings"
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
          open ? "border-velvet/40 bg-velvet/10 text-velvet" : "border-ink/15 bg-paper text-ink hover:bg-secondary"
        }`}
      >
        <SlidersHorizontalIcon className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Display settings"
          className="absolute right-0 z-[90] mt-2 w-72 overflow-hidden rounded-2xl border border-ink/10 bg-card text-card-foreground shadow-2xl"
        >
          <div className="px-4 py-3">
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <GlobeIcon className="h-4 w-4" /> Language
            </label>
            <LanguagePicker
              value={lang}
              onChange={(next) => { void setLang(next); }}
              className="w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
          </div>

          <div className="border-t border-ink/5 px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              {theme === "dark" ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />} Appearance
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => theme !== "light" && toggleTheme()}
                aria-pressed={theme === "light"}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  theme === "light" ? "border-velvet bg-velvet text-paper" : "border-ink/15 bg-paper text-ink hover:bg-secondary"
                }`}
              >
                <SunIcon className="mx-auto h-4 w-4" />
                <span className="mt-1 block">Light</span>
              </button>
              <button
                type="button"
                onClick={() => theme !== "dark" && toggleTheme()}
                aria-pressed={theme === "dark"}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  theme === "dark" ? "border-velvet bg-velvet text-paper" : "border-ink/15 bg-paper text-ink hover:bg-secondary"
                }`}
              >
                <MoonIcon className="mx-auto h-4 w-4" />
                <span className="mt-1 block">Dark</span>
              </button>
            </div>
          </div>

          <div className="border-t border-ink/5 px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <TypeIcon className="h-4 w-4" /> Text size
            </div>
            <div className="grid grid-cols-4 gap-1">
              {SIZES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickSize(s.id)}
                  aria-pressed={size === s.id}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                    size === s.id ? "border-velvet bg-velvet text-paper" : "border-ink/15 bg-paper text-ink hover:bg-secondary"
                  }`}
                >
                  <span aria-hidden className="block leading-none" style={{ fontSize: s.id === "sm" ? "10px" : s.id === "md" ? "12px" : s.id === "lg" ? "14px" : "17px" }}>
                    A
                  </span>
                  <span className="mt-1 block text-[10px] uppercase tracking-wide opacity-80">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-ink/5 px-4 py-3">
            <button
              type="button"
              onClick={toggleContrast}
              aria-pressed={contrast}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-secondary"
            >
              <span className="flex items-center gap-2">
                <ContrastIcon className="h-4 w-4" />
                <span className="font-medium">High contrast</span>
              </span>
              <span className={`grid h-6 w-6 place-items-center rounded-md border ${contrast ? "border-velvet bg-velvet text-paper" : "border-ink/20 bg-paper text-transparent"}`}>
                <CheckIcon className="h-3.5 w-3.5" />
              </span>
            </button>
          </div>

          <div className="border-t border-ink/5 px-4 py-3">
            <div className="mb-2 text-sm font-semibold">How much do you want to see?</div>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => uiMode.setMode("simple")}
                aria-pressed={uiMode.simple}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  uiMode.simple ? "border-velvet bg-velvet text-paper" : "border-ink/15 bg-paper text-ink hover:bg-secondary"
                }`}
              >
                Beginner
              </button>
              <button
                type="button"
                onClick={() => uiMode.setMode("expert")}
                aria-pressed={uiMode.expert}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  uiMode.expert ? "border-velvet bg-velvet text-paper" : "border-ink/15 bg-paper text-ink hover:bg-secondary"
                }`}
              >
                All tools
              </button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Beginner keeps the essentials on screen. All tools shows every optional step.
            </p>
          </div>

        </div>
      )}
    </div>
  );
}

export function SiteFooter() {

  return (
    <footer className="border-t border-ink/5 py-16">
      <div className="mx-auto max-w-7xl px-6">
        <aside
          aria-label="Also from The Kenroe Collective"
          className="mb-12 rounded-2xl bg-secondary/60 p-6 ring-1 ring-ink/5 sm:p-7"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-[62ch]">
              <p className="text-[10px] font-medium uppercase tracking-widest text-velvet">
                Also from The Kenroe Collective
              </p>
              <p className="mt-2 font-serif text-lg font-medium leading-snug">
                Application Kit <span className="text-muted-foreground">— an AI job-search companion.</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Find real openings, tailor your resume and cover letter to each one, and keep every application in view. Currently invite-only.
              </p>
            </div>
            <a
              href="https://excel-ai-resume.lovable.app/request-access"
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center rounded-full bg-transparent px-5 py-2.5 text-xs font-medium text-velvet ring-1 ring-velvet/20 transition-colors hover:bg-velvet/5"
            >
              Request early access →
            </a>
          </div>
        </aside>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground" data-notranslate>
              © {new Date().getFullYear()} The Kenroe Collective<sup aria-hidden="true" className="ml-0.5 text-[0.7em]">™</sup>. All rights reserved.
            </p>
            <Link to="/" className="text-xs font-medium text-velvet transition-colors hover:underline">
              Kenroe Collective Ventures →
            </Link>
          </div>
          {/* Wraps: this row is 7 links and ran off the right edge on phone and
              tablet, cutting the last legal links out of reach. */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 sm:gap-x-6 lg:gap-x-8">
            <Link to="/tutorials" className="text-xs font-medium text-muted-foreground transition-colors hover:text-velvet">
              How it works
            </Link>
            <Link to="/faq" className="text-xs font-medium text-muted-foreground transition-colors hover:text-velvet">
              FAQ
            </Link>
            <Link to="/contact" className="text-xs font-medium text-muted-foreground transition-colors hover:text-velvet">
              Contact
            </Link>
            <Link to="/accessibility" className="text-xs font-medium text-muted-foreground transition-colors hover:text-velvet">
              Accessibility
            </Link>
            <Link to="/privacy" className="text-xs font-medium text-muted-foreground transition-colors hover:text-velvet">
              Privacy
            </Link>
            <Link to="/guest-privacy" className="text-xs font-medium text-muted-foreground transition-colors hover:text-velvet">
              Guest Privacy
            </Link>
            <Link to="/terms" className="text-xs font-medium text-muted-foreground transition-colors hover:text-velvet">
              Terms
            </Link>
            <Link to="/dmca" className="text-xs font-medium text-muted-foreground transition-colors hover:text-velvet">
              DMCA
            </Link>
            <Link to="/sms-terms" className="text-xs font-medium text-muted-foreground transition-colors hover:text-velvet">
              SMS Terms
            </Link>
            <Link to="/refund-policy" className="text-xs font-medium text-muted-foreground transition-colors hover:text-velvet">
              Refunds
            </Link>
            {/* The logo files are owner-only and live in the owner console (Brand kit tab). */}


          </div>
        </div>
      </div>
    </footer>
  );
}

