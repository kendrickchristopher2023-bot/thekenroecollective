import { useEffect, useState } from "react";
import { X } from "lucide-react";

const SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: "⌘ K / Ctrl K", label: "Open command palette" },
  { keys: "?", label: "Show keyboard shortcuts" },
  { keys: "Esc", label: "Close menus & dialogs" },
  { keys: "G then E", label: "Go to Events" },
  { keys: "G then S", label: "Go to Studio" },
  { keys: "G then P", label: "Go to Pricing" },
];

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm animate-in fade-in-0"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl ring-1 ring-ink/10 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl">Keyboard shortcuts</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-2">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-secondary">
              <span className="text-sm text-ink">{s.label}</span>
              <kbd className="rounded border border-ink/15 bg-paper px-2 py-0.5 font-mono text-xs text-ink/80">{s.keys}</kbd>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">Press <kbd className="rounded bg-secondary px-1">?</kbd> anytime to open this.</p>
      </div>
    </div>
  );
}
