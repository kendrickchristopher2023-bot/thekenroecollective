/**
 * Printable master guest report.
 *
 * Built for paper: landscape letter, a check-off box per party, repeated column
 * headers on every page, and the event name + date in the running header. This
 * is the day-of backup when venue wifi fails.
 */
import { jsPDF } from "jspdf";
import { formatEventDate, type KEvent } from "@/lib/events-store";
import type { MasterGuestRow, MasterReport } from "@/lib/master-guest-report";

function safeFilename(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "report";
}

interface Col {
  key: string;
  label: string;
  width: number;
  value: (r: MasterGuestRow) => string;
}

function columnsFor(report: MasterReport): Col[] {
  const f = report.flags;
  const cols: Col[] = [
    { key: "chk", label: "Ck", width: 22, value: () => "" },
    { key: "name", label: "Guest", width: 118, value: (r) => r.name },
    { key: "rsvp", label: "RSVP", width: 62, value: (r) => r.statusLabel },
    {
      key: "party",
      label: "Party",
      width: 46,
      value: (r) => `${r.headcount}${r.pets ? ` +${r.pets}p` : ""}`,
    },
    {
      key: "people",
      label: "Who is coming",
      width: 168,
      value: (r) => r.members.filter((m) => m.role !== "Pet").map((m) => m.name).join(", "),
    },
    { key: "contact", label: "Phone / email", width: 132, value: (r) => [r.phone, r.email].filter(Boolean).join("\n") },
    { key: "diet", label: "Dietary / allergies", width: 150, value: (r) => r.dietary },
  ];
  if (f.shirts) cols.push({ key: "shirt", label: "Shirts", width: 96, value: (r) => r.shirtSizes });
  if (f.seating) cols.push({ key: "table", label: "Table", width: 52, value: (r) => r.table });
  if (f.payments)
    cols.push({
      key: "pay",
      label: "Balance",
      width: 60,
      value: (r) => (r.balance > 0 ? `$${r.balance.toFixed(2)}` : r.payStatus === "paid" ? "paid" : "—"),
    });
  return cols;
}

export function exportMasterReportPdf(
  event: KEvent,
  report: MasterReport,
  opts: { filterNote?: string; branded?: boolean } = {},
) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const margin = 32;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const d = formatEventDate(event.date, event.timezone);
  const cols = columnsFor(report);
  const totalWidth = cols.reduce((n, c) => n + c.width, 0);
  const scale = Math.min(1, (pageWidth - margin * 2) / totalWidth);
  const widths = cols.map((c) => c.width * scale);

  let page = 0;

  function header(): number {
    // Every call after the first starts a fresh sheet. Without the addPage the
    // rows all stack on page one, which is exactly the unreadable overlap this
    // report exists to avoid.
    if (page > 0) pdf.addPage();
    page += 1;
    let y = margin + 8;
    pdf.setFont("times", "bold");
    pdf.setFontSize(15);
    pdf.setTextColor(20, 20, 20);
    pdf.text(`${event.title} — guest report`, margin, y);
    pdf.setFont("times", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(90, 96, 105);
    y += 14;
    pdf.text(
      [`${d.long} · ${d.time}`, event.venue, opts.filterNote].filter(Boolean).join("  ·  "),
      margin,
      y,
    );
    y += 12;
    pdf.text(
      `${report.rows.length} parties · ${report.totals.attendees} attendees (${report.totals.adults} adults, ${report.totals.children} children${report.totals.pets ? `, ${report.totals.pets} pets` : ""})`,
      margin,
      y,
    );
    y += 14;

    pdf.setFont("times", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(40, 40, 40);
    let x = margin;
    cols.forEach((c, i) => {
      pdf.text(c.label, x + 2, y);
      x += widths[i]!;
    });
    y += 4;
    pdf.setDrawColor(160, 165, 172);
    pdf.line(margin, y, margin + widths.reduce((a, b) => a + b, 0), y);
    return y + 12;
  }

  let y = header();

  pdf.setFont("times", "normal");
  pdf.setFontSize(9);

  for (const r of report.rows) {
    const cells = cols.map((c, i) => pdf.splitTextToSize(c.value(r) || "", widths[i]! - 6) as string[]);
    const lines = Math.max(1, ...cells.map((c) => c.length));
    const rowHeight = lines * 11 + 8;
    if (y + rowHeight > pageHeight - margin - 10) {
      pdf.setFont("times", "normal");
      y = header();
      pdf.setFont("times", "normal");
      pdf.setFontSize(9);
    }
    let x = margin;
    cols.forEach((c, i) => {
      if (c.key === "chk") {
        pdf.setDrawColor(90, 95, 105);
        pdf.rect(x + 4, y - 8, 11, 11);
      } else {
        pdf.setTextColor(25, 25, 25);
        pdf.text(cells[i]!, x + 2, y);
      }
      x += widths[i]!;
    });
    y += rowHeight;
    pdf.setDrawColor(226, 229, 234);
    pdf.line(margin, y - 8, margin + widths.reduce((a, b) => a + b, 0), y - 8);
  }

  // Footer page numbers.
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont("times", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(140, 145, 152);
    pdf.text(`Page ${i} of ${pages}`, pageWidth - margin, pageHeight - 16, { align: "right" });
    pdf.text("Confidential — guest contact and dietary details", margin, pageHeight - 16);
  }

  pdf.save(`${safeFilename(event.title)}-guest-report.pdf`);
}
