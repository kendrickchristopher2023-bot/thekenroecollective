/**
 * Potluck sign-up sheet — exports and the offline fillable template.
 *
 * Deliberately mirrors the guest list pattern in `src/components/guest-import.tsx`:
 * one styled .xlsx with a data sheet plus an Instructions sheet, downloaded,
 * filled in offline, then re-uploaded and parsed back with the same SheetJS
 * helpers. PDF (jspdf) and Word (docx) are dynamic imports so they stay out of
 * the main bundle.
 */
import * as XLSX from "xlsx";
import {
  BRING_CATEGORIES,
  bringCategoryLabel,
  bringCsvRows,
  bringTotals,
  groupByCategory,
  slotsRemaining,
  MAX_BRING_SLOTS,
  type BringItem,
} from "@/lib/bring-sheet";

export const TEMPLATE_COLUMNS = [
  { key: "name", header: "Item Name", width: 30, example: "Brownies" },
  { key: "category", header: "Category", width: 16, example: "Dessert" },
  { key: "slots", header: "Spots Needed", width: 14, example: 2 },
  { key: "serves", header: "Serves", width: 10, example: 12 },
  { key: "note", header: "Note", width: 40, example: "Nut free please" },
] as const;

export interface ParsedTemplateItem {
  name: string;
  category: string;
  slotsNeeded: number;
  serves?: number;
  note?: string;
}

export interface ParsedTemplate {
  items: ParsedTemplateItem[];
  skipped: number;
  truncated: boolean;
}

export const TEMPLATE_SHEET_NAME = "Items";
export const MAX_TEMPLATE_ROWS = 200;

function fileStem(title: string | undefined, suffix: string) {
  const safe = (title || "what-to-bring")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${safe || "what-to-bring"}-${suffix}`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function styleHeader(ws: XLSX.WorkSheet, headers: string[]) {
  for (let i = 0; i < headers.length; i++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: i })];
    if (cell) {
      (cell as any).s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "1F1B16" } },
        alignment: { horizontal: "left", vertical: "center" },
      };
    }
  }
  ws["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}1` };
  (ws as any)["!freeze"] = { xSplit: 0, ySplit: 1 };
}

/* ---------------- Fillable offline template ---------------- */

