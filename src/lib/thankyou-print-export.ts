/**
 * Print-at-home kit for thank-you cards. Free. We never print or mail
 * anything; these builders produce files the host prints themselves.
 *
 *  - Card, print shop: one 7 x 5 in landscape card per guest on a page that
 *    is 0.125 in larger on every side (bleed), with crop marks at the trim.
 *  - Card, home printer: US Letter portrait, two 7 x 5 in cards per sheet,
 *    with cut lines in the margins.
 *  - Mailing labels: Avery 5160 (30 per sheet, 2.625 x 1 in, 3 x 10).
 *  - Envelopes: A7 (7.25 x 5.25 in), one per guest, addressed on the face.
 *
 * All measurements are in points (72 per inch). Crop marks come from the
 * design studio's print export so every print-shop file we make matches.
 */
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import type { Guest, ThankYouCard } from "@/lib/events-store";
import { PRINT_BLEED_PT, drawCropMarks } from "@/lib/design-render";

const IN = 72;
export const CARD_W = 7 * IN; // 504pt, landscape 7 x 5
export const CARD_H = 5 * IN; // 360pt

type RGB = [number, number, number];
type Palette = { bg: RGB; ink: RGB; accent: RGB; soft: RGB };

/** Same colours as the studio swatches, as RGB for jsPDF. */
export const PRINT_PALETTES: Record<ThankYouCard["design"], Palette> = {
  ivory: { bg: [253, 248, 239], ink: [42, 34, 27], accent: [176, 138, 62], soft: [120, 105, 88] },
  velvet: { bg: [31, 21, 48], ink: [246, 239, 225], accent: [231, 184, 197], soft: [196, 186, 170] },
  garden: { bg: [234, 243, 236], ink: [35, 54, 42], accent: [90, 138, 100], soft: [96, 112, 100] },
  midnight: { bg: [15, 26, 44], ink: [238, 242, 255], accent: [165, 180, 252], soft: [180, 188, 214] },
  confetti: { bg: [255, 242, 245], ink: [42, 23, 34], accent: [232, 90, 138], soft: [120, 95, 108] },
};

/** jsPDF's built-in fonts are Latin-1 only; keep the text legible. */
export function sanitizeForPdf(input: string | undefined | null): string {
  if (!input) return "";
  return String(input)
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "*")
    .replace(/[\u00a0\u2009\u202f]/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

/** "Dear Amara," for "Amara Okafor"; "Dear The Okafors," stays whole. */
export function salutationName(name: string): string {
  const n = sanitizeForPdf(name).trim();
  if (!n) return "friend";
  if (/^(the|mr|mrs|ms|dr|miss|mx)\b/i.test(n)) return n;
  return n.split(/\s+/)[0]!;
}

/**
 * Turn a free-typed address into mailing lines. Accepts newlines or commas.
 * "1640 Oakhurst Commons Dr, Apt 12B, Charlotte, NC 28210" becomes
 * ["1640 Oakhurst Commons Dr, Apt 12B", "Charlotte, NC 28210"].
 */
export function addressLines(address: string | undefined | null): string[] {
  const raw = sanitizeForPdf(address).trim();
  if (!raw) return [];
  if (raw.includes("\n")) {
    return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  }
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return parts;
  const last = parts[parts.length - 1]!;
  const stateZip = /^[A-Za-z]{2,}\.?\s+\d{5}(-\d{4})?$/.test(last) || /^[A-Z]{2}$/.test(last);
  const lines: string[] = [];
  if (stateZip && parts.length >= 3) {
    const city = parts[parts.length - 2]!;
    const street = parts.slice(0, parts.length - 2);
    lines.push(street.join(", "));
    lines.push(`${city}, ${last}`);
    // Zip as its own trailing part ("..., NC, 28210") gets folded in above
    // by the regex; a bare 5-digit part after a state is handled here.
  } else if (/^\d{5}(-\d{4})?$/.test(last) && parts.length >= 4) {
    const state = parts[parts.length - 2]!;
    const city = parts[parts.length - 3]!;
    lines.push(parts.slice(0, parts.length - 3).join(", "));
    lines.push(`${city}, ${state} ${last}`);
  } else {
    lines.push(parts.slice(0, -1).join(", "));
    lines.push(last);
  }
  return lines.filter(Boolean);
}

export function hasMailingAddress(g: Pick<Guest, "address">): boolean {
  return addressLines(g.address).length > 0;
}

function safeFilename(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "thank-you";
}

async function loadImageDataUrl(url: string): Promise<{ dataUrl: string; format: "JPEG" | "PNG"; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.type === "image/gif") return null; // animated: travels on the QR instead
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    // Cap at 1600px on the long side: plenty for 300 dpi on a 2.5 in photo.
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    return { dataUrl, format: "JPEG", w: canvas.width, h: canvas.height };
  } catch {
    return null;
  }
}

