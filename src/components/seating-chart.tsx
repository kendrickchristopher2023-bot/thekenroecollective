import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Users, AlertTriangle, FileText, FileDown, GripVertical, Search, ZoomIn, ZoomOut, Maximize2, Sparkles, ShieldAlert, ChevronDown, ChevronRight, Lock, Unlock, Shuffle } from "lucide-react";
import { formatEventDate } from "@/lib/events-store";
import { formatTimestamp } from "@/lib/datetime";
import { VenueMap } from "@/components/venue-map";

function safeAssign(
  eventId: string,
  table: SeatingTable,
  event: KEvent,
  guestId: string,
) {
  const seated = table.guestIds
    .filter((id) => id !== guestId)
    .map((id) => event.guests.find((g) => g.id === id))
    .filter((g): g is Guest => !!g);
  const used = seated.reduce((n, g) => n + partySize(g), 0);
  const guest = event.guests.find((g) => g.id === guestId);
  const need = guest ? partySize(guest) : 1;
  if (used + need > table.capacity) {
    toast.error(`Adding this party would exceed ${table.label}'s ${table.capacity}-seat capacity`);
    return;
  }
  assignGuestToTable(eventId, table.id, guestId);
}

import {
  addSeatingTable,
  addSeatingRule,
  assignGuestToTable,
  removeSeatingRule,
  enforceSeatingRules,
  removeSeatingTable,
  seatingRuleViolations,
  updateSeatingTable,
  placeMemberAtSeat,
  clearMemberSeat,
  shuffleSeating,
  billableAdults,
  partyMemberCount,
  memberRole,
  type Guest,
  type KEvent,
  type SeatingTable,
  type SeatMemberRef,
  type TableShape,
  type VenueElementType,
} from "@/lib/events-store";
import { confirmDialog } from "@/lib/confirm-dialog";


const SHAPES: { id: TableShape; label: string; icon: string; defaultCap: number; rows?: number }[] = [
  { id: "round", label: "Round", icon: "●", defaultCap: 8 },
  { id: "square", label: "Square", icon: "◼", defaultCap: 8 },
  { id: "rectangle", label: "Rectangle", icon: "▭", defaultCap: 10 },
  { id: "head", label: "Head", icon: "★", defaultCap: 6 },
  { id: "lounge", label: "Lounge", icon: "◇", defaultCap: 6 },
  { id: "picnic", label: "Picnic", icon: "🧺", defaultCap: 8 },
  { id: "cocktail", label: "Cocktail", icon: "🥂", defaultCap: 3 },
  { id: "sweetheart", label: "Sweetheart", icon: "❤", defaultCap: 2 },
  { id: "row", label: "Ceremony Row", icon: "═", defaultCap: 8 },
  { id: "stadium", label: "Stadium", icon: "▤", defaultCap: 24, rows: 3 },
  { id: "individual", label: "Individual Seat", icon: "•", defaultCap: 1 },
];

const VENUE_ELEMENTS: { id: VenueElementType; label: string; icon: string }[] = [
  { id: "dance_floor", label: "Dance Floor", icon: "💃" },
  { id: "dj_booth", label: "DJ / Band", icon: "🎧" },
  { id: "buffet", label: "Buffet", icon: "🍽️" },
  { id: "bar", label: "Bar", icon: "🍸" },
  { id: "stage", label: "Stage", icon: "🎤" },
  { id: "gift_table", label: "Gift Table", icon: "🎁" },
  { id: "photo_booth", label: "Photo Booth", icon: "📸" },
  { id: "entrance", label: "Entrance", icon: "🚪" },
];

/** Composite value used in the add dropdown: table shape id, or "element:<type>". */
type AddChoice = TableShape | `element:${VenueElementType}`;


const DRAG_MIME = "application/x-kenroe-guest";
const MEMBER_DRAG_MIME = "application/x-kenroe-member";

function encodeMember(ref: SeatMemberRef): string { return `${ref.guestId}:${ref.memberIndex}`; }
function decodeMember(s: string): SeatMemberRef | null {
  const [guestId, mi] = s.split(":");
  if (!guestId || mi === undefined) return null;
  const memberIndex = Number(mi);
  if (!Number.isFinite(memberIndex)) return null;
  return { guestId, memberIndex };
}


/** Muted brand-appropriate palette for party accents. */
const PARTY_PALETTE = [
  "#7a5d9e", // velvet
  "#b98a5b", // camel
  "#5c8a7b", // sage
  "#c47b7b", // rose
  "#8a8fbf", // periwinkle
  "#a68a4f", // gold
  "#6f8fa3", // slate blue
  "#a86e8f", // mauve
  "#7f8a5c", // olive
  "#b56b52", // terracotta
];

