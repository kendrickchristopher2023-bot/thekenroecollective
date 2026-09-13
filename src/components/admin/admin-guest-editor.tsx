// Structured guest editor for the owner console. Admins previously had to hand
// edit the raw event JSON blob to correct a guest, which is unsafe for routine
// fixes (a stray comma breaks the public event page). This edits the guests
// array in place and writes the result back into the same JSON draft the modal
// saves, so it shares the existing adminUpdateEvent path and its key-removal
// guard. Admin edits deliberately bypass the host's "sizes locked" flag, an
// admin correcting a size after the order is placed is the point.
import { useMemo, useState } from "react";
import { SHIRT_SIZES, SHIRT_SIZE_LABELS, shirtSizeLabel } from "@/lib/tshirt-sizes";

type PlusOneShape = { name?: string; dietary?: string; accessibility?: string; shirtSize?: string; isChild?: boolean };
type GuestShape = {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  status?: string;
  adults?: number;
  children?: number;
  pets?: number;
  dietary?: string;
  accessibilityNotes?: string;
  shirtSize?: string;
  plusOnes?: PlusOneShape[];
};

const STATUSES = ["pending", "yes", "no", "maybe", "waitlisted"] as const;

const input = "w-full rounded-md border px-2 py-1.5 text-sm";
const label = "text-[10px] font-medium uppercase tracking-wider text-muted-foreground";