export type PrintGuest = Guest & { copyUrl?: string };

type CardArt = {
  photo: Awaited<ReturnType<typeof loadImageDataUrl>>;
};

/**
 * Draw one card with its top-left corner at (x, y). The background is drawn
 * `bleed` points beyond the trim on every side so a print shop can cut into
 * colour rather than a white edge.
 */
async function drawCard(
  pdf: jsPDF,
  x: number,
  y: number,
  bleed: number,
  card: ThankYouCard,
  eventTitle: string,
  guest: PrintGuest,
  art: CardArt,
) {
  const pal = PRINT_PALETTES[card.design] ?? PRINT_PALETTES.ivory;
  pdf.setFillColor(...pal.bg);
  pdf.rect(x - bleed, y - bleed, CARD_W + bleed * 2, CARD_H + bleed * 2, "F");

  // Hairline frame, 0.3 in inside the trim: safe from any home-printer drift.
  const frame = 0.3 * IN;
  pdf.setDrawColor(...pal.accent);
  pdf.setLineWidth(0.75);
  pdf.rect(x + frame, y + frame, CARD_W - frame * 2, CARD_H - frame * 2);

  const pad = 0.55 * IN;
  const hasPhoto = !!art.photo;
  const qrUrl = guest.copyUrl;
  const textLeft = x + pad;
  const textRight = hasPhoto ? x + CARD_W - pad - 2.1 * IN - 0.3 * IN : x + CARD_W - pad;
  const textW = textRight - textLeft;

  let cy = y + pad;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...pal.accent);
  pdf.text("T H A N K   Y O U", textLeft, cy + 6);
  cy += 20;

  pdf.setFont("times", "normal");
  pdf.setFontSize(20);
  pdf.setTextColor(...pal.ink);
  const titleLines = pdf.splitTextToSize(sanitizeForPdf(eventTitle), textW) as string[];
  pdf.text(titleLines.slice(0, 2), textLeft, cy + 16);
  cy += 16 + (Math.min(titleLines.length, 2) - 1) * 22 + 16;

  // Body: fit the message by shrinking from 11pt to 8pt, then truncate.
  const bottomReserve = (qrUrl ? 0.95 * IN : 0.35 * IN) + (card.signOff ? 22 : 0);
  const bodyBottom = y + CARD_H - pad - bottomReserve;
  const dear = `Dear ${salutationName(guest.name)},`;
  const body = sanitizeForPdf(card.message);
  let size = 11;
  let lines: string[] = [];
  let lineH = 0;
  for (; size >= 8; size -= 0.5) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(size);
    lineH = size * 1.42;
    lines = pdf.splitTextToSize(body, textW) as string[];
    const needed = lineH * (lines.length + 1.6);
    if (cy + needed <= bodyBottom) break;
  }
  const maxLines = Math.max(1, Math.floor((bodyBottom - cy) / lineH) - 2);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[lines.length - 1] = lines[lines.length - 1]!.replace(/[ ,.;:]*$/, "") + "...";
  }
  pdf.setFontSize(size);
  pdf.setTextColor(...pal.ink);
  pdf.text(dear, textLeft, cy + size);
  cy += lineH * 1.6;
  pdf.text(lines, textLeft, cy + size);
  cy += lineH * lines.length;

  if (card.signOff) {
    pdf.setFont("times", "italic");
    pdf.setFontSize(13);
    pdf.setTextColor(...pal.accent);
    const so = pdf.splitTextToSize(sanitizeForPdf(card.signOff), textW) as string[];
    pdf.text(so.slice(0, 1), textLeft, Math.min(cy + 22, bodyBottom + 22));
  }

  if (art.photo) {
    const boxW = 2.1 * IN;
    const boxH = CARD_H - pad * 2 - (qrUrl ? 0 : 0);
    const ratio = art.photo.w / art.photo.h;
    let w = boxW;
    let h = w / ratio;
    const maxH = Math.min(boxH, 2.9 * IN);
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    const px = x + CARD_W - pad - w;
    const py = y + pad;
    pdf.setFillColor(255, 255, 255);
    pdf.rect(px - 4, py - 4, w + 8, h + 8, "F");
    pdf.addImage(art.photo.dataUrl, art.photo.format, px, py, w, h);
  }

  if (qrUrl) {
    const qrSize = 0.8 * IN;
    const qx = x + CARD_W - pad - qrSize;
    const qy = y + CARD_H - pad - qrSize;
    try {
      const qr = await QRCode.toDataURL(qrUrl, { width: 320, margin: 1, errorCorrectionLevel: "M" });
      pdf.setFillColor(255, 255, 255);
      pdf.rect(qx - 3, qy - 3, qrSize + 6, qrSize + 6, "F");
      pdf.addImage(qr, "PNG", qx, qy, qrSize, qrSize);
    } catch {
      /* card still prints without the code */
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...pal.soft);
    const what =
      card.pieceKind === "letter"
        ? "a letter read aloud"
        : card.pieceKind === "poem"
          ? "a spoken-word piece"
          : card.pieceUrl
            ? "a song"
            : "a little animation";
    const cap = pdf.splitTextToSize(`Scan for ${what} made for you`, 1.3 * IN) as string[];
    pdf.text(cap.slice(0, 2), qx - 6, qy + qrSize - 8 - (cap.length > 1 ? 9 : 0), { align: "right" });
  }
}

