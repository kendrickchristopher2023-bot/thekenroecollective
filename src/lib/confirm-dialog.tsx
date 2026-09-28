import { createRoot, type Root } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";

/**
 * Plain-language confirm dialog with an accessible modal, keyboard support,
 * and focus on the safe (Cancel) button by default. Replaces window.confirm()
 * across the app so novice / elderly users get a friendly, readable prompt
 * they can dismiss with Escape or the visible Cancel button.
 *
 *   const ok = await confirmDialog({
 *     title: "Delete Jane's Birthday?",
 *     body: "Guests and RSVPs will be removed. You can undo this for 10 seconds.",
 *     confirmLabel: "Yes, delete",
 *     tone: "danger",
 *   });
 *   if (!ok) return;
 */

export type ConfirmTone = "danger" | "info";

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

let containerRoot: Root | null = null;

function ensureRoot(): Root {
  if (containerRoot) return containerRoot;
  if (typeof document === "undefined") {
    throw new Error("confirmDialog can only run in the browser");
  }
  const el = document.createElement("div");
  el.setAttribute("data-confirm-dialog-host", "true");
  document.body.appendChild(el);
  containerRoot = createRoot(el);
  return containerRoot;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  // SSR / non-browser fallback: never confirm destructive actions server-side.
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const root = ensureRoot();
    const close = (result: boolean) => {
      root.render(null);
      resolve(result);
    };
    root.render(<ConfirmDialog opts={opts} onClose={close} />);
  });
}

function ConfirmDialog({ opts, onClose }: { opts: ConfirmOptions; onClose: (r: boolean) => void }) {
  const [open, setOpen] = useState(true);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        onClose(false);
      } else if (e.key === "Enter") {
        setOpen(false);
        onClose(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!open) return null;

  const tone: ConfirmTone = opts.tone ?? "danger";
  const Icon = tone === "danger" ? AlertTriangle : Info;
  const iconWrap =
    tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-velvet/10 text-velvet";
  const confirmBtn =
    tone === "danger"
      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
      : "bg-velvet text-white hover:opacity-90";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={opts.body ? "confirm-dialog-body" : undefined}
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={() => {
        setOpen(false);
        onClose(false);
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-paper text-ink shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${iconWrap}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-dialog-title" className="font-serif text-lg leading-tight">
              {opts.title}
            </h2>
            {opts.body ? (
              <p id="confirm-dialog-body" className="mt-1.5 text-sm text-ink/70">
                {opts.body}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 px-5 pb-5 pt-5 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => {
              setOpen(false);
              onClose(false);
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/15 bg-paper px-4 text-sm font-medium text-ink hover:bg-secondary"
          >
            {opts.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onClose(true);
            }}
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold ${confirmBtn}`}
          >
            {opts.confirmLabel ?? "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Accessible replacement for window.prompt() — same modal chrome as
 * confirmDialog (focus trap, Escape to cancel, role="dialog"), but collects
 * a single line of text. Resolves the trimmed value, or null if cancelled.
 *
 *   const name = await promptDialog({ title: "New folder name", confirmLabel: "Create" });
 *   if (name === null) return;
 */
export type PromptOptions = {
  title: string;
  body?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

let promptRoot: Root | null = null;

function ensurePromptRoot(): Root {
  if (promptRoot) return promptRoot;
  if (typeof document === "undefined") {
    throw new Error("promptDialog can only run in the browser");
  }
  const el = document.createElement("div");
  el.setAttribute("data-prompt-dialog-host", "true");
  document.body.appendChild(el);
  promptRoot = createRoot(el);
  return promptRoot;
}

export function promptDialog(opts: PromptOptions): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  return new Promise<string | null>((resolve) => {
    const root = ensurePromptRoot();
    const close = (result: string | null) => {
      root.render(null);
      resolve(result);
    };
    root.render(<PromptDialogView opts={opts} onClose={close} />);
  });
}

function PromptDialogView({ opts, onClose }: { opts: PromptOptions; onClose: (r: string | null) => void }) {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState(opts.defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        onClose(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!open) return null;

  function submit() {
    setOpen(false);
    onClose(value.trim());
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-dialog-title"
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={() => {
        setOpen(false);
        onClose(null);
      }}
    >
      <form
        className="w-full max-w-md overflow-hidden rounded-2xl bg-paper text-ink shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="px-5 pt-5">
          <h2 id="prompt-dialog-title" className="font-serif text-lg leading-tight">
            {opts.title}
          </h2>
          {opts.body ? <p className="mt-1.5 text-sm text-ink/70">{opts.body}</p> : null}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={opts.placeholder}
            className="mt-3 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
          />
        </div>
        <div className="flex flex-col-reverse gap-2 px-5 pb-5 pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onClose(null);
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/15 bg-paper px-4 text-sm font-medium text-ink hover:bg-secondary"
          >
            {opts.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-velvet px-4 text-sm font-semibold text-white hover:opacity-90"
          >
            {opts.confirmLabel ?? "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
