import { HOST_GUEST_CONSENT_TEXT } from "@/lib/host-consent";

export { HOST_GUEST_CONSENT_TEXT };

export function GuestConsentCheckbox({
  checked,
  onChange,
  id = "host-guest-consent",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-2 rounded-md border border-ink/10 bg-secondary/40 p-3 text-xs text-muted-foreground cursor-pointer"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-velvet"
      />
      <span className="leading-snug">{HOST_GUEST_CONSENT_TEXT}</span>
    </label>
  );
}

export const CONSENT_DISABLED_TOOLTIP =
  "Please confirm you have the right to share this guest information.";