export type CardPdfLayout = "shop" | "letter";

/** Build the card PDF. `shop` = one card per bleed page; `letter` = 2-up. */
export async function buildThankYouCardPdf(
  card: ThankYouCard,
  eventTitle: string,
  guests: PrintGuest[],
  layout: CardPdfLayout,
): Promise<jsPDF> {
  const art: CardArt = { photo: card.photo ? await loadImageDataUrl(card.photo) : null };
  if (layout === "shop") {
    const bleed = PRINT_BLEED_PT;
    const pageW = CARD_W + bleed * 2;
    const pageH = CARD_H + bleed * 2;
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [pageW, pageH] });
    for (let i = 0; i < guests.length; i++) {
      if (i > 0) pdf.addPage([pageW, pageH], "landscape");
      await drawCard(pdf, bleed, bleed, bleed, card, eventTitle, guests[i]!, art);
      drawCropMarks(pdf, bleed, CARD_W, CARD_H, false);
    }
    return pdf;
  }

  // US Letter portrait, two landscape cards stacked, cut lines in the margins.
  const pageW = 8.5 * IN;
  const pageH = 11 * IN;
  const gap = 18;
  const top = (pageH - CARD_H * 2 - gap) / 2; // 27pt = 0.375 in
  const left = (pageW - CARD_W) / 2; // 54pt = 0.75 in
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: [pageW, pageH] });
  for (let i = 0; i < guests.length; i += 2) {
    if (i > 0) pdf.addPage([pageW, pageH], "portrait");
    const pair = guests.slice(i, i + 2);
    for (let j = 0; j < pair.length; j++) {
      const y = top + j * (CARD_H + gap);
      await drawCard(pdf, left, y, 0, card, eventTitle, pair[j]!, art);
      // Cut ticks: outside each corner, never across the card.
      pdf.setDrawColor(150);
      pdf.setLineWidth(0.4);
      const tick = 14;
      const xs = [left, left + CARD_W];
      const ys = [y, y + CARD_H];
      for (const yy of ys) {
        pdf.line(left - tick - 4, yy, left - 4, yy);
        pdf.line(left + CARD_W + 4, yy, left + CARD_W + 4 + tick, yy);
      }
      for (const xx of xs) {
        pdf.line(xx, y - 4 - (j === 0 ? tick : gap / 2 - 2), xx, y - 4);
        pdf.line(xx, y + CARD_H + 4, xx, y + CARD_H + 4 + (j === pair.length - 1 ? tick : gap / 2 - 2));
      }
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(140);
    pdf.text("Print at 100% (no scaling) on Letter card stock. Cut along the marks for two 7 x 5 in cards.", pageW / 2, pageH - 10, { align: "center" });
  }
  return pdf;
}

/** Avery 5160: Letter sheet, 3 across x 10 down, 2.625 x 1 in labels. */
export const AVERY_5160 = {
  pageW: 8.5 * IN,
  pageH: 11 * IN,
  cols: 3,
  rows: 10,
  labelW: 2.625 * IN,
  labelH: 1 * IN,
  left: 0.1875 * IN,
  top: 0.5 * IN,
  pitchX: 2.75 * IN,
  pitchY: 1 * IN,
  perSheet: 30,
};

