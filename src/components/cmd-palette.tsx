import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Calendar, Home, Sparkles, Image as ImageIcon, MessageCircle, Tag, HelpCircle,
  Briefcase, Store, BellRing, Settings, FileText, CreditCard, Clock, Plus,
} from "lucide-react";

type Cmd = { id: string; label: string; to: string; icon: React.ElementType; group: string; keywords?: string };

const ITEMS: Cmd[] = [
  { id: "home", label: "Events home", to: "/gatherings", icon: Home, group: "Navigate" },
  { id: "ventures", label: "Kenroe Collective Ventures", to: "/", icon: Home, group: "Navigate" },
  { id: "events", label: "Your gatherings", to: "/events", icon: Calendar, group: "Navigate", keywords: "events list parties" },
  { id: "new-event", label: "Create new event", to: "/events/new", icon: Plus, group: "Quick actions", keywords: "create add party invite new" },
  { id: "workroom", label: "Projects home (The Workroom)", to: "/workroom", icon: Briefcase, group: "Navigate", keywords: "projects workroom kanban boards tasks" },
  { id: "projects", label: "Your projects", to: "/projects", icon: Briefcase, group: "Navigate" },
  { id: "studio", label: "Atelier Studio (design + compose)", to: "/studio", icon: Sparkles, group: "Navigate", keywords: "design menu package compose invite" },
  { id: "packages", label: "Packages & Menus", to: "/packages", icon: Tag, group: "Navigate" },
  { id: "vendors", label: "Vendors", to: "/vendors", icon: Store, group: "Navigate" },
  { id: "rfq", label: "Request quotes (RFQ)", to: "/rfq", icon: FileText, group: "Navigate", keywords: "rfq quote bid vendor" },
  { id: "converter", label: "Media Converter", to: "/tools/converter", icon: ImageIcon, group: "Tools", keywords: "resize webp jpeg compress image" },
  { id: "pricing", label: "Pricing", to: "/pricing", icon: CreditCard, group: "Navigate" },
  { id: "faq", label: "FAQ", to: "/faq", icon: HelpCircle, group: "Navigate" },
  { id: "contact", label: "Contact support", to: "/contact", icon: MessageCircle, group: "Help" },
  { id: "profile", label: "Profile & settings", to: "/profile", icon: Settings, group: "Account" },
  { id: "admin", label: "Owner dashboard", to: "/owner", icon: BellRing, group: "Account" },
];

const RECENTS_KEY = "kc_palette_recents_v1";
const MAX_RECENTS = 5;

function loadRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as string[]; } catch { return []; }
}
function saveRecents(ids: string[]) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(ids.slice(0, MAX_RECENTS))); } catch { /* ignore */ }
}

export function CmdPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const navigate = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => {
    setRecents(loadRecents());
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // "/" as a universal search shortcut — but only when the user isn't typing
      // in an input, textarea, or contenteditable element.
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          t?.isContentEditable
        ) return;
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-clear query when re-opening so the user gets a fresh search.
  useEffect(() => { if (open) setQuery(""); }, [open]);

  const recordRecent = (id: string) => {
    const next = [id, ...recents.filter((r) => r !== id)];
    setRecents(next); saveRecents(next);
  };

  const go = (item: Cmd) => {
    setOpen(false);
    recordRecent(item.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: item.to as any });
  };

  const askConcierge = () => {
    setOpen(false);
    try {
      // Seed the concierge with the user's typed query.
      const seed = query.trim();
      if (seed) sessionStorage.setItem("kc_concierge_seed", seed);
      sessionStorage.setItem("kc_concierge_open", "1");
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent("kc:open-concierge", { detail: { seed: query.trim() } }));
  };

  const recentItems = recents
    .map((id) => ITEMS.find((i) => i.id === id))
    .filter((x): x is Cmd => !!x)
    .filter((x) => x.to !== path);

  const groups = Array.from(new Set(ITEMS.map((i) => i.group)));
  const trimmed = query.trim();

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command>
          <CommandInput
            placeholder="Search pages, run an action, or ask the AI…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              <div className="space-y-2 py-3 text-center text-sm">
                <div className="text-muted-foreground">No matching page.</div>
                {trimmed && (
                  <button
                    onClick={askConcierge}
                    className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-velvet px-4 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    <Sparkles className="h-3 w-3" /> Ask the Concierge: "{trimmed.slice(0, 40)}"
                  </button>
                )}
              </div>
            </CommandEmpty>

            {trimmed && (
              <CommandGroup heading="AI">
                <CommandItem onSelect={askConcierge}>
                  <Sparkles className="mr-2 h-4 w-4 text-velvet" />
                  <span>Ask the Concierge — "{trimmed.slice(0, 60)}"</span>
                </CommandItem>
              </CommandGroup>
            )}

            {!trimmed && recentItems.length > 0 && (
              <>
                <CommandGroup heading="Recent">
                  {recentItems.map((it) => {
                    const Icon = it.icon;
                    return (
                      <CommandItem key={`recent-${it.id}`} onSelect={() => go(it)}>
                        <Clock className="mr-2 h-4 w-4 opacity-60" />
                        <span>{it.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {groups.map((g, i) => (
              <div key={g}>
                {i > 0 && <CommandSeparator />}
                <CommandGroup heading={g}>
                  {ITEMS.filter((it) => it.group === g).map((it) => {
                    const Icon = it.icon;
                    return (
                      <CommandItem
                        key={it.id}
                        value={`${it.label} ${it.keywords ?? ""}`}
                        onSelect={() => go(it)}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        <span>{it.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
