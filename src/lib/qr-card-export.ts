import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Guest, KEvent } from "@/lib/events-store";
import { resolveDoorToken } from "@/lib/door-token";

const QR_SIZE = 240;

type GuestQr = { guest: Guest; dataUrl: string };

export async function exportGuestQrCardsPdf(event: KEvent, eventId: string) {
  const cards = await buildGuestQrCards(event, eventId);
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const gap = 14;
  const cols = 2;
  const rows = 3;
  const cardWidth = (pageWidth - margin * 2 - gap) / cols;
  const cardHeight = (pageHeight - margin * 2 - gap * 2) / rows;

  cards.forEach(({ guest, dataUrl }, index) => {
    if (index > 0 && index % (cols * rows) === 0) pdf.addPage();
    const slot = index % (cols * rows);
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const x = margin + col * (cardWidth + gap);
    const y = margin + row * (cardHeight + gap);
    const qr = 108;

    pdf.setDrawColor(220, 224, 230);
    pdf.roundedRect(x, y, cardWidth, cardHeight, 10, 10);
    pdf.setFont("times", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(105, 112, 122);
    pdf.text(event.title.toUpperCase(), x + cardWidth / 2, y + 22, { align: "center", maxWidth: cardWidth - 24 });
    pdf.setFontSize(15);
    pdf.setTextColor(20, 20, 20);
    pdf.text(pdf.splitTextToSize(guest.name, cardWidth - 30), x + cardWidth / 2, y + 44, { align: "center" });

    const tableLabel = findTableLabel(event, guest.id);
    const composition = partyComposition(guest);
    pdf.setFontSize(9);
    pdf.setTextColor(122, 59, 154);
    if (tableLabel) {
      pdf.text(tableLabel, x + cardWidth / 2, y + 58, { align: "center", maxWidth: cardWidth - 24 });
    }
    if (composition) {
      pdf.setTextColor(105, 112, 122);
      pdf.text(composition, x + cardWidth / 2, y + (tableLabel ? 70 : 60), { align: "center", maxWidth: cardWidth - 24 });
    }

    pdf.addImage(dataUrl, "PNG", x + (cardWidth - qr) / 2, y + 78, qr, qr);
    pdf.setFontSize(9);
    pdf.setTextColor(105, 112, 122);
    pdf.text("Scan to check in", x + cardWidth / 2, y + cardHeight - 16, { align: "center" });
  });

  pdf.save(`${safeFilename(event.title)}-qr-cards.pdf`);
}

function findTableLabel(event: KEvent, guestId: string): string | null {
  const t = (event.seatingTables ?? []).find((t) => t.guestIds.includes(guestId));
  return t ? t.label : null;
}

function partyComposition(g: Guest): string | null {
  // Named plus-ones are real heads who take a seat at the table, so the check-in
  // card must count them as adults exactly like the seating chart does.
  const own = Math.max(0, g.adults ?? (g.category === "adult" || !g.category ? 1 : 0));
  const named = Array.isArray(g.plusOnes)
    ? g.plusOnes.filter((p) => (p?.name ?? "").trim().length > 0).length
    : 0;
  const a = own + named;
  const k = Math.max(0, g.children ?? 0);
  const p = Math.max(0, g.pets ?? 0);
  const parts: string[] = [];
  if (a) parts.push(`${a} Adult${a === 1 ? "" : "s"}`);
  if (k) parts.push(`${k} Kid${k === 1 ? "" : "s"}`);
  if (p) parts.push(`${p} Pet${p === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : null;
}

export async function exportGuestQrCardsWord(event: KEvent, eventId: string) {
  const cards = await buildGuestQrCards(event, eventId);
  const rows: TableRow[] = [];
  const cellsPerRow = 2;
  const tableWidth = 9360;
  const cellWidth = tableWidth / cellsPerRow;
  const border = { style: BorderStyle.SINGLE, size: 1, color: "D8DDE6" };
  const emptyCell = () =>
    new TableCell({
      width: { size: cellWidth, type: WidthType.DXA },
      borders: { top: border, bottom: border, left: border, right: border },
      children: [new Paragraph("")],
    });

  for (let i = 0; i < cards.length; i += cellsPerRow) {
    rows.push(
      new TableRow({
        children: Array.from({ length: cellsPerRow }, (_, offset) => {
          const card = cards[i + offset];
          if (!card) return emptyCell();
          const tableLabel = findTableLabel(event, card.guest.id);
          const composition = partyComposition(card.guest);
          return new TableCell({
            width: { size: cellWidth, type: WidthType.DXA },
            borders: { top: border, bottom: border, left: border, right: border },
            margins: { top: 180, bottom: 180, left: 180, right: 180 },
            shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: event.title.toUpperCase(), size: 16, color: "69707A" })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 80, after: 60 },
                children: [new TextRun({ text: card.guest.name, size: 26, font: "Georgia" })],
              }),
              ...(tableLabel
                ? [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: tableLabel, size: 18, color: "7A3B9A", italics: true })],
                    }),
                  ]
                : []),
              ...(composition
                ? [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 80 },
                      children: [new TextRun({ text: composition, size: 16, color: "69707A" })],
                    }),
                  ]
                : []),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    type: "png",
                    data: dataUrlToUint8Array(card.dataUrl),
                    transformation: { width: 120, height: 120 },
                    altText: { title: `${card.guest.name} QR code`, description: "Guest check-in QR code", name: "Guest QR code" },
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 100 },
                children: [new TextRun({ text: "Scan to check in", size: 16, color: "69707A" })],
              }),
            ],
          });
        }),
      }),
    );
  }

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
          run: { size: 32, bold: true, font: "Georgia" },
          paragraph: { spacing: { before: 0, after: 240 }, outlineLevel: 0 },
        },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`${event.title} QR cards`)] }),
          new Table({
            width: { size: tableWidth, type: WidthType.DXA },
            columnWidths: [cellWidth, cellWidth],
            rows,
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${safeFilename(event.title)}-qr-cards.docx`);
}

export async function buildGuestQrCards(event: KEvent, eventId: string): Promise<GuestQr[]> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const guests = event.guests.filter((g) => g.status !== "no");
  // Never fall back to a tokenless URL: a card without `?t=` is a card that
  // cannot check anyone in.
  const t = `&t=${encodeURIComponent(await resolveDoorToken(event, eventId))}`;
  return Promise.all(
    guests.map(async (guest) => ({
      guest,
      dataUrl: await QRCode.toDataURL(`${origin}/checkin/${eventId}?g=${guest.id}${t}`, { width: QR_SIZE, margin: 1 }),
    })),
  );
}


function dataUrlToUint8Array(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = window.atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
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

function safeFilename(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "guest";
}