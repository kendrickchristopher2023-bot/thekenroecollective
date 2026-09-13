/**
 * One audience picker shared by every "send to guests" surface (invitation
 * email, resend, SMS reminders).
 *
 * Hosts think in RSVP answers, so the filters are the answers themselves: no
 * response yet, yes, maybe, no. Inside a filter every guest can still be
 * unticked by hand, because "everyone who hasn't answered except Aunt May" is
 * the normal real-world request. Nothing sends from here — the parent owns the
 * confirmation step and the send call.
 */
import { useEffect, useMemo, useState } from "react";
import type { Guest } from "@/lib/events-store";

export type AudienceFilter = "unanswered" | "yes" | "maybe" | "no" | "all";

const FILTERS: { key: AudienceFilter; label: string }[] = [
  { key: "unanswered", label: "No response yet" },
  { key: "yes", label: "Yes" },
  { key: "maybe", label: "Maybe" },
  { key: "no", label: "No" },
  { key: "all", label: "Everyone" },
];

export function matchesAudience(guest: Guest, filter: AudienceFilter): boolean {
  const status = guest.status || "pending";
  switch (filter) {
    case "all":
      return true;
    case "unanswered":
      return status === "pending";
    case "yes":
      return status === "yes";
    case "maybe":
      return status === "maybe";
    case "no":
      return status === "no";
    default:
      return true;
  }
}

/** Strips accents so "Renée" is found by typing "renee". */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function stamp(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export interface GuestAudiencePickerProps {
  guests: Guest[];
  /** "email" hides guests with no email; "sms" hides guests with no phone. */
  channel: "email" | "sms";
  /** Normalised phone numbers that have opted out of SMS. */
  optedOutPhones?: Set<string>;
  /** Digits-only normaliser, supplied by the SMS caller. */
  normalizePhone?: (phone: string) => string;
  /** Last-texted timestamps keyed by guest id. */
  lastTextedAt?: Record<string, string>;
  /** Last REMINDER email per guest id. Never the invitation timestamp. */
  lastRemindedAt?: Record<string, string>;
  defaultFilter?: AudienceFilter;
  /** Fires whenever the effective selection changes. */
  onChange: (selected: Guest[]) => void;
}

export function GuestAudiencePicker({
  guests,
  channel,
  optedOutPhones,
  normalizePhone,
  lastTextedAt,
  lastRemindedAt,
  defaultFilter = "unanswered",
  onChange,
}: GuestAudiencePickerProps) {
  const [filter, setFilter] = useState<AudienceFilter>(defaultFilter);
  const [query, setQuery] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const reachable = useMemo(
    () =>
      (guests || []).filter((g) =>
        channel === "email" ? !!g.email && g.email.includes("@") : !!g.phone,
      ),
    [guests, channel],
  );

  const isOptedOut = (g: Guest) =>
    channel === "sms" &&
    !!optedOutPhones &&
    !!normalizePhone &&
    optedOutPhones.has(normalizePhone(g.phone));

  const inFilter = useMemo(
    () => reachable.filter((g) => matchesAudience(g, filter) && !isOptedOut(g)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reachable, filter, optedOutPhones],
  );

  const optedOutCount = useMemo(
    () => reachable.filter((g) => matchesAudience(g, filter) && isOptedOut(g)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reachable, filter, optedOutPhones],
  );

  const selected = useMemo(
    () => inFilter.filter((g) => !excluded.has(g.id)),
    [inFilter, excluded],
  );

  useEffect(() => {
    onChange(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Changing the filter starts a clean selection: carrying hidden exclusions
  // across filters is how hosts end up not sending to someone silently.
  useEffect(() => {
    setExcluded(new Set());
  }, [filter]);

  const visible = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return inFilter;
    return inFilter.filter(
      (g) => fold(g.name || "").includes(q) || fold(g.email || "").includes(q) || (g.phone || "").includes(q),
    );
  }, [inFilter, query]);

  const toggle = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const countsFor = (key: AudienceFilter) =>
    reachable.filter((g) => matchesAudience(g, key) && !isOptedOut(g)).length;

  return (
    <div className="rounded-xl border border-ink/10 bg-secondary/20 p-3">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`min-h-9 rounded-full px-3 py-1 text-xs ${
              filter === f.key ? "bg-ink text-white" : "border border-ink/15 text-ink hover:bg-ink/5"
            }`}
          >
            {f.label} ({countsFor(f.key)})
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a guest by name"
          className="min-h-11 flex-1 rounded-lg border border-ink/15 bg-card px-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-velvet/30 sm:text-sm"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setExcluded(new Set())}
            className="min-h-9 rounded-full border border-ink/15 px-3 py-1 text-xs text-ink hover:bg-ink/5"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => setExcluded(new Set(inFilter.map((g) => g.id)))}
            className="min-h-9 rounded-full border border-ink/15 px-3 py-1 text-xs text-ink hover:bg-ink/5"
          >
            Clear
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {selected.length} selected of {inFilter.length}
        {optedOutCount > 0 ? ` · ${optedOutCount} opted out (excluded)` : ""}
        {channel === "email" ? " · guests without an email are not shown" : " · guests without a phone are not shown"}
      </p>

      {visible.length > 0 ? (
        <ul className="mt-2 max-h-64 divide-y divide-ink/5 overflow-y-auto rounded-lg bg-card">
          {visible.map((g) => {
            const texted = lastTextedAt?.[g.id];
            const reminded = lastRemindedAt?.[g.id];
            return (
              <li key={g.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={!excluded.has(g.id)}
                    onChange={() => toggle(g.id)}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{g.name || g.email || g.phone}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {channel === "email" ? g.email : g.phone}
                      {/* "invited" and "reminded" are different facts, so they read differently. */}
                      {g.invitedAt ? ` · invited ${stamp(g.invitedAt)}` : ""}
                      {reminded ? ` · reminded by email ${stamp(reminded)}` : ""}
                      {texted ? ` · reminded by text ${stamp(texted)}` : ""}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">No guests match this filter.</p>
      )}
    </div>
  );
}

/** Shared confirmation body: exact count plus a sample of who is included. */
export function audienceSummary(selected: Guest[]): string {
  const sample = selected.slice(0, 5).map((g) => g.name || g.email || g.phone).join(", ");
  return `${sample}${selected.length > 5 ? ` and ${selected.length - 5} more` : ""}`;
}
