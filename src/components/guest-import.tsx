import { toUserMessage } from "@/lib/user-error";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import * as XLSX from "xlsx";

import { toast } from "sonner";
import { Download, Upload, Lock, Sparkles, FileSpreadsheet } from "lucide-react";
import { getEntitlements } from "@/lib/entitlements-client";
import { usePreviewTier } from "@/lib/preview-tier";
import { addGuest, updateGuest, type KEvent } from "@/lib/events-store";
import { upsertContactsFromGuests } from "@/lib/contacts.functions";
import { logHostGuestConsent } from "@/lib/host-consent.functions";
import { assertEventAddonAccess } from "@/lib/addon-access.functions";
import { GuestConsentCheckbox, CONSENT_DISABLED_TOOLTIP } from "@/components/guest-consent-checkbox";

const COLUMNS = [
  { key: "name",     header: "Full Name",        width: 26, required: true,  example: "Maya Johnson" },
  { key: "email",    header: "Email",            width: 28, required: false, example: "maya@example.com" },
  { key: "phone",    header: "Phone",            width: 18, required: false, example: "+1 555-123-4567" },
  { key: "address",  header: "Mailing Address",  width: 34, required: false, example: "123 Cedar St, Brooklyn, NY 11201" },
  { key: "adults",   header: "Adults",           width: 9,  required: false, example: 2 },
  { key: "children", header: "Children",         width: 9,  required: false, example: 0 },
  { key: "dietary",  header: "Dietary Notes",    width: 22, required: false, example: "Vegetarian" },
  { key: "rsvp",     header: "RSVP Status",      width: 14, required: false, example: "pending" },
  { key: "notes",    header: "Notes",            width: 28, required: false, example: "Plus-one of the bride" },
] as const;

type Row = Record<string, string | number | undefined>;