export function AdminGuestEditor({
  json,
  onChange,
}: {
  json: string;
  onChange: (next: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const parsed = useMemo(() => {
    try {
      const obj = JSON.parse(json) as Record<string, unknown>;
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
      return obj;
    } catch {
      return null;
    }
  }, [json]);

  if (!parsed) {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
        The raw JSON is currently invalid, so the structured editor is unavailable. Fix it on the Raw JSON tab
        and come back.
      </p>
    );
  }

  const guests = (Array.isArray(parsed.guests) ? parsed.guests : []) as GuestShape[];
  const sizesEnabled = !!parsed.tshirtSizesEnabled;
  const sizesLocked = !!parsed.tshirtSizesLocked;

  const write = (nextGuests: GuestShape[]) => {
    onChange(JSON.stringify({ ...parsed, guests: nextGuests }, null, 2));
  };

  const patchGuest = (idx: number, patch: Partial<GuestShape>) => {
    write(guests.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  };

  const patchPlusOne = (gIdx: number, pIdx: number, patch: Partial<PlusOneShape>) => {
    write(
      guests.map((g, i) =>
        i === gIdx
          ? {
              ...g,
              plusOnes: (Array.isArray(g.plusOnes) ? g.plusOnes : []).map((p, j) =>
                j === pIdx ? { ...p, ...patch } : p,
              ),
            }
          : g,
      ),
    );
  };

  const q = search.trim().toLowerCase();
  const visible = guests
    .map((g, idx) => ({ g, idx }))
    .filter(({ g }) =>
      !q ||
      [g.name, g.email, g.phone].some((v) => String(v ?? "").toLowerCase().includes(q)),
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search guests by name, email, or phone"
          className="flex-1 min-w-[180px] rounded-md border px-3 py-2 text-sm"
        />
        <span className="text-xs text-muted-foreground">{guests.length} guest{guests.length === 1 ? "" : "s"}</span>
      </div>

      {sizesEnabled && (
        <p className="rounded-md border border-ink/10 bg-secondary/40 p-2 text-[11px] text-muted-foreground">
          T-shirt sizes are enabled on this event{sizesLocked ? " and locked for guests and the host" : ""}.
          Admin edits here always apply, use them only for genuine corrections.
        </p>
      )}

      {guests.length === 0 && (
        <p className="text-xs text-muted-foreground">This event has no guests.</p>
      )}

      <div className="divide-y rounded-md border">
        {visible.map(({ g, idx }) => {
          const key = g.id ?? `idx-${idx}`;
          const open = openId === key;
          const plusOnes = Array.isArray(g.plusOnes) ? g.plusOnes : [];
          return (
            <div key={key} className="p-3">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : key)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{g.name || "(unnamed guest)"}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {[g.email, g.phone].filter(Boolean).join(" · ") || "No contact"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded-full bg-secondary px-2 py-0.5 uppercase">{g.status ?? "pending"}</span>
                  {sizesEnabled && g.shirtSize ? (
                    <span className="rounded-full bg-secondary px-2 py-0.5">👕 {shirtSizeLabel(g.shirtSize)}</span>
                  ) : null}
                  {plusOnes.length > 0 ? <span>+{plusOnes.length}</span> : null}
                  <span>{open ? "▲" : "▼"}</span>
                </span>
              </button>

              {open && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className={label}>Name</span>
                    <input className={input} value={g.name ?? ""} onChange={(e) => patchGuest(idx, { name: e.target.value })} />
                  </label>
                  <label className="space-y-1">
                    <span className={label}>RSVP status</span>
                    <select className={input} value={g.status ?? "pending"} onChange={(e) => patchGuest(idx, { status: e.target.value })}>
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className={label}>Email</span>
                    <input className={input} value={g.email ?? ""} onChange={(e) => patchGuest(idx, { email: e.target.value })} />
                  </label>
                  <label className="space-y-1">
                    <span className={label}>Phone</span>
                    <input className={input} value={g.phone ?? ""} onChange={(e) => patchGuest(idx, { phone: e.target.value })} />
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className={label}>Address</span>
                    <input className={input} value={g.address ?? ""} onChange={(e) => patchGuest(idx, { address: e.target.value })} />
                  </label>
                  <label className="space-y-1">
                    <span className={label}>Adults</span>
                    <input type="number" min={0} className={input} value={g.adults ?? 1} onChange={(e) => patchGuest(idx, { adults: Number(e.target.value) || 0 })} />
                  </label>
                  <label className="space-y-1">
                    <span className={label}>Children</span>
                    <input type="number" min={0} className={input} value={g.children ?? 0} onChange={(e) => patchGuest(idx, { children: Number(e.target.value) || 0 })} />
                  </label>
                  <label className="space-y-1">
                    <span className={label}>Pets</span>
                    <input type="number" min={0} className={input} value={g.pets ?? 0} onChange={(e) => patchGuest(idx, { pets: Number(e.target.value) || 0 })} />
                  </label>
                  <label className="space-y-1">
                    <span className={label}>T-shirt size</span>
                    <select
                      className={input}
                      value={g.shirtSize ?? ""}
                      onChange={(e) => patchGuest(idx, { shirtSize: e.target.value || undefined })}
                    >
                      <option value="">Not set</option>
                      {SHIRT_SIZES.map((sz) => (
                        <option key={sz} value={sz}>{SHIRT_SIZE_LABELS[sz]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className={label}>Dietary</span>
                    <input className={input} value={g.dietary ?? ""} onChange={(e) => patchGuest(idx, { dietary: e.target.value })} />
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className={label}>Accessibility notes</span>
                    <input className={input} value={g.accessibilityNotes ?? ""} onChange={(e) => patchGuest(idx, { accessibilityNotes: e.target.value })} />
                  </label>

                  {plusOnes.length > 0 && (
                    <div className="sm:col-span-2 space-y-2 rounded-md border bg-secondary/30 p-2">
                      <p className={label}>Plus-ones</p>
                      {plusOnes.map((p, pIdx) => (
                        <div key={pIdx} className="flex flex-wrap items-center gap-2">
                          <input
                            className="flex-1 min-w-[140px] rounded-md border px-2 py-1.5 text-sm"
                            value={p.name ?? ""}
                            placeholder="Guest name"
                            onChange={(e) => patchPlusOne(idx, pIdx, { name: e.target.value })}
                          />
                          <select
                            className="w-28 rounded-md border px-2 py-1.5 text-sm"
                            value={p.isChild ? "child" : "adult"}
                            aria-label={`Age group for plus-one ${pIdx + 1}`}
                            onChange={(e) => patchPlusOne(idx, pIdx, { isChild: e.target.value === "child" })}
                          >
                            <option value="adult">Adult</option>
                            <option value="child">Child</option>
                          </select>
                          <select
                            className="w-40 rounded-md border px-2 py-1.5 text-sm"
                            value={p.shirtSize ?? ""}
                            aria-label={`T-shirt size for plus-one ${pIdx + 1}`}
                            onChange={(e) => patchPlusOne(idx, pIdx, { shirtSize: e.target.value || undefined })}
                          >
                            <option value="">Size not set</option>
                            {SHIRT_SIZES.map((sz) => (
                              <option key={sz} value={sz}>{SHIRT_SIZE_LABELS[sz]}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Changes here are staged, hit “Save changes” to apply them. Every edit is written back into the same event
        data the Raw JSON tab shows.
      </p>
    </div>
  );
}
