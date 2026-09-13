import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { KEvent } from "@/lib/events-store";
import { billableAdults, formatEventDate, partyMemberCount } from "@/lib/events-store";
import { formatStampDate, epochMillis } from "@/lib/datetime";

function safeFilename(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "report";
}

function ensureSpace(pdf: jsPDF, y: number, needed: number, margin: number) {
  const pageHeight = pdf.internal.pageSize.getHeight();
  if (y + needed > pageHeight - margin) {
    pdf.addPage();
    return margin;
  }
  return y;
}

function drawHeader(pdf: jsPDF, title: string, subtitle: string, margin: number) {
  pdf.setFont("times", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(20, 20, 20);
  pdf.text(title, margin, margin + 6);
  pdf.setFont("times", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(105, 112, 122);
  pdf.text(subtitle, margin, margin + 22);
  pdf.setDrawColor(220, 224, 230);
  pdf.line(margin, margin + 30, pdf.internal.pageSize.getWidth() - margin, margin + 30);
  return margin + 44;
}

export async function exportRunOfShowPdf(event: KEvent) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const margin = 48;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const d = formatEventDate(event.date, event.timezone);
  let y = drawHeader(
    pdf,
    `Run of show — ${event.title}`,
    `${d.long} · ${d.time}${event.venue ? ` · ${event.venue}` : ""}`,
    margin,
  );

  if (event.hosts?.length) {
    pdf.setFont("times", "italic");
    pdf.setFontSize(10);
    pdf.setTextColor(105, 112, 122);
    pdf.text(`Hosts: ${event.hosts.map((h) => h.name).join(", ")}`, margin, y);
    y += 18;
  }

  // Timeline
  pdf.setFont("times", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(20, 20, 20);
  pdf.text("Timeline", margin, y);
  y += 16;

  const blocks = [...(event.timelineBlocks ?? [])].sort((a, b) => a.time.localeCompare(b.time));
  if (blocks.length === 0) {
    pdf.setFont("times", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(120, 120, 120);
    pdf.text("No timeline blocks added yet.", margin, y);
    y += 18;
  } else {
    pdf.setFontSize(10);
    pdf.setFont("times", "bold");
    pdf.setTextColor(105, 112, 122);
    pdf.text("Time", margin, y);
    pdf.text("Block", margin + 80, y);
    pdf.text("Owner", margin + 290, y);
    pdf.text("Notes", margin + 380, y);
    y += 6;
    pdf.setDrawColor(220, 224, 230);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 12;
    pdf.setFont("times", "normal");
    pdf.setTextColor(20, 20, 20);
    for (const b of blocks) {
      // Column starts at margin+380; keep wrap width inside the right
      // margin (pageWidth - margin) instead of overrunning into it.
      const notesColumnWidth = pageWidth - margin - (margin + 380) - 6;
      const notes = pdf.splitTextToSize(b.notes ?? "", Math.max(60, notesColumnWidth));
      const rowHeight = Math.max(18, notes.length * 12 + 4);
      y = ensureSpace(pdf, y, rowHeight, margin);
      pdf.text(b.time, margin, y);
      pdf.text(b.title, margin + 80, y, { maxWidth: 200 });
      if (b.durationMin) {
        pdf.setFontSize(9);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`${b.durationMin} min`, margin + 80, y + 12);
        pdf.setFontSize(10);
        pdf.setTextColor(20, 20, 20);
      }
      pdf.text(b.owner ?? "—", margin + 290, y);
      if (notes.length) pdf.text(notes, margin + 380, y);
      y += rowHeight;
    }
  }

  // Seating (grouped by area)
  const seatingTables = (event.seatingTables ?? []).filter((t) => t.kind !== "element");
  if (seatingTables.length) {
    y += 12;
    y = ensureSpace(pdf, y, 40, margin);
    pdf.setFont("times", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(20, 20, 20);
    pdf.text("Seating", margin, y);
    y += 16;

    const areasOrder: string[] = [];
    const grouped = new Map<string, typeof seatingTables>();
    for (const t of seatingTables) {
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

    pdf.setFontSize(10);
    pdf.setFont("times", "normal");
    for (const area of areasOrder) {
      const list = grouped.get(area) ?? [];
      if (!onlyUnzoned) {
        y = ensureSpace(pdf, y, 24, margin);
        pdf.setFont("times", "bold");
        pdf.setFontSize(12);
        pdf.setTextColor(60, 60, 60);
        const cap = list.reduce((n, t) => n + t.capacity, 0);
        pdf.text(`${area || "Unzoned"}  ·  ${cap} seats`, margin, y);
        y += 14;
        pdf.setFont("times", "normal");
        pdf.setFontSize(10);
        pdf.setTextColor(20, 20, 20);
      }
      for (const t of list) {
        const seated = t.guestIds
          .map((id) => event.guests.find((g) => g.id === id))
          .filter((g): g is NonNullable<typeof g> => !!g);
        const totalSeated = seated.reduce((sum, g) => sum + partyMemberCount(g), 0);
        const lines = seated.map((g) => {
          const a = billableAdults(g);
          const k = Math.max(0, g.children ?? 0);
          const p = Math.max(0, g.pets ?? 0);
          const badges: string[] = [];
          if (a) badges.push(`${a}A`);
          if (k) badges.push(`${k}K`);
          if (p) badges.push(`${p}P`);
          return `• ${g.name} [${badges.join(" ")}]${g.dietary ? ` — ${g.dietary}` : ""}`;
        });
        const block = pdf.splitTextToSize(lines.join("\n") || "No guests seated.", 460);
        const needed = 22 + block.length * 12 + 10;
        y = ensureSpace(pdf, y, needed, margin);
        pdf.setFont("times", "bold");
        pdf.text(`${t.label}${t.locked ? " (locked)" : ""}`, margin, y);
        pdf.setFont("times", "normal");
        pdf.setTextColor(105, 112, 122);
        pdf.text(`${totalSeated} / ${t.capacity} · ${t.shape}`, pageWidth - margin, y, { align: "right" });
        pdf.setTextColor(20, 20, 20);
        y += 14;
        pdf.text(block, margin + 12, y);
        y += block.length * 12 + 10;
      }
    }
  }


  pdf.save(`${safeFilename(event.title)}-run-of-show.pdf`);
}

type Counts = {
  total: number;
  yes: number;
  no: number;
  maybe: number;
  adults: number;
  children: number;
  attendees: number;
};

type ReportData = {
  enabled: boolean;
  billed: number;
  collected: number;
  outstanding: number;
  currency: string;
  byStatus: Record<string, number>;
};

export function exportSummaryPdf(event: KEvent, c: Counts, report: ReportData, responseRate: number) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const margin = 48;
  const d = formatEventDate(event.date, event.timezone);
  let y = drawHeader(pdf, `Event summary — ${event.title}`, `${d.long} · ${d.time}`, margin);

  const tile = (label: string, value: string, x: number, yy: number) => {
    pdf.setDrawColor(220, 224, 230);
    pdf.roundedRect(x, yy, 110, 50, 6, 6);
    pdf.setFont("times", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(20, 20, 20);
    pdf.text(value, x + 10, yy + 22);
    pdf.setFont("times", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(105, 112, 122);
    pdf.text(label.toUpperCase(), x + 10, yy + 40);
  };

  const tiles: [string, string][] = [
    ["Invited", String(c.total)],
    ["Confirmed", String(c.yes)],
    ["Maybe", String(c.maybe)],
    ["Declined", String(c.no)],
    ["Adults", String(c.adults)],
    ["Children", String(c.children)],
    ["Attendees", String(c.attendees)],
    ["Response rate", `${responseRate}%`],
  ];
  tiles.forEach(([label, value], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    tile(label, value, margin + col * 122, y + row * 62);
  });
  y += Math.ceil(tiles.length / 4) * 62 + 12;

  if (report.enabled) {
    pdf.setFont("times", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(20, 20, 20);
    pdf.text("Payments", margin, y);
    y += 12;
    const fmt = (n: number) => `${report.currency || "$"}${n.toFixed(2)}`;
    const billing: [string, string][] = [
      ["Billed", fmt(report.billed)],
      ["Collected", fmt(report.collected)],
      ["Outstanding", fmt(report.outstanding)],
      ["Paid guests", String(report.byStatus.paid ?? 0)],
    ];
    billing.forEach(([label, value], i) => tile(label, value, margin + i * 122, y));
    y += 70;
  }

  pdf.save(`${safeFilename(event.title)}-summary.pdf`);
}

type ReviewLike = { name: string; rating: number; comment: string; createdAt: string | number; guestEmail?: string };
type ReviewStats = { count: number; average: number; distribution: number[] };

export function exportReviewsPdf(event: KEvent, reviews: ReviewLike[], stats: ReviewStats) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const margin = 48;
  const pageWidth = pdf.internal.pageSize.getWidth();
  let y = drawHeader(
    pdf,
    `Reviews — ${event.title}`,
    `${stats.count} ${stats.count === 1 ? "review" : "reviews"} · average ${stats.average.toFixed(1)} / 5`,
    margin,
  );

  pdf.setFont("times", "bold");
  pdf.setFontSize(36);
  pdf.setTextColor(122, 59, 154);
  pdf.text(stats.average.toFixed(1), margin, y + 30);
  pdf.setFontSize(14);
  pdf.setTextColor(184, 134, 11);
  const filled = Math.round(stats.average);
  pdf.text("★".repeat(filled) + "☆".repeat(5 - filled), margin + 78, y + 22);
  pdf.setFont("times", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(105, 112, 122);
  pdf.text(`${stats.count} ${stats.count === 1 ? "review" : "reviews"}`, margin + 78, y + 38);
  y += 60;

  if (!reviews.length) {
    pdf.setFontSize(11);
    pdf.text("No reviews yet.", margin, y);
  } else {
    for (const r of reviews) {
      const comment = pdf.splitTextToSize(r.comment ?? "", pageWidth - margin * 2 - 12);
      const needed = 40 + comment.length * 12;
      y = ensureSpace(pdf, y, needed, margin);
      pdf.setFont("times", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(20, 20, 20);
      pdf.text(r.name, margin, y);
      pdf.setFont("times", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(184, 134, 11);
      pdf.text("★".repeat(r.rating) + "☆".repeat(5 - r.rating), margin + 200, y);
      pdf.setTextColor(120, 120, 120);
      pdf.text(formatStampDate(typeof r.createdAt === "number" ? epochMillis(r.createdAt) : r.createdAt), pageWidth - margin, y, { align: "right" });
      y += 14;
      pdf.setTextColor(40, 40, 40);
      pdf.text(comment, margin, y);
      y += comment.length * 12 + 14;
      pdf.setDrawColor(235, 238, 242);
      pdf.line(margin, y - 6, pageWidth - margin, y - 6);
    }
  }

  pdf.save(`${safeFilename(event.title)}-reviews.pdf`);
}

export async function downloadHiResQr(url: string, filename = "event-qr.png") {
  const dataUrl = await QRCode.toDataURL(url, { width: 1200, margin: 2, errorCorrectionLevel: "H" });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
