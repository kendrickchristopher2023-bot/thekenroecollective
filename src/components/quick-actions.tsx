import { Link } from "@tanstack/react-router";
import { PlusCircle, Palette, Image as ImageIcon, Users, Command } from "lucide-react";

export function QuickActions() {
  const items = [
    { to: "/events/new", label: "New event", icon: PlusCircle },
    { to: "/studio", label: "Open Studio", icon: Palette },
    { to: "/tools/converter", label: "Media library", icon: ImageIcon },
    { to: "/vendors", label: "Vendors", icon: Users },
  ] as const;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-card px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-velvet/40 hover:bg-velvet/5 hover:text-velvet"
        >
          <it.icon className="h-3.5 w-3.5" />
          {it.label}
        </Link>
      ))}
      <button
        type="button"
        onClick={() => {
          if (typeof window === "undefined") return;
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-velvet/40 hover:text-velvet"
        title="Open command palette (⌘K)"
      >
        <Command className="h-3.5 w-3.5" />
        Quick jump
      </button>
    </div>
  );
}