function buildTemplate(eventTitle?: string): Blob {
  const wb = XLSX.utils.book_new();

  // Sheet 1 — Guests
  const headerRow = COLUMNS.map((c) => c.header);
  const sample: Row[] = [
    Object.fromEntries(COLUMNS.map((c) => [c.header, c.example])) as Row,
    Object.fromEntries(COLUMNS.map((c) => [c.header, ""])) as Row,
  ];
  const ws = XLSX.utils.json_to_sheet(sample, { header: headerRow });
  ws["!cols"] = COLUMNS.map((c) => ({ wch: c.width }));
  // Bold header cells
  for (let i = 0; i < headerRow.length; i++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
    const cell = ws[cellRef];
    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "1F1B16" } },
        alignment: { horizontal: "left", vertical: "center" },
      };
    }
  }
  ws["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headerRow.length - 1)}1` };
  ws["!freeze"] = { xSplit: 0, ySplit: 1 } as never;
  XLSX.utils.book_append_sheet(wb, ws, "Guests");

  // Sheet 2 — Instructions
  const instructions = [
    ["The Kenroe Collective — Guest List Template"],
    [eventTitle ? `Event: ${eventTitle}` : "Use this template to import your guest list."],
    [],
    ["Required columns"],
    ["Full Name — every row must have a name."],
    ["At least one of Email or Phone is recommended so we can send invites & RSVP links."],
    [],
    ["Optional columns"],
    ["Mailing Address — for printed invitations or thank-you notes."],
    ["Adults / Children — how many people are coming under this guest."],
    ["Dietary Notes — allergies, vegetarian, vegan, kosher, etc."],
    ["RSVP Status — one of: pending, yes, no, maybe (defaults to pending)."],
    ["Notes — any private note for you about this guest."],
    [],
    ["How to use"],
    ["1. Fill in one guest per row (you can delete the sample row)."],
    ["2. Save the file."],
    ["3. Click “Import .xlsx” on the Guests step and select this file."],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(instructions);
  ws2["!cols"] = [{ wch: 90 }];
  const titleCell = ws2["A1"];
  if (titleCell) titleCell.s = { font: { bold: true, sz: 14 } };
  XLSX.utils.book_append_sheet(wb, ws2, "Instructions");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function normalizeRsvp(v: unknown): "pending" | "yes" | "no" | "maybe" {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "yes" || s === "y" || s === "confirmed" || s === "going") return "yes";
  if (s === "no" || s === "n" || s === "declined") return "no";
  if (s === "maybe" || s === "tentative") return "maybe";
  return "pending";
}

export function GuestImportPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const [ent, setEnt] = useState<{ canImportGuests: boolean; isOwner: boolean; tier: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewTier = usePreviewTier();
  useEffect(() => {
    getEntitlements()
      .then((r) => setEnt(r))
      .catch(() => setEnt({ canImportGuests: false, isOwner: false, tier: null }));
  }, [previewTier]);

  function download() {
    const blob = buildTemplate(event.title);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = (event.title || "guest-list").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.href = url;
    a.download = `${safe}-guests.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded — fill it in and import.");
  }

  async function onFile(file: File) {
    setBusy(true);
    try {
      await assertEventAddonAccess({ data: { eventId, kind: "guest_import" } });
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets["Guests"] ?? wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("No sheet found.");
      const HARD_CAP = 5000;
      const allRows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });
      const rows = allRows.slice(0, HARD_CAP);
      const truncated = allRows.length > HARD_CAP;
      let added = 0, skipped = 0, merged = 0;
      const captured: Array<{ name: string; email?: string; phone?: string; rsvpStatus?: string }> = [];
      const existingKeys = new Set(
        event.guests.map((g) => `${(g.email || "").toLowerCase()}|${(g.phone || "").replace(/\D/g, "")}|${g.name.toLowerCase().trim()}`),
      );
      // Name -> candidate guests, for the "same guest re-submitted with newly
      // added contact info" case below. A row that doesn't hit the exact key
      // above but shares a normalized name with exactly one existing guest —
      // and would only be *filling in* an email/phone that guest doesn't
      // have yet, not contradicting one it does — updates that guest instead
      // of creating a duplicate. Ambiguous (2+ same-name guests) or
      // contradicting (existing guest already has a different email/phone)
      // matches are left alone and fall through to a normal new-row add, since
      // silently merging into the wrong person is worse than a harmless
      // duplicate the host can clean up by hand.
      const byName = new Map<string, typeof event.guests>();
      for (const g of event.guests) {
        const k = g.name.toLowerCase().trim();
        const arr = byName.get(k);
        if (arr) arr.push(g); else byName.set(k, [g]);
      }
      for (const r of rows) {
        const name = String(r["Full Name"] ?? r["name"] ?? "").trim();
        if (!name) { skipped++; continue; }
        const email = String(r["Email"] ?? r["email"] ?? "").trim();
        const phone = String(r["Phone"] ?? r["phone"] ?? "").trim();
        const address = String(r["Mailing Address"] ?? r["address"] ?? "").trim();
        // Number(x) || fallback treats a legitimate "0" (e.g. a children-only
        // row) the same as missing/invalid — silently overriding host data.
        // Only fall back when the cell is genuinely absent or unparseable.
        const parseCount = (raw: unknown, fallback: number) => {
          if (raw === undefined || raw === null || raw === "") return fallback;
          const n = Number(raw);
          return Number.isFinite(n) ? n : fallback;
        };
        const adults = parseCount(r["Adults"] ?? r["adults"], 1);
        const children = parseCount(r["Children"] ?? r["children"], 0);
        const dietary = String(r["Dietary Notes"] ?? r["dietary"] ?? "").trim();
        const rsvp = normalizeRsvp(r["RSVP Status"] ?? r["rsvp"]);
        const key = `${email.toLowerCase()}|${phone.replace(/\D/g, "")}|${name.toLowerCase()}`;
        if (existingKeys.has(key)) { skipped++; continue; }

        const candidates = byName.get(name.toLowerCase().trim());
        const mergeTarget = candidates?.length === 1 ? candidates[0] : undefined;
        const contradicts =
          (email && mergeTarget?.email && mergeTarget.email.toLowerCase() !== email.toLowerCase()) ||
          (phone && mergeTarget?.phone && mergeTarget.phone.replace(/\D/g, "") !== phone.replace(/\D/g, ""));
        const fillsSomething = mergeTarget && ((email && !mergeTarget.email) || (phone && !mergeTarget.phone));

        if (mergeTarget && fillsSomething && !contradicts) {
          // Guest.email/phone are required strings — only include a key in
          // the patch when there's an actual value to set, since an
          // explicit `undefined` in the patch object would spread over and
          // clobber the guest's existing (non-optional) field.
          const fillPatch: Partial<typeof mergeTarget> = {};
          if (!mergeTarget.email && email) fillPatch.email = email;
          if (!mergeTarget.phone && phone) fillPatch.phone = phone;
          if (!mergeTarget.address && address) fillPatch.address = address;
          if (!mergeTarget.dietary && dietary) fillPatch.dietary = dietary;
          updateGuest(eventId, mergeTarget.id, fillPatch);
          existingKeys.add(key);
          merged++;
          // Previously skipped entirely, so a merge that filled in a
          // guest's first-ever email/phone never reached the CRM capture.
          captured.push({
            name,
            email: fillPatch.email ?? mergeTarget.email,
            phone: fillPatch.phone ?? mergeTarget.phone,
            rsvpStatus: mergeTarget.status,
          });
          continue;
        }

        existingKeys.add(key);
        const guest = addGuest(eventId, name, email, phone, address);
        updateGuest(eventId, guest.id, {
          adults,
          children,
          dietary: dietary || undefined,
          status: rsvp,
        });
        captured.push({ name, email, phone, rsvpStatus: rsvp });
        added++;
      }
      if (captured.length > 0) {
        // Atelier CRM auto-capture — silent no-op for other tiers.
        upsertContactsFromGuests({ data: { eventId, guests: captured } }).catch(() => {});
      }
      if (added > 0) {
        logHostGuestConsent({ data: { eventId, source: "import", guestCount: added } }).catch(() => {});
      }
      toast.success(`Imported ${added} guest${added === 1 ? "" : "s"}${merged ? ` · ${merged} updated with new contact info` : ""}${skipped ? ` · ${skipped} skipped (duplicate or missing name)` : ""}${truncated ? ` · file capped at ${HARD_CAP} rows` : ""}.`);
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn’t read that file."));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (!ent) {
    return (
      <div className="rounded-2xl bg-card p-4 ring-1 ring-ink/5 text-xs text-muted-foreground">Checking your plan…</div>
    );
  }

  if (!ent.canImportGuests) {
    const tierLower = (ent.tier ?? "").toLowerCase();
    const isHost = tierLower.includes("host");
    return (
      <div className="rounded-2xl bg-gradient-to-br from-velvet/5 to-amber-50 p-5 ring-1 ring-velvet/15">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-velvet/10 p-2"><Lock className="h-4 w-4 text-velvet" /></div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-ink/60" />
              <h3 className="font-serif text-base">Bulk guest list import</h3>
              <span className="rounded-full bg-velvet px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">Atelier</span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Download a pre-formatted Excel template, fill in your guests, and upload to add them all at once.
              {isHost
                ? <> Add it to Host for a one-time <strong>$5</strong>, or upgrade to Atelier where it’s included.</>
                : <> Available on <strong>Host</strong> as a $5 add-on, and included on <strong>Atelier</strong>.</>}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {isHost ? (
                <Link
                  to="/checkout"
                  search={{ price: "guest_import_addon" }}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full bg-ink/90 px-4 py-2.5 text-xs font-medium text-paper hover:bg-ink"
                >
                  Add to my plan — $5
                </Link>
              ) : (
                <Link
                  to="/pricing"
                  className="inline-flex min-h-11 items-center gap-1 rounded-full bg-velvet px-4 py-2.5 text-xs font-medium text-white hover:opacity-90"
                >
                  <Sparkles className="h-3 w-3" /> Upgrade to Host or Atelier
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-velvet" />
            <h3 className="font-serif text-base">Bulk guest list (Excel)</h3>
            {ent.isOwner && (
              <span className="rounded-full bg-velvet/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-velvet">Owner</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Download the formatted template, fill in your guests, then re-upload to import them all at once.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={download}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-4 py-2.5 text-sm font-medium hover:bg-ink/10"
          >
            <Download className="h-4 w-4" /> Download template
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || !consent}
            title={!consent ? CONSENT_DISABLED_TOOLTIP : undefined}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-velvet px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> {busy ? "Importing…" : "Import .xlsx"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </div>
      </div>
      <div className="mt-4">
        <GuestConsentCheckbox checked={consent} onChange={setConsent} id="guest-import-consent" />
      </div>
    </div>
  );
}