function partyColor(guestId: string): string {
  let h = 0;
  for (let i = 0; i < guestId.length; i++) h = (h * 31 + guestId.charCodeAt(i)) >>> 0;
  return PARTY_PALETTE[h % PARTY_PALETTE.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Seats needed for one party. Named plus-ones are real people who arrive and
// need a chair, so they count here exactly as they do in partyHeadcount().
function namedPlusOnes(g: Guest): number {
  return Array.isArray(g.plusOnes)
    ? g.plusOnes.filter((p) => (p?.name ?? "").trim().length > 0).length
    : 0;
}

function partySize(g: Guest) {
  return partyMemberCount(g);
}

function partyLabel(g: Guest): string | null {
  const extraAdults = Math.max(0, (g.adults ?? 1) - 1) + namedPlusOnes(g);
  const children = Math.max(0, g.children ?? 0);
  const pets = Math.max(0, g.pets ?? 0);
  const extras: string[] = [];
  if (extraAdults > 0) extras.push(`+${extraAdults} adult${extraAdults > 1 ? "s" : ""}`);
  if (children > 0) extras.push(`+${children} kid${children > 1 ? "s" : ""}`);
  if (pets > 0) extras.push(`+${pets} pet${pets > 1 ? "s" : ""}`);
  return extras.length ? extras.join(" ") : null;
}

export type SeatFill = { guest: Guest; memberIndex: number; role: "adult" | "kid" | "pet" };


/** Members of any party that are explicitly placed via seatAssignments anywhere. */
function collectExplicitMembers(event: KEvent): Set<string> {
  const s = new Set<string>();
  for (const t of event.seatingTables ?? []) {
    if (!t.seatAssignments) continue;
    for (const r of Object.values(t.seatAssignments)) s.add(`${r.guestId}:${r.memberIndex}`);
  }
  return s;
}

/** Compute final per-seat fill for a table honoring explicit seatAssignments (overrides) + auto-fill from guestIds excluding members placed elsewhere. */
function computeTableSeats(
  event: KEvent,
  table: SeatingTable,
  capacity: number,
): (SeatFill | null)[] {
  const out: (SeatFill | null)[] = Array.from({ length: capacity }, () => null);
  const explicitAnywhere = collectExplicitMembers(event);
  const localAssigns = table.seatAssignments ?? {};

  // 1) Apply explicit assignments on this table.
  for (const [k, ref] of Object.entries(localAssigns)) {
    const idx = Number(k);
    if (!Number.isFinite(idx) || idx < 0 || idx >= capacity) continue;
    const g = event.guests.find((x) => x.id === ref.guestId);
    if (!g) continue;
    out[idx] = { guest: g, memberIndex: ref.memberIndex, role: memberRole(g, ref.memberIndex) };
  }

  // 2) Auto-fill remaining seats from guestIds, skipping members placed elsewhere.
  const seatedGuests = table.guestIds
    .map((id) => event.guests.find((g) => g.id === id))
    .filter((g): g is Guest => !!g);

  const queue: SeatFill[] = [];
  for (const g of seatedGuests) {
    const total = partyMemberCount(g);
    for (let mi = 0; mi < total; mi++) {
      const key = `${g.id}:${mi}`;
      if (explicitAnywhere.has(key)) continue; // placed explicitly somewhere
      queue.push({ guest: g, memberIndex: mi, role: memberRole(g, mi) });
    }
  }
  for (let i = 0; i < capacity && queue.length > 0; i++) {
    if (out[i] == null) out[i] = queue.shift()!;
  }
  return out;
}

const ROLE_META: Record<"adult" | "kid" | "pet", { label: string; short: string; bg: string; ring: string; text: string }> = {
  adult: { label: "Adult", short: "A", bg: "bg-velvet/15", ring: "ring-velvet/40", text: "text-velvet" },
  kid:   { label: "Kid",   short: "K", bg: "bg-amber-100",  ring: "ring-amber-300", text: "text-amber-800" },
  pet:   { label: "Pet",   short: "🐾", bg: "bg-emerald-100", ring: "ring-emerald-300", text: "text-emerald-800" },
};


export function SeatingChartPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const [newLabel, setNewLabel] = useState("");
  const [newChoice, setNewChoice] = useState<AddChoice>("round");
  const [newQty, setNewQty] = useState(1);
  const [newArea, setNewArea] = useState<string>("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [hoverParty, setHoverParty] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [ruleType, setRuleType] = useState<"together" | "apart">("together");
  const [ruleA, setRuleA] = useState<string>("");
  const [ruleB, setRuleB] = useState<string>("");
  const allTables = event.seatingTables ?? [];
  const tables = allTables.filter((t) => t.kind !== "element");
  const elements = allTables.filter((t) => t.kind === "element");
  const guests = event.guests;

  // Distinct areas from all tables/elements.
  const areas = useMemo(() => {
    const s = new Set<string>();
    for (const t of allTables) if (t.area && t.area.trim()) s.add(t.area.trim());
    return Array.from(s).sort();
  }, [allTables]);

  const assignedIds = useMemo(
    () => new Set(tables.flatMap((t) => t.guestIds)),
    [tables],
  );
  const unassigned = guests.filter((g) => !assignedIds.has(g.id) && g.status !== "no");
  const filteredUnassigned = search.trim()
    ? unassigned.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()))
    : unassigned;
  const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);
  const totalSeated = tables.reduce(
    (sum, t) =>
      sum +
      t.guestIds
        .map((id) => guests.find((g) => g.id === id))
        .filter((g): g is Guest => !!g)
        .reduce((acc, g) => acc + partySize(g), 0),
    0,
  );
  const totalUnassignedSeats = unassigned.reduce((sum, g) => sum + partySize(g), 0);
  const violations = useMemo(() => seatingRuleViolations(event), [event]);
  const rules = event.seatingRules ?? [];

  // Reconcile older saved charts once they open. Previously, a together rule
  // only produced a warning and did not repair the actual chair order.
  useEffect(() => {
    enforceSeatingRules(eventId);
  }, [eventId, event.seatingRules, event.seatingTables]);

  function add() {
    const extras: Partial<SeatingTable> = {};
    if (newArea.trim()) extras.area = newArea.trim();

    if (newChoice.startsWith("element:")) {
      const type = newChoice.slice("element:".length) as VenueElementType;
      const meta = VENUE_ELEMENTS.find((v) => v.id === type);
      const label = newLabel.trim() || meta?.label || "Element";
      addSeatingTable(eventId, label, "rectangle", 0, { ...extras, kind: "element", elementType: type });
    } else {
      const shape = newChoice as TableShape;
      const shapeMeta = SHAPES.find((s) => s.id === shape) ?? SHAPES[0];
      const qty = shape === "individual" ? Math.max(1, Math.min(50, newQty)) : 1;
      for (let i = 0; i < qty; i++) {
        const base = newLabel.trim() || `${shapeMeta.label} ${tables.length + 1 + i}`;
        const label = qty > 1 ? `${base} ${i + 1}` : base;
        const t = addSeatingTable(eventId, label, shape, shapeMeta.defaultCap, extras);
        const patch: Partial<SeatingTable> = {};
        if (shapeMeta.rows) patch.rows = shapeMeta.rows;
        if (shape === "stadium") patch.perRow = Math.ceil(shapeMeta.defaultCap / (shapeMeta.rows ?? 3));
        if (shape === "row") { patch.rows = 1; patch.perRow = shapeMeta.defaultCap; }
        if (Object.keys(patch).length) updateSeatingTable(eventId, t.id, patch);
      }
    }
    setNewLabel("");
    setNewQty(1);
  }

  /** Seat this party into the first non-locked table with enough contiguous free seats. */
  function seatPartyTogether(g: Guest) {
    const need = partySize(g);
    for (const t of tables) {
      if (t.locked) continue;
      const seated = t.guestIds
        .map((id) => guests.find((x) => x.id === id))
        .filter((x): x is Guest => !!x);
      const used = seated.reduce((acc, x) => acc + partySize(x), 0);
      if (t.capacity - used >= need) {
        assignGuestToTable(eventId, t.id, g.id);
        return;
      }
    }
    const firstOpen = tables.find((t) => !t.locked);
    if (firstOpen) toast.error(`No open table has room for ${g.name}'s party of ${need}`);
  }

  async function onShuffle() {
    const ok = await confirmDialog({
      title: "Randomly redistribute all attending guests across tables?",
      body: "Locked tables are untouched. Keep-together rules will be respected where possible.",
      confirmLabel: "Shuffle seating",
    });
    if (!ok) return;
    shuffleSeating(eventId);
  }


  function submitRule() {
    if (!ruleA || !ruleB || ruleA === ruleB) return;
    addSeatingRule(eventId, { type: ruleType, guestAId: ruleA, guestBId: ruleB });
    setRuleA("");
    setRuleB("");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-velvet/15 bg-velvet/5 p-4 text-sm text-ink/80">
        💡 Add tables and venue elements, then <strong>drag guests</strong> onto tables. Hover a party
        to spot their chairs across the layout. Add "keep together" / "keep apart" rules to catch
        misplacements at a glance.
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Tables" value={tables.length} />
        <Stat label="Seats used" value={`${totalSeated} / ${totalCapacity}`} />
        <Stat
          label="Unassigned seats"
          value={totalUnassignedSeats}
          tone={totalUnassignedSeats > 0 ? "warn" : "ok"}
        />
      </div>

      {violations.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <ShieldAlert className="h-4 w-4" /> Seating rule {violations.length === 1 ? "violation" : "violations"}
          </div>
          <ul className="mt-1.5 list-disc pl-5 text-xs">
            {violations.map((v) => (
              <li key={v.rule.id}>{v.reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-ink/5 bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={newChoice}
            onChange={(e) => setNewChoice(e.target.value as AddChoice)}
            className="rounded-full bg-secondary px-3 py-2 text-sm"
          >
            <optgroup label="Tables">
              {SHAPES.map((s) => (
                <option key={s.id} value={s.id}>{s.icon} {s.label}</option>
              ))}
            </optgroup>
            <optgroup label="— Venue elements —">
              {VENUE_ELEMENTS.map((v) => (
                <option key={v.id} value={`element:${v.id}`}>{v.icon} {v.label}</option>
              ))}
            </optgroup>
          </select>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={newChoice.startsWith("element:") ? "Element name (optional)" : "Table name (optional)"}
            className="flex-1 rounded-full bg-secondary px-4 py-2 text-sm focus:outline-none"
          />
          {newChoice === "individual" && (
            <label className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs">
              qty
              <input
                type="number"
                min={1}
                max={50}
                value={newQty}
                onChange={(e) => setNewQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="w-14 rounded bg-secondary px-1.5 py-0.5 text-xs"
              />
            </label>
          )}
          <input
            list="atelier-areas"
            value={newArea}
            onChange={(e) => setNewArea(e.target.value)}
            placeholder="Area (optional)"
            className="w-40 rounded-full bg-secondary px-3 py-2 text-xs"
          />
          <datalist id="atelier-areas">
            {["Ceremony", "Reception", "Cocktail Hour", ...areas].map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <button
            onClick={add}
            className="inline-flex items-center gap-1.5 rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
          {tables.length > 1 && (
            <button
              type="button"
              onClick={onShuffle}
              className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-2 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-ink/5"
              title="Randomly redistribute attending guests"
            >
              <Shuffle className="h-3.5 w-3.5" /> Shuffle seating
            </button>
          )}
        </div>
      </div>


      {/* Seating rules */}
      <div className="rounded-2xl border border-ink/5 bg-card p-5">
        <button
          type="button"
          onClick={() => setRulesOpen((v) => !v)}
          className="flex w-full items-center gap-2 text-left"
        >
          {rulesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-serif text-base">Seating rules</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
            {rules.length} {rules.length === 1 ? "rule" : "rules"}
          </span>
          {violations.length > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
              <AlertTriangle className="h-3 w-3" /> {violations.length} violation{violations.length === 1 ? "" : "s"}
            </span>
          )}
        </button>
        {rulesOpen && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value as "together" | "apart")}
                className="rounded-full bg-secondary px-3 py-2 text-xs"
              >
                <option value="together">Keep together</option>
                <option value="apart">Keep apart</option>
              </select>
              <select
                value={ruleA}
                onChange={(e) => setRuleA(e.target.value)}
                className="rounded-full bg-secondary px-3 py-2 text-xs"
              >
                <option value="">Guest A…</option>
                {guests.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                {ruleType === "together" ? "with" : "away from"}
              </span>
              <select
                value={ruleB}
                onChange={(e) => setRuleB(e.target.value)}
                className="rounded-full bg-secondary px-3 py-2 text-xs"
              >
                <option value="">Guest B…</option>
                {guests.filter((g) => g.id !== ruleA).map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={submitRule}
                disabled={!ruleA || !ruleB || ruleA === ruleB}
                className="inline-flex items-center gap-1 rounded-full bg-velvet px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                <Plus className="h-3 w-3" /> Add rule
              </button>
            </div>
            {rules.length === 0 ? (
              <p className="text-xs text-muted-foreground">No rules yet. Add pairings that must sit together or apart.</p>
            ) : (
              <ul className="space-y-1.5">
                {rules.map((r) => {
                  const gA = guests.find((g) => g.id === r.guestAId);
                  const gB = guests.find((g) => g.id === r.guestBId);
                  const violated = violations.some((v) => v.rule.id === r.id);
                  return (
                    <li
                      key={r.id}
                      className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs ring-1 ${violated ? "bg-amber-50 ring-amber-200" : "bg-secondary/50 ring-transparent"}`}
                    >
                      <span>
                        <span className="rounded-full bg-card px-2 py-0.5 text-[10px] ring-1 ring-ink/10">
                          {r.type === "together" ? "Together" : "Apart"}
                        </span>{" "}
                        <span className="font-medium">{gA?.name ?? "?"}</span>
                        <span className="mx-1 text-muted-foreground">{r.type === "together" ? "+" : "×"}</span>
                        <span className="font-medium">{gB?.name ?? "?"}</span>
                        {violated && <span className="ml-2 text-[10px] text-amber-700">violated</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSeatingRule(eventId, r.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remove rule"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>



      <DropZone
        tableId={null}
        onDrop={(guestId) => assignGuestToTable(eventId, null, guestId)}
        className={`rounded-2xl border ${unassigned.length > 0 ? "border-amber-300/50 bg-amber-50/60" : "border-emerald-300/40 bg-emerald-50/40"} p-5`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Users className={`h-4 w-4 ${unassigned.length > 0 ? "text-amber-700" : "text-emerald-700"}`} />
          <h3 className={`font-serif text-base ${unassigned.length > 0 ? "text-amber-900" : "text-emerald-900"}`}>
            Unseated tray
          </h3>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${unassigned.length > 0 ? "bg-amber-200 text-amber-900" : "bg-emerald-200 text-emerald-900"}`}>
            {unassigned.length} unseated
          </span>
          <span className="text-xs text-muted-foreground">— drop here to remove from a table</span>
          <div className="ml-auto flex items-center gap-1 rounded-full bg-card/70 px-2 py-1 text-xs ring-1 ring-ink/10">
            <Search className="h-3 w-3 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search guests…"
              className="w-32 bg-transparent focus:outline-none"
            />
          </div>
        </div>
        {unassigned.length === 0 ? (
          <p className="mt-2 text-xs text-emerald-800">Everyone has a seat ✨</p>
        ) : filteredUnassigned.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No guests match "{search}".</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {filteredUnassigned.map((g) => (
              <GuestChip
                key={g.id}
                guest={g}
                onDragStart={() => setDragId(g.id)}
                onDragEnd={() => setDragId(null)}
                dragging={dragId === g.id}
                onSeatTogether={tables.length > 0 ? () => seatPartyTogether(g) : undefined}
                onHover={setHoverParty}
              />
            ))}
          </div>
        )}
      </DropZone>

      {tables.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Zoom</span>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
            className="rounded-full bg-secondary p-1.5 hover:bg-ink/10"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
            className="rounded-full bg-secondary p-1.5 hover:bg-ink/10"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs hover:bg-ink/10"
            aria-label="Fit"
          >
            <Maximize2 className="h-3 w-3" /> Fit
          </button>
        </div>
      )}

      <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: `${100 / zoom}%` }}>
        {(() => {
          // Group tables + elements by area. "" = Unzoned.
          const groupOrder: string[] = [];
          const groups = new Map<string, SeatingTable[]>();
          for (const t of allTables) {
            const key = (t.area ?? "").trim();
            if (!groups.has(key)) { groups.set(key, []); groupOrder.push(key); }
            groups.get(key)!.push(t);
          }
          // Move "" (Unzoned) to the end when there are named areas.
          if (groups.has("") && groupOrder.length > 1) {
            const idx = groupOrder.indexOf("");
            groupOrder.splice(idx, 1);
            groupOrder.push("");
          }
          const onlyUnzoned = groupOrder.length === 1 && groupOrder[0] === "";
          return groupOrder.map((key) => {
            const items = groups.get(key) ?? [];
            const tablesInGroup = items.filter((t) => t.kind !== "element");
            const elsInGroup = items.filter((t) => t.kind === "element");
            const cap = tablesInGroup.reduce((n, t) => n + t.capacity, 0);
            const used = tablesInGroup.reduce((n, t) => {
              const s = t.guestIds.map((id) => guests.find((g) => g.id === id)).filter((g): g is Guest => !!g);
              return n + s.reduce((a, g) => a + partySize(g), 0);
            }, 0);
            return (
              <section key={key || "__unzoned"} className="mb-6">
                {!onlyUnzoned && (
                  <div className="mb-2 flex items-baseline gap-2">
                    <h3 className="font-serif text-lg text-ink">{key || "Unzoned"}</h3>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {tablesInGroup.length} table{tablesInGroup.length === 1 ? "" : "s"} · {used}/{cap} seats
                    </span>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {tablesInGroup.map((t) => (
                    <TableCard
                      key={t.id}
                      table={t}
                      event={event}
                      eventId={eventId}
                      dragId={dragId}
                      setDragId={setDragId}
                      hoverParty={hoverParty}
                      setHoverParty={setHoverParty}
                      areas={areas}
                    />
                  ))}
                  {elsInGroup.map((el) => (
                    <VenueElementCard key={el.id} element={el} eventId={eventId} areas={areas} />
                  ))}
                </div>
              </section>
            );
          });
        })()}
      </div>

      <VenueMap event={event} eventId={eventId} />





      {tables.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => exportRunOfShow(event, "word")}
            className="inline-flex items-center gap-1.5 rounded-full bg-card px-4 py-2 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-ink/5"
          >
            <FileText className="h-3.5 w-3.5" /> Export to Word
          </button>
          <button
            type="button"
            onClick={() => exportRunOfShow(event, "pdf")}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-90"
          >
            <FileDown className="h-3.5 w-3.5" /> Export to PDF
          </button>
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildRunOfShowHtml(event: KEvent): string {
  const blocks = [...(event.timelineBlocks ?? [])].sort((a, b) => a.time.localeCompare(b.time));
  const tables = (event.seatingTables ?? []).filter((t) => t.kind !== "element");
  const d = formatEventDate(event.date, event.timezone);
  const hosts = event.hosts?.length ? event.hosts.map((h) => h.name).join(", ") : "";

  const timelineRows = blocks.length
    ? blocks
        .map(
          (b) => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:monospace;white-space:nowrap;">${escapeHtml(b.time)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;">
            <div style="font-family:Georgia,serif;">${escapeHtml(b.title)}</div>
            ${b.durationMin ? `<div style="font-size:11px;color:#666;">${b.durationMin} min</div>` : ""}
          </td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(b.owner ?? "—")}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;color:#555;">${escapeHtml(b.notes ?? "")}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" style="padding:8px;color:#888;font-size:13px;">No timeline blocks added yet.</td></tr>`;

  const renderTableHtml = (t: SeatingTable) => {
    const seated = t.guestIds
      .map((id) => event.guests.find((g) => g.id === id))
      .filter((g): g is NonNullable<typeof g> => !!g);
    const totalSeated = seated.reduce((sum, g) => sum + partySize(g), 0);
    const items = seated
      .map((g) => {
        const a = billableAdults(g);
        const k = Math.max(0, g.children ?? 0);
        const p = Math.max(0, g.pets ?? 0);
        const badge = (n: number, txt: string, color: string) =>
          n > 0
            ? `<span style="display:inline-block;margin-left:4px;padding:1px 6px;border-radius:9999px;background:${color};font-size:10px;">${n}× ${txt}</span>`
            : "";
        const badges = `${badge(a, "Adult", "#efe8f5")}${badge(k, "Kid", "#fdf1d1")}${badge(p, "Pet", "#d7f4e3")}`;
        const dietaryText = g.dietary
          ? ` <span style="color:#777;font-size:11px;">(${escapeHtml(g.dietary)})</span>`
          : "";
        return `<li>${escapeHtml(g.name)}${badges}${dietaryText}</li>`;
      })
      .join("");
    return `
      <div style="border:1px solid #ddd;border-radius:6px;padding:10px;margin:8px 0;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <div style="font-family:Georgia,serif;font-size:15px;">${escapeHtml(t.label)}${t.locked ? ' <span style="font-size:10px;color:#7a5d9e;">(locked)</span>' : ''}</div>
          <div style="font-size:11px;color:#666;">${totalSeated} / ${t.capacity} · ${escapeHtml(t.shape)}</div>
        </div>
        <ol style="margin:6px 0 0 20px;padding:0;font-size:13px;">${items}</ol>
      </div>`;
  };

  // Group tables by area for export.
  const areasOrder: string[] = [];
  const grouped = new Map<string, SeatingTable[]>();
  for (const t of tables) {
    const k = (t.area ?? "").trim();
    if (!grouped.has(k)) { grouped.set(k, []); areasOrder.push(k); }
    grouped.get(k)!.push(t);
  }
  if (grouped.has("") && areasOrder.length > 1) {
    const idx = areasOrder.indexOf("");
    areasOrder.splice(idx, 1);
    areasOrder.push("");
  }
  const onlyUnzoned = areasOrder.length === 1 && areasOrder[0] === "";

  const seatingHtml = tables.length
    ? `
      <h2 style="font-family:Georgia,serif;font-size:18px;margin:24px 0 8px;">Seating</h2>
      ${areasOrder
        .map((area) => {
          const list = (grouped.get(area) ?? []).map(renderTableHtml).join("");
          if (onlyUnzoned) return list;
          const cap = (grouped.get(area) ?? []).reduce((n, t) => n + t.capacity, 0);
          return `
            <h3 style="font-family:Georgia,serif;font-size:14px;margin:16px 0 4px;color:#333;">
              ${escapeHtml(area || "Unzoned")}
              <span style="font-size:11px;color:#888;font-weight:normal;">· ${cap} seats</span>
            </h3>
            ${list}`;
        })
        .join("")}`
    : "";



  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(event.title)} — Run of Show</title></head>
<body style="font-family:Georgia,serif;color:#111;max-width:760px;margin:0 auto;padding:24px;">
  <div style="border-bottom:1px solid #ccc;padding-bottom:12px;margin-bottom:16px;">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#777;">Run of Show</div>
    <h1 style="font-family:Georgia,serif;font-size:26px;margin:4px 0;">${escapeHtml(event.title)}</h1>
    <div style="font-size:13px;color:#555;">${escapeHtml(d.long)} · ${escapeHtml(d.time)} · ${escapeHtml(event.venue)}${event.address ? " · " + escapeHtml(event.address) : ""}</div>
    ${hosts ? `<div style="font-size:12px;color:#777;margin-top:4px;">Hosts: ${escapeHtml(hosts)}</div>` : ""}
  </div>

  <h2 style="font-family:Georgia,serif;font-size:18px;margin:8px 0;">Timeline</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#777;border-bottom:1px solid #ccc;">
        <th style="padding:6px 8px;">Time</th><th style="padding:6px 8px;">Block</th><th style="padding:6px 8px;">Owner</th><th style="padding:6px 8px;">Notes</th>
      </tr>
    </thead>
    <tbody>${timelineRows}</tbody>
  </table>

  ${seatingHtml}

  <div style="margin-top:32px;border-top:1px solid #eee;padding-top:8px;font-size:11px;color:#888;">
    Generated by The Kenroe Collective · ${formatTimestamp(new Date())}
  </div>
</body></html>`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportRunOfShow(event: KEvent, format: "word" | "pdf") {
  const html = buildRunOfShowHtml(event);
  const safeName = (event.title || "run-of-show").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  if (format === "word") {
    const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">${html.replace(/^<!DOCTYPE html>|<\/?html>|<head>[\s\S]*?<\/head>/g, "")}</html>`;
    const blob = new Blob(["\ufeff", wordHtml], { type: "application/msword" });
    downloadBlob(blob, `${safeName}-run-of-show.doc`);
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) { document.body.removeChild(iframe); return; }
  doc.open();
  doc.write(html);
  doc.close();
  const trigger = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 1000);
    }
  };
  if (iframe.contentDocument?.readyState === "complete") trigger();
  else iframe.onload = trigger;
}

function Stat({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "ok" | "warn" }) {
  const ring = tone === "warn" ? "ring-amber-300/60" : tone === "ok" ? "ring-emerald-300/40" : "ring-ink/5";
  return (
    <div className={`rounded-2xl bg-card p-4 ring-1 ${ring}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-serif text-2xl">{value}</div>
    </div>
  );
}

function GuestChip({
  guest,
  onDragStart,
  onDragEnd,
  dragging,
  onSeatTogether,
  onHover,
}: {
  guest: Guest;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
  onSeatTogether?: () => void;
  onHover?: (id: string | null) => void;
}) {
  const party = partyLabel(guest);
  const size = partySize(guest);
  const color = partyColor(guest.id);
  return (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(DRAG_MIME, guest.id);
        e.dataTransfer.setData("text/plain", guest.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => onHover?.(guest.id)}
      onMouseLeave={() => onHover?.(null)}
      title={`${guest.name}${party ? ` (${party})` : ""} — ${size} seat${size > 1 ? "s" : ""}`}
      className={`group inline-flex cursor-grab items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs ring-1 ring-amber-300/50 transition active:cursor-grabbing ${dragging ? "opacity-40" : "hover:ring-velvet/40"}`}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <GripVertical className="h-3 w-3 text-muted-foreground/70" />
      <span className="font-medium">{guest.name}</span>
      {party && <span className="text-[10px] text-velvet">{party}</span>}
      {guest.dietary && <span className="text-[10px] text-amber-700" title={guest.dietary}>•</span>}
      {onSeatTogether && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSeatTogether(); }}
          className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-velvet/10 px-1.5 py-0.5 text-[9px] font-semibold text-velvet hover:bg-velvet/20"
          title="Seat this whole party together in the first available table"
        >
          <Sparkles className="h-2.5 w-2.5" /> Seat together
        </button>
      )}
    </span>
  );
}

function DropZone({
  tableId,
  onDrop,
  className,
  children,
}: {
  tableId: string | null;
  onDrop: (guestId: string) => void;
  className: string;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME) || e.dataTransfer.types.includes("text/plain")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData("text/plain");
        if (id) onDrop(id);
      }}
      className={`${className} ${over ? "ring-2 ring-velvet/60 ring-offset-2" : ""} transition`}
      data-table-id={tableId ?? "unassigned"}
    >
      {children}
    </div>
  );
}

function CapInput({ capacity, onCommit }: { capacity: number; onCommit: (c: number) => void }) {
  const [draft, setDraft] = useState<string>(String(capacity));
  useEffect(() => {
    setDraft(String(capacity));
  }, [capacity]);
  const commit = (next: number | null) => {
    if (next == null) {
      setDraft(String(capacity));
      return;
    }
    const capped = Math.min(200, next);
    setDraft(String(capped));
    if (capped !== capacity) onCommit(capped);
  };
  return (
    <label className="inline-flex items-center gap-1">
      <span>Seats</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        min={1}
        max={200}
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          if (v !== "" && !/^\d+$/.test(v)) return;
          if (v === "0") return;
          setDraft(v);
          const parsed = v === "" ? null : Number(v);
          if (parsed != null && parsed >= 1) commit(parsed);
        }}
        onBlur={(e) => commit(e.target.value === "" ? null : Number(e.target.value))}
        aria-label="Table seats (capacity)"
        className="w-14 rounded bg-secondary px-1.5 py-0.5 text-xs"
      />
    </label>
  );
}

function BoundedNumberInput({
  value,
  max,
  ariaLabel,
  onCommit,
}: {
  value: number;
  max: number;
  ariaLabel: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string>(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const commit = (next: number | null) => {
    if (next == null) {
      setDraft(String(value));
      return;
    }
    const bounded = Math.min(max, next);
    setDraft(String(bounded));
    if (bounded !== value) onCommit(bounded);
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      min={1}
      max={max}
      value={draft}
      onChange={(e) => {
        const v = e.target.value;
        if (v !== "" && !/^\d+$/.test(v)) return;
        if (v === "0") return;
        setDraft(v);
        const parsed = v === "" ? null : Number(v);
        if (parsed != null && parsed >= 1) commit(parsed);
      }}
      onBlur={(e) => commit(e.target.value === "" ? null : Number(e.target.value))}
      aria-label={ariaLabel}
      className="w-12 rounded bg-secondary px-1.5 py-0.5 text-xs"
    />
  );
}

function TableCard({
  table,
  event,
  eventId,
  dragId,
  setDragId,
  hoverParty,
  setHoverParty,
  areas,
}: {
  table: SeatingTable;
  event: KEvent;
  eventId: string;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  hoverParty: string | null;
  setHoverParty: (id: string | null) => void;
  areas: string[];
}) {

  const seated = table.guestIds
    .map((id) => event.guests.find((g) => g.id === id))
    .filter((g): g is Guest => !!g);
  // Count real occupied seats (explicit per-member placements + auto-fill), not
  // just whole parties in guestIds — members moved here individually count too.
  const seatsUsed = useMemo(() => {
    const explicitMaxKey = table.seatAssignments
      ? Math.max(-1, ...Object.keys(table.seatAssignments).map((k) => Number(k)).filter((n) => Number.isFinite(n)))
      : -1;
    const autoNeeded = seated.reduce((n, g) => n + partyMemberCount(g), 0);
    const cap = Math.max(table.capacity, explicitMaxKey + 1, autoNeeded);
    return computeTableSeats(event, table, cap).filter(Boolean).length;
  }, [event, table, seated]);
  const over = seatsUsed > table.capacity;

  // Kids' table hint: every seated person is a kid, at least 2 kids, no adults, no pets.
  const totalAdults = seated.reduce((n, g) => n + billableAdults(g), 0);
  const totalKids = seated.reduce((n, g) => n + Math.max(0, g.children ?? 0), 0);
  const totalPets = seated.reduce((n, g) => n + Math.max(0, g.pets ?? 0), 0);
  const isKidsTable = seated.length > 0 && totalKids >= 2 && totalKids > totalAdults && totalPets === 0;


  const assignedIds = new Set((event.seatingTables ?? []).flatMap((t) => t.guestIds));
  const candidates = event.guests.filter((g) => !assignedIds.has(g.id) && g.status !== "no");

  const isIndividual = table.shape === "individual";
  const isSweetheart = table.shape === "sweetheart";

  return (
    <DropZone
      tableId={table.id}
      onDrop={(guestId) => safeAssign(eventId, table, event, guestId)}
      className={`rounded-2xl bg-card p-5 ring-1 ${over ? "ring-red-300" : table.locked ? "ring-velvet/40" : "ring-ink/5"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <input
              value={table.label}
              onChange={(e) => updateSeatingTable(eventId, table.id, { label: e.target.value })}
              className="w-full bg-transparent font-serif text-lg outline-none"
            />
            {table.locked && (
              <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-velvet/10 px-2 py-0.5 text-[10px] font-medium text-velvet ring-1 ring-velvet/30" title="Locked from shuffle & auto-seat">
                <Lock className="h-2.5 w-2.5" /> Locked
              </span>
            )}
            {isKidsTable && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-300" title="This table is mostly kids">
                Kids' table 🎈
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">

            <select
              value={table.shape}
              onChange={(e) => {
                const shape = e.target.value as TableShape;
                const meta = SHAPES.find((s) => s.id === shape);
                const patch: Partial<SeatingTable> = { shape };
                if (shape === "individual") patch.capacity = 1;
                else if (shape === "sweetheart") patch.capacity = 2;
                if (meta?.rows) patch.rows = meta.rows;
                updateSeatingTable(eventId, table.id, patch);
              }}
              className="rounded-full bg-secondary px-2 py-0.5 text-[11px]"
            >
              {SHAPES.map((s) => (
                <option key={s.id} value={s.id}>{s.icon} {s.label}</option>
              ))}
            </select>
            {!isIndividual && !isSweetheart && (
              <CapInput
                capacity={table.capacity}
                onCommit={(c) => {
                  const patch: Partial<SeatingTable> = { capacity: c };
                  if (table.shape === "row") { patch.rows = table.rows ?? 1; patch.perRow = Math.ceil(c / (table.rows ?? 1)); }
                  if (table.shape === "stadium") { patch.rows = table.rows ?? 3; patch.perRow = Math.ceil(c / (table.rows ?? 3)); }
                  updateSeatingTable(eventId, table.id, patch);
                }}
              />
            )}
            {(table.shape === "stadium" || table.shape === "row") && (
              <>
                <label className="inline-flex items-center gap-1">
                  rows
                  <BoundedNumberInput
                    value={table.rows ?? (table.shape === "row" ? 1 : 3)}
                    max={20}
                    ariaLabel="Table rows"
                    onCommit={(rows) => {
                      const perRow = table.perRow ?? Math.ceil(table.capacity / rows);
                      updateSeatingTable(eventId, table.id, { rows, perRow, capacity: rows * perRow });
                    }}
                  />
                </label>
                <label className="inline-flex items-center gap-1">
                  per row
                  <BoundedNumberInput
                    value={table.perRow ?? Math.ceil(table.capacity / (table.rows ?? (table.shape === "row" ? 1 : 3)))}
                    max={50}
                    ariaLabel="Seats per row"
                    onCommit={(perRow) => {
                      const rows = table.rows ?? (table.shape === "row" ? 1 : 3);
                      updateSeatingTable(eventId, table.id, { rows, perRow, capacity: rows * perRow });
                    }}
                  />
                </label>
              </>
            )}
            <input
              list="atelier-areas"
              value={table.area ?? ""}
              onChange={(e) => updateSeatingTable(eventId, table.id, { area: e.target.value })}
              placeholder="area"
              className="w-24 rounded-full bg-secondary px-2 py-0.5 text-[11px]"
              title="Area / zone"
            />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => updateSeatingTable(eventId, table.id, { locked: !table.locked })}
            className={`rounded-full p-1.5 ${table.locked ? "text-velvet hover:bg-velvet/10" : "text-muted-foreground hover:bg-secondary"}`}
            aria-label={table.locked ? "Unlock table" : "Lock table"}
            title={table.locked ? "Unlock (shuffle & auto-seat will use this table)" : "Lock (protect from shuffle & auto-seat)"}
          >
            {table.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={async () => {
              if (await confirmDialog({ title: `Remove "${table.label}"? Guests will go back to unassigned.` })) {
                removeSeatingTable(eventId, table.id);
              }
            }}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className={`mt-3 flex items-center gap-2 text-[11px] font-medium ${over ? "text-red-600" : "text-velvet"}`}>
        <span>{seatsUsed} / {table.capacity} seats</span>
        {over && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-red-700">
            <AlertTriangle className="h-3 w-3" /> over capacity
          </span>
        )}
      </div>

      <ChairRing table={table} event={event} eventId={eventId} hoverParty={hoverParty} setHoverParty={setHoverParty} setDragId={setDragId} />


      <ul className="mt-3 space-y-1.5">
        {seated.map((g) => {
          const party = partyLabel(g);
          const size = partySize(g);
          const color = partyColor(g.id);
          const active = hoverParty === g.id;
          return (
            <li key={g.id} className="space-y-1">
              <div
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData(DRAG_MIME, g.id);
                  e.dataTransfer.setData("text/plain", g.id);
                  setDragId(g.id);
                }}
                onDragEnd={() => setDragId(null)}
                onMouseEnter={() => setHoverParty(g.id)}
                onMouseLeave={() => setHoverParty(null)}
                className={`flex cursor-grab items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs transition active:cursor-grabbing ${active ? "bg-velvet/10 ring-1 ring-velvet/50" : "bg-secondary/50 ring-1 ring-transparent hover:ring-velvet/30"} ${dragId === g.id ? "opacity-40" : ""}`}
                title={`Drag to move ${g.name} to another table`}
              >
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                  <GripVertical className="h-3 w-3 text-muted-foreground/70" />
                  <span className="truncate font-medium">{g.name}</span>
                  {(["adult", "kid", "pet"] as const).map((r) => {
                    const n = r === "adult" ? billableAdults(g) : r === "kid" ? Math.max(0, g.children ?? 0) : Math.max(0, g.pets ?? 0);
                    if (n <= 0) return null;
                    const m = ROLE_META[r];
                    return (
                      <span key={r} className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ${m.bg} ${m.ring} ${m.text}`}>
                        {n}× {m.short}
                      </span>
                    );
                  })}
                  {size > 1 && (
                    <span className="rounded-full bg-velvet/10 px-1.5 py-0.5 text-[10px] text-velvet">
                      party of {size}
                    </span>
                  )}
                  {g.dietary && <span className="text-velvet" title={g.dietary}>•</span>}
                </span>
                <button
                  onClick={() => assignGuestToTable(eventId, null, g.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${g.name} from ${table.label}`}
                >
                  ✕
                </button>
              </div>
              {(party || g.dietary) && (
                <div className="pl-6 text-[10px] text-muted-foreground">
                  {party && (
                    <span>
                      {party} <span className="text-muted-foreground/70">(guest{(g.adults ?? 0) + (g.children ?? 0) > 1 ? "s" : ""} of {g.name})</span>
                    </span>
                  )}
                  {party && g.dietary && <span> · </span>}
                  {g.dietary && <span>dietary: {g.dietary}</span>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {candidates.length > 0 && (() => {
        const options = candidates;
        if (options.length === 0) return null;
        return (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) safeAssign(eventId, table, event, e.target.value);
            }}
            className="mt-3 w-full rounded-full bg-velvet/10 px-3 py-1.5 text-xs text-velvet"
          >
            <option value="">+ Add guest to {table.label}…</option>
            {options.map((g) => {
              const size = partySize(g);
              return (
                <option key={g.id} value={g.id}>
                  {g.name}{size > 1 ? ` (party of ${size})` : ""}
                </option>
              );
            })}
          </select>
        );
      })()}
    </DropZone>
  );
}

function ChairRing({
  table,
  event,
  eventId,
  hoverParty,
  setHoverParty,
  setDragId,
}: {
  table: SeatingTable;
  event: KEvent;
  eventId: string;
  hoverParty: string | null;
  setHoverParty: (id: string | null) => void;
  setDragId: (id: string | null) => void;
}) {
  const shape = table.shape;
  // Ensure capacity fits any explicit seat index or auto-fill overflow.
  const explicitMaxKey = table.seatAssignments
    ? Math.max(-1, ...Object.keys(table.seatAssignments).map((k) => Number(k)).filter((n) => Number.isFinite(n)))
    : -1;
  const seatedGuests = table.guestIds
    .map((id) => event.guests.find((g) => g.id === id))
    .filter((g): g is Guest => !!g);
  const autoNeeded = seatedGuests.reduce((n, g) => n + partyMemberCount(g), 0);
  const capacity = Math.max(table.capacity, explicitMaxKey + 1, autoNeeded);
  const seats = computeTableSeats(event, table, capacity);

  const renderChair = (i: number) => {
    const s = seats[i];
    return (
      <Chair
        key={i}
        role={s?.role ?? undefined}
        guest={s?.guest}
        memberIndex={s?.memberIndex}
        seatIndex={i}
        tableId={table.id}
        eventId={eventId}
        index={i + 1}
        hoverParty={hoverParty}
        setHoverParty={setHoverParty}
        setDragId={setDragId}
      />
    );
  };

  if (shape === "individual") {
    return (
      <div className="mt-3 flex items-center justify-center rounded-xl border border-dashed border-ink/10 bg-secondary/30 p-4">
        {renderChair(0)}
      </div>
    );
  }

  if (shape === "sweetheart") {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-ink/10 bg-secondary/30 p-3">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>Sweetheart</span><RoleKey />
        </div>
        <div className="flex items-center justify-center gap-2">
          {renderChair(0)}
          <span className="h-6 w-8 rounded bg-velvet/10 ring-1 ring-velvet/30" title={table.label} />
          {renderChair(1)}
        </div>
      </div>
    );
  }

  if (shape === "row") {
    const rows = Math.max(1, table.rows ?? 1);
    const perRow = Math.max(1, table.perRow ?? Math.ceil(capacity / rows));
    return (
      <div className="mt-3 rounded-xl border border-dashed border-ink/10 bg-secondary/30 p-3">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>Row · {rows}×{perRow}</span><RoleKey />
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex flex-wrap justify-center gap-1">
              {Array.from({ length: perRow }).map((_, c) => {
                const idx = r * perRow + c;
                if (idx >= capacity) return null;
                return renderChair(idx);
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (shape === "stadium") {
    const rows = Math.max(1, table.rows ?? 3);
    const perRow = Math.max(1, table.perRow ?? Math.ceil(capacity / rows));
    return (
      <div className="mt-3 rounded-xl border border-dashed border-ink/10 bg-secondary/30 p-3">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>Stadium · {rows}×{perRow}</span><RoleKey />
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex flex-wrap justify-center gap-1" style={{ paddingLeft: r * 6, paddingRight: r * 6 }}>
              {Array.from({ length: perRow }).map((_, c) => {
                const idx = r * perRow + c;
                if (idx >= capacity) return null;
                return renderChair(idx);
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (shape === "picnic") {
    const perSide = Math.ceil(capacity / 2);
    return (
      <div className="mt-3 rounded-xl border border-dashed border-ink/10 bg-secondary/30 p-3">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>Picnic · benches</span><RoleKey />
        </div>
        <div className="space-y-1">
          <div className="flex justify-center gap-1">
            {Array.from({ length: perSide }).map((_, i) => renderChair(i))}
          </div>
          <div className="mx-auto h-3 w-[80%] rounded bg-velvet/15 ring-1 ring-velvet/30" title={table.label} />
          <div className="flex justify-center gap-1">
            {Array.from({ length: capacity - perSide }).map((_, i) => renderChair(perSide + i))}
          </div>
        </div>
      </div>
    );
  }

  if (shape === "square") {
    const perSide = Math.ceil(capacity / 4);
    const sides = [0, 1, 2, 3].map((s) =>
      Array.from({ length: perSide }, (_, i) => s * perSide + i).filter((i) => i < capacity),
    );
    return (
      <div className="mt-3 rounded-xl border border-dashed border-ink/10 bg-secondary/30 p-3">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>Square</span><RoleKey />
        </div>
        <div className="mx-auto grid" style={{ gridTemplateColumns: "auto 1fr auto", gridTemplateRows: "auto auto auto", gap: 4, width: "fit-content" }}>
          <div />
          <div className="flex justify-center gap-1">{sides[0].map(renderChair)}</div>
          <div />
          <div className="flex flex-col gap-1">{sides[3].map(renderChair)}</div>
          <div className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md bg-velvet/10 px-2 ring-1 ring-velvet/30">
            <span className="text-center font-serif text-[10px] leading-tight text-velvet">{table.label}</span>
          </div>
          <div className="flex flex-col gap-1">{sides[1].map(renderChair)}</div>
          <div />
          <div className="flex justify-center gap-1">{sides[2].map(renderChair)}</div>
          <div />
        </div>
      </div>
    );
  }

  const circular = shape === "round" || shape === "lounge" || shape === "cocktail";
  if (circular) {
    const size = shape === "cocktail" ? 96 : 128;
    const radius = shape === "cocktail" ? 34 : 48;
    const innerSize = shape === "cocktail" ? 42 : 62;
    return (
      <div className="mt-3 rounded-xl border border-dashed border-ink/10 bg-secondary/30 p-3">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>{shape === "cocktail" ? "Cocktail" : "Chairs"}</span>
          <RoleKey />
        </div>
        <div className="mx-auto" style={{ position: "relative", width: size, height: size }}>
          <div
            className="absolute inset-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-velvet/10 ring-1 ring-velvet/30"
            style={{ width: innerSize, height: innerSize }}
            title={table.label}
          >
            <span className="px-1 text-center font-serif text-[10px] leading-tight text-velvet">
              {table.label}
            </span>
          </div>
          {Array.from({ length: capacity }).map((_, i) => {
            const angle = (i / capacity) * Math.PI * 2 - Math.PI / 2;
            const x = size / 2 + Math.cos(angle) * radius - 11;
            const y = size / 2 + Math.sin(angle) * radius - 11;
            return (
              <div key={i} style={{ position: "absolute", left: x, top: y }}>
                {renderChair(i)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Head: single line (unchanged — correct for head tables) ────────
  if (shape === "head") {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-ink/10 bg-secondary/30 p-3">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>Head table</span><RoleKey />
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {Array.from({ length: capacity }).map((_, i) => renderChair(i))}
        </div>
      </div>
    );
  }

  // ── Rectangle: banquet — chairs along both long sides + optional ends ──
  // Layout: if capacity divides evenly by 2, both sides equal. Otherwise
  // spare seats become end caps (one left, one right) mirroring the square algorithm.
  {
    const ends = capacity % 2; // 0 or 1: one end cap if odd
    const sideTotal = capacity - ends;
    const top = Math.ceil(sideTotal / 2);
    const bottom = sideTotal - top;
    // If we have 2+ leftover (never here since ends<=1 for %2), extend.
    const topIdx = Array.from({ length: top }, (_, i) => i);
    const bottomIdx = Array.from({ length: bottom }, (_, i) => top + i);
    const leftEnd = ends >= 1 ? top + bottom : -1;
    return (
      <div className="mt-3 rounded-xl border border-dashed border-ink/10 bg-secondary/30 p-3">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>Rectangle · banquet</span><RoleKey />
        </div>
        <div className="mx-auto grid items-center" style={{ gridTemplateColumns: "auto 1fr auto", gap: 6, width: "fit-content" }}>
          <div />
          <div className="flex justify-center gap-1">{topIdx.map(renderChair)}</div>
          <div />
          <div className="flex items-center">{leftEnd >= 0 ? renderChair(leftEnd) : <span />}</div>
          <div className="min-h-[36px] rounded bg-velvet/10 ring-1 ring-velvet/30" title={table.label} />
          <div />
          <div />
          <div className="flex justify-center gap-1">{bottomIdx.map(renderChair)}</div>
          <div />
        </div>
      </div>
    );
  }
}

function Chair({
  role,
  guest,
  memberIndex,
  seatIndex,
  tableId,
  eventId,
  index,
  hoverParty,
  setHoverParty,
  setDragId,
}: {
  role?: "adult" | "kid" | "pet";
  guest?: Guest;
  memberIndex?: number;
  seatIndex: number;
  tableId: string;
  eventId: string;
  index: number;
  hoverParty: string | null;
  setHoverParty: (id: string | null) => void;
  setDragId: (id: string | null) => void;
}) {
  const [over, setOver] = useState(false);
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(MEMBER_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(true);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const raw = e.dataTransfer.getData(MEMBER_DRAG_MIME);
    const ref = decodeMember(raw);
    if (ref) {
      // Prevent bubbling to the parent DropZone (which would re-assign the guest party).
      e.stopPropagation();
      placeMemberAtSeat(eventId, tableId, seatIndex, ref);
    }
  };

  if (!role || !guest || memberIndex === undefined) {
    return (
      <span
        onDragOver={onDragOver}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        title={`Seat ${index} · empty (drop a member here)`}
        className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-card text-[9px] text-muted-foreground/60 ring-1 ring-dashed ${over ? "ring-velvet/70" : "ring-ink/20"}`}
      >
        {index}
      </span>
    );
  }
  const meta = ROLE_META[role];
  const color = partyColor(guest.id);
  const active = hoverParty === guest.id;
  const label = initials(guest.name);
  const roleSuffix = memberIndex === 0 ? "" : ` +${memberIndex} (${meta.label.toLowerCase()})`;
  return (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(MEMBER_DRAG_MIME, encodeMember({ guestId: guest.id, memberIndex }));
        // NOTE: intentionally omit text/plain so member drops don't fall through to the party DropZone.
        setDragId(guest.id);
      }}
      onDragEnd={() => setDragId(null)}
      onDragOver={onDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onMouseEnter={() => setHoverParty(guest.id)}
      onMouseLeave={() => setHoverParty(null)}
      title={`Seat ${index} · ${guest.name}${roleSuffix} · ${meta.label}`}
      className={`inline-flex cursor-grab items-center justify-center rounded-full text-[9px] font-semibold transition active:cursor-grabbing ${meta.bg} ${meta.text}`}
      style={{
        width: active ? 26 : 22,
        height: active ? 26 : 22,
        boxShadow: over
          ? `0 0 0 2px #7a5d9e, 0 0 0 4px rgba(0,0,0,0.08)`
          : active
          ? `0 0 0 2px ${color}, 0 0 0 4px rgba(0,0,0,0.05)`
          : `0 0 0 1.5px ${color}`,
      }}
    >
      {label}
    </span>
  );
}

function RoleKey() {
  return (
    <span className="flex items-center gap-1.5">
      {(["adult", "kid", "pet"] as const).map((r) => {
        const m = ROLE_META[r];
        return (
          <span key={r} className="inline-flex items-center gap-0.5">
            <span className={`inline-block h-2 w-2 rounded-full ${m.bg} ring-1 ${m.ring}`} />
            <span className="text-[9px] text-muted-foreground">{m.label}</span>
          </span>
        );
      })}
    </span>
  );
}

function VenueElementCard({ element, eventId, areas: _areas }: { element: SeatingTable; eventId: string; areas: string[] }) {
  void _areas;
  const meta = VENUE_ELEMENTS.find((v) => v.id === element.elementType);
  return (
    <div className="relative flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-velvet/30 bg-velvet/[0.04] p-5 text-center ring-1 ring-transparent">
      <div className="absolute right-2 top-2 flex items-center gap-1">
        <button
          onClick={async () => {
            if (await confirmDialog({ title: `Remove "${element.label}"?` })) {
              removeSeatingTable(eventId, element.id);
            }
          }}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
          aria-label="Remove element"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="text-3xl leading-none" aria-hidden>{meta?.icon ?? "▦"}</div>
      <input
        value={element.label}
        onChange={(e) => updateSeatingTable(eventId, element.id, { label: e.target.value })}
        className="mt-2 w-full bg-transparent text-center font-serif text-lg outline-none"
      />
      <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        {meta?.label ?? "Venue element"}
      </div>
      <input
        list="atelier-areas"
        value={element.area ?? ""}
        onChange={(e) => updateSeatingTable(eventId, element.id, { area: e.target.value })}
        placeholder="area (optional)"
        className="mt-2 w-32 rounded-full bg-card/70 px-2 py-0.5 text-center text-[11px] ring-1 ring-ink/10"
      />
    </div>
  );
}


