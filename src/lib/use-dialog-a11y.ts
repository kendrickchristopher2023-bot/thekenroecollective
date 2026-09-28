import { useEffect, useRef } from "react";

/**
 * Behavior a hand-rolled modal overlay needs to be usable by keyboard and
 * screen-reader users: Escape closes it, focus moves inside on open and
 * returns to the trigger on close, and Tab is trapped while open. Pair the
 * returned ref with role="dialog" aria-modal="true" tabIndex={-1} on the
 * dialog element itself (not the backdrop).
 */
export function useDialogA11y(onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const initial = dialog?.querySelector<HTMLElement>(focusableSelector);
    (initial ?? dialog)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const items = dialog.querySelectorAll<HTMLElement>(focusableSelector);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return dialogRef;
}