export function buildBringTemplate(eventTitle?: string): Blob {
  const wb = XLSX.utils.book_new();
  const headers = TEMPLATE_COLUMNS.map((c) => c.header);
  const rows = [
    Object.fromEntries(TEMPLATE_COLUMNS.map((c) => [c.header, c.example])),
    Object.fromEntries(TEMPLATE_COLUMNS.map((c) => [c.header, ""])),
  ];
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  ws["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: c.width }));
  styleHeader(ws, headers);
  XLSX.utils.book_append_sheet(wb, ws, TEMPLATE_SHEET_NAME);

  const instructions = [
    ["The Kenroe Collective — What to Bring Template"],
    [eventTitle ? `Event: ${eventTitle}` : "Use this template to build your sign-up list."],
    [],
    ["Columns"],
    ["Item Name — required. One item per row, for example Brownies, Ice, Folding chairs."],
    [`Category — one of: ${BRING_CATEGORIES.map((c) => c.label).join(", ")}. Blank becomes Other.`],
    [`Spots Needed — how many people you want for this item (1 to ${MAX_BRING_SLOTS}). Blank becomes 1.`],
    ["Serves — optional, roughly how many people the item feeds."],
    ["Note — optional guidance for guests, for example nut free please."],
    [],
    ["How to use"],
    ["1. Fill in one item per row (you can delete the sample row)."],
    ["2. Save the file."],
    ["3. Click Import .xlsx on the What to bring panel and select this file."],
    [`Up to ${MAX_TEMPLATE_ROWS} rows are imported at a time.`],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(instructions);
  ws2["!cols"] = [{ wch: 95 }];
  const title = ws2["A1"];
  if (title) (title as any).s = { font: { bold: true, sz: 14 } };
  XLSX.utils.book_append_sheet(wb, ws2, "Instructions");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBringTemplate(eventTitle?: string) {
  download(buildBringTemplate(eventTitle), `${fileStem(eventTitle, "template")}.xlsx`);
}

function normalizeCategory(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "other";
  const byId = BRING_CATEGORIES.find((c) => c.id === raw);
  if (byId) return byId.id;
  const byLabel = BRING_CATEGORIES.find((c) => c.label.toLowerCase() === raw);
  if (byLabel) return byLabel.id;
  const loose = BRING_CATEGORIES.find(
    (c) => raw.startsWith(c.id) || c.label.toLowerCase().startsWith(raw),
  );
  return loose ? loose.id : "other";
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(String(value ?? "").trim()));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Parse rows from a filled-in template. Mirrors the guest import validation. */
export function parseBringRows(rows: Record<string, unknown>[]): ParsedTemplate {
  const all = rows;
  const kept = all.slice(0, MAX_TEMPLATE_ROWS);
  const items: ParsedTemplateItem[] = [];
  let skipped = 0;
  for (const row of kept) {
    const pick = (header: string) => {
      const key = Object.keys(row).find(
        (k) => k.trim().toLowerCase() === header.toLowerCase(),
      );
      return key ? row[key] : undefined;
    };
    const name = String(pick("Item Name") ?? "").trim().slice(0, 120);
    if (!name) {
      skipped += 1;
      continue;
    }
    const servesRaw = String(pick("Serves") ?? "").trim();
    const note = String(pick("Note") ?? "").trim().slice(0, 300);
    items.push({
      name,
      category: normalizeCategory(pick("Category")),
      slotsNeeded: clampInt(pick("Spots Needed"), 1, MAX_BRING_SLOTS, 1),
      ...(servesRaw ? { serves: clampInt(servesRaw, 1, 500, 1) } : {}),
      ...(note ? { note } : {}),
    });
  }
  return { items, skipped, truncated: all.length > MAX_TEMPLATE_ROWS };
}

export async function parseBringTemplateFile(file: File): Promise<ParsedTemplate> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[TEMPLATE_SHEET_NAME] ?? wb.Sheets[wb.SheetNames[0]!];
  if (!sheet) throw new Error("No sheet found in that file.");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return parseBringRows(rows);
}

/* ---------------- Exports of the live sheet ---------------- */

export function exportBringSheetXlsx(items: BringItem[], eventTitle?: string) {
  const rows = bringCsvRows(items);
  const head = rows[0]!;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = head.map((h) => ({ wch: Math.max(12, Math.min(40, h.length + 8)) }));
  styleHeader(ws, head);
  XLSX.utils.book_append_sheet(wb, ws, "Sign-ups");

  const t = bringTotals(items);
  const summary = [
    ["What to bring — summary"],
    [eventTitle ? `Event: ${eventTitle}` : ""],
    [],
    ["Items", t.items],
    ["Spots needed", t.slotsNeeded],
    ["Spots claimed", t.claimed],
    ["Still open", t.openSlots],
    ["Guests helping", t.people],
    ["Guest suggested items", t.guestSuggested],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(summary);
  ws2["!cols"] = [{ wch: 28 }, { wch: 40 }];
  const title = ws2["A1"];
  if (title) (title as any).s = { font: { bold: true, sz: 14 } };
  XLSX.utils.book_append_sheet(wb, ws2, "Summary");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
  download(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${fileStem(eventTitle, "sign-ups")}.xlsx`,
  );
}

function tableRows(items: BringItem[]): { head: string[]; rows: string[][] } {
  const head = ["Item", "Category", "Spots", "Signed up", "Bringing", "Notes"];
  const rows: string[][] = [];
  for (const g of groupByCategory(items)) {
    for (const item of g.items) {
      const needed = Math.max(1, Math.floor(item.slotsNeeded || 1));
      const filled = needed - slotsRemaining(item);
      const names = (item.claims ?? []).map((c) => c.name || "Anonymous").join(", ");
      const dishes = (item.claims ?? [])
        .map((c) => c.dish || "")
        .filter(Boolean)
        .join(", ");
      const notes = [item.note ?? "", ...(item.claims ?? []).map((c) => c.note || "")]
        .filter(Boolean)
        .join(" · ");
      rows.push([
        item.name + (item.suggested ? " (guest suggested)" : ""),
        g.label,
        `${filled} of ${needed}`,
        names,
        dishes,
        notes,
      ]);
    }
  }
  return { head, rows };
}

export async function exportBringSheetPdf(items: BringItem[], eventTitle?: string) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as any).default ?? (autoTableMod as any).autoTable;
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const margin = 48;
  const t = bringTotals(items);

  pdf.setFont("times", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(20, 20, 20);
  pdf.text("What to bring", margin, margin + 6);
  pdf.setFont("times", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(105, 112, 122);
  pdf.text(eventTitle ? eventTitle : "Sign-up sheet", margin, margin + 22);
  pdf.text(
    `${t.items} items · ${t.claimed} of ${t.slotsNeeded} spots claimed · ${t.openSlots} still open`,
    margin,
    margin + 36,
  );

  const { head, rows } = tableRows(items);
  autoTable(pdf, {
    head: [head],
    body: rows.length ? rows : [["Nothing listed yet", "", "", "", "", ""]],
    startY: margin + 54,
    margin: { left: margin, right: margin },
    styles: { font: "times", fontSize: 9, cellPadding: 5, textColor: [30, 30, 30] },
    headStyles: { fillColor: [31, 27, 22], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 246, 243] },
    columnStyles: { 2: { cellWidth: 54 } },
  });
  pdf.save(`${fileStem(eventTitle, "sign-ups")}.pdf`);
}

export async function exportBringSheetDocx(items: BringItem[], eventTitle?: string) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    ShadingType,
    BorderStyle,
    HeadingLevel,
  } = await import("docx");

  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const margins = { top: 80, bottom: 80, left: 120, right: 120 };
  const CONTENT = 9360;
  const { head, rows } = tableRows(items);
  const colWidth = Math.floor(CONTENT / head.length);
  const widths = head.map((_, i) =>
    i === head.length - 1 ? CONTENT - colWidth * (head.length - 1) : colWidth,
  );
  const t = bringTotals(items);

  const table = new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: head.map(
          (h, i) =>
            new TableCell({
              width: { size: widths[i]!, type: WidthType.DXA },
              borders,
              margins,
              shading: { type: ShadingType.CLEAR, fill: "F1EDE7" },
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
            }),
        ),
      }),
      ...(rows.length ? rows : [["Nothing listed yet", "", "", "", "", ""]]).map(
        (r) =>
          new TableRow({
            children: r.map(
              (cell, i) =>
                new TableCell({
                  width: { size: widths[i]!, type: WidthType.DXA },
                  borders,
                  margins,
                  children: [new Paragraph({ children: [new TextRun(cell || "")] })],
                }),
            ),
          }),
      ),
    ],
  });

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 32, bold: true, font: "Arial", color: "5C3C28" },
          paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: "What to bring", bold: true })],
          }),
          new Paragraph({
            children: [new TextRun({ text: eventTitle || "Sign-up sheet", italics: true })],
          }),
          new Paragraph({
            children: [
              new TextRun(
                `${t.items} items · ${t.claimed} of ${t.slotsNeeded} spots claimed · ${t.openSlots} still open`,
              ),
            ],
          }),
          new Paragraph({ children: [new TextRun("")] }),
          table,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  download(blob, `${fileStem(eventTitle, "sign-ups")}.docx`);
}

export { bringCategoryLabel };