/**
 * Mailing labels. `startAt` (1-30) lets a partly used sheet be reused.
 * `guides` draws faint label outlines for an alignment test on plain paper.
 */
export function buildAveryLabelsPdf(
  guests: Guest[],
  options: { startAt?: number; guides?: boolean } = {},
): jsPDF {
  const A = AVERY_5160;
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: [A.pageW, A.pageH] });
  const startAt = Math.min(Math.max(options.startAt ?? 1, 1), A.perSheet) - 1;
  const entries = guests.filter(hasMailingAddress);
  const inset = 0.15 * IN;
  const textW = A.labelW - inset * 2;
  let slot = startAt;
  let first = true;
  const drawGuides = () => {
    if (!options.guides) return;
    pdf.setDrawColor(200);
    pdf.setLineWidth(0.3);
    for (let r = 0; r < A.rows; r++) {
      for (let c = 0; c < A.cols; c++) {
        pdf.roundedRect(A.left + c * A.pitchX, A.top + r * A.pitchY, A.labelW, A.labelH, 6, 6);
      }
    }
  };
  drawGuides();
  for (const g of entries) {
    if (slot >= A.perSheet) {
      pdf.addPage([A.pageW, A.pageH], "portrait");
      drawGuides();
      slot = 0;
    }
    first = false;
    const r = Math.floor(slot / A.cols);
    const c = slot % A.cols;
    const lx = A.left + c * A.pitchX;
    const ly = A.top + r * A.pitchY;
    const lines = [sanitizeForPdf(g.name).trim(), ...addressLines(g.address)];
    // Shrink until every line fits the width and the block fits the height.
    let size = 10;
    let wrapped: string[] = lines;
    for (; size >= 6.5; size -= 0.5) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(size);
      wrapped = lines.flatMap((l) => pdf.splitTextToSize(l, textW) as string[]);
      if (wrapped.length * size * 1.22 <= A.labelH - inset * 1.4) break;
    }
    const lineH = size * 1.22;
    const blockH = wrapped.length * lineH;
    let ty = ly + (A.labelH - blockH) / 2 + size * 0.85;
    pdf.setTextColor(20);
    wrapped.forEach((line, i) => {
      pdf.setFont("helvetica", i === 0 ? "bold" : "normal");
      pdf.text(line, lx + inset, ty);
      ty += lineH;
    });
    slot += 1;
  }
  if (first) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(90);
    pdf.text("None of the selected guests has a mailing address yet.", A.pageW / 2, A.pageH / 2, { align: "center" });
  }
  return pdf;
}

/** A7 envelopes (7.25 x 5.25 in), one page per addressed guest. */
export function buildA7EnvelopesPdf(guests: Guest[], returnAddress?: string): jsPDF {
  const W = 7.25 * IN;
  const H = 5.25 * IN;
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [W, H] });
  const entries = guests.filter(hasMailingAddress);
  const ret = addressLines(returnAddress);
  entries.forEach((g, i) => {
    if (i > 0) pdf.addPage([W, H], "landscape");
    if (ret.length) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(40);
      let ry = 0.45 * IN;
      for (const l of ret.slice(0, 4)) {
        pdf.text(l, 0.45 * IN, ry);
        ry += 11;
      }
    }
    const lines = [sanitizeForPdf(g.name).trim(), ...addressLines(g.address)];
    const maxW = 3.6 * IN;
    let size = 12;
    let wrapped = lines;
    for (; size >= 9; size -= 0.5) {
      pdf.setFontSize(size);
      wrapped = lines.flatMap((l) => pdf.splitTextToSize(l, maxW) as string[]);
      if (wrapped.length <= 6) break;
    }
    const lineH = size * 1.3;
    let ty = 2.35 * IN;
    const tx = 2.9 * IN;
    pdf.setTextColor(20);
    wrapped.forEach((line, k) => {
      pdf.setFont("helvetica", k === 0 ? "bold" : "normal");
      pdf.setFontSize(size);
      pdf.text(line, tx, ty);
      ty += lineH;
    });
  });
  if (!entries.length) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(90);
    pdf.text("None of the selected guests has a mailing address yet.", W / 2, H / 2, { align: "center" });
  }
  return pdf;
}

export function savePdf(pdf: jsPDF, base: string, suffix: string) {
  pdf.save(`${safeFilename(base)}-${suffix}.pdf`);
}
