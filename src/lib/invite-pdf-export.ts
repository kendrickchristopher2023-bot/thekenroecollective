import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { formatEventDate, type KEvent } from "@/lib/events-store";

/**
 * Single-page invitation PDF exporter — designed to be printed at home
 * and mailed by the host. Generates a clean one-pager with the event
 * info + a scannable RSVP QR code, in the size the host picks.
 *
 * Printing is on the customer. We do not charge an add-on for this.
 */

export type InvitePageSize = {
  id: string;
  label: string;
  /** Width / height in points (1pt = 1/72 inch). */
  width: number;
  height: number;
  /** Notes shown in the picker. */
  note?: string;
};

const IN = 72; // 1 inch in points

export const INVITE_PAGE_SIZES: InvitePageSize[] = [
  { id: "letter", label: 'US Letter (8.5 × 11")', width: 8.5 * IN, height: 11 * IN, note: "Standard home printer" },
  { id: "a4", label: "A4 (210 × 297 mm)", width: 595.28, height: 841.89, note: "International standard" },
  { id: "5x7", label: '5 × 7" greeting card', width: 5 * IN, height: 7 * IN, note: "Fits standard A7 envelopes" },
  { id: "4x6", label: '4 × 6" postcard', width: 4 * IN, height: 6 * IN, note: "Postcard-sized invite" },
  { id: "square5", label: '5 × 5" square', width: 5 * IN, height: 5 * IN, note: "Square boutique invite" },
  { id: "half-letter", label: 'Half-Letter (5.5 × 8.5")', width: 5.5 * IN, height: 8.5 * IN, note: "Two per Letter sheet" },
];

function sanitizeForPdf(input: string | undefined | null): string {
  if (!input) return "";
  return String(input)
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "*")
    .replace(/[   ]/g, " ")
    // jsPDF's built-in Type1 fonts (helvetica/times) use WinAnsi encoding.
    // Anything outside Latin-1 gets rendered as a broken glyph sequence
    // (the "&<char>&<char>" artifact we saw). Strip those characters so the
    // one-pager stays legible.
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

const CREAM: [number, number, number] = [250, 246, 236]; // paper
const VELVET: [number, number, number] = [92, 29, 29]; // #5c1d1d — default accent
const GOLD: [number, number, number] = [212, 175, 55];
const INK_SOFT: [number, number, number] = [60, 50, 45];

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function relLuminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Contrast ratio against the cream paper background. */
function contrastOnCream(rgb: RGB): number {
  const l1 = relLuminance(CREAM);
  const l2 = relLuminance(rgb);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The host's "Card color" (event.color) drives the printed one-pager's accent —
 * the same hex the guest-facing invite page uses. Very light picks are darkened
 * until they clear a readable contrast ratio on the cream paper; anything
 * unparseable falls back to the velvet default.
 */
function resolveAccent(color: string | undefined | null): RGB {
  if (!color) return VELVET;
  const rgb = hexToRgb(color);
  if (!rgb) return VELVET;
  let out: RGB = rgb;
  // Darken toward black until legible on cream (4.5:1 body-text threshold).
  for (let i = 0; i < 24 && contrastOnCream(out) < 4.5; i++) {
    out = [Math.round(out[0] * 0.88), Math.round(out[1] * 0.88), Math.round(out[2] * 0.88)];
  }
  return out;
}


/**
 * Lays out the invite content starting at `startY` and returns the y
 * position just after the last element. Called twice: once with
 * draw=false purely to measure the total content height, then again
 * with draw=true (from a startY chosen to center that height on the
 * page) to actually paint it. Keeping this in one function means the
 * measured layout can never drift from the drawn one.
 *
 * `k` scales every type size, gap and the QR block together. Small
 * formats (4x6, 5x5) cannot fit the full-size layout, and without this
 * the QR used to run off the bottom of the page and through the gold
 * border. `bodyLineLimit` is the last resort for a very long message:
 * we drop message lines rather than clip the QR, which is the part
 * guests actually have to scan.
 */
function layoutInviteContent(
  pdf: jsPDF,
  event: KEvent,
  W: number,
  H: number,
  margin: number,
  startY: number,
  qr: { show: boolean; dataUrl: string | null },
  draw: boolean,
  k = 1,
  bodyLineLimit?: number,
): number {
  const cx = W / 2;
  let y = startY;
  // Host's card color drives the accent; velvet when unset/unreadable.
  const accent = resolveAccent(event.color);

  // Eyebrow — italic serif, accent, matches "You're invited" chip
  pdf.setFont("times", "italic");
  pdf.setFontSize(Math.min(11, W * 0.022) * k);
  if (draw) {
    pdf.setTextColor(...accent);
    pdf.text("YOU'RE INVITED", cx, y, { align: "center", charSpace: 2 * k });
  }

  // Title — serif, accent, matches the hero
  y += Math.min(38, H * 0.058) * k;
  pdf.setFont("times", "normal");
  const titleSize = Math.max(20, Math.min(40, W * 0.062)) * k;
  pdf.setFontSize(titleSize);
  const titleLines = pdf.splitTextToSize(sanitizeForPdf(event.title), W - margin * 2);
  if (draw) {
    // Host-chosen invitation text color wins over the card accent when set.
    pdf.setTextColor(...(hexToRgb(event.textColor || "") ?? accent));
    pdf.text(titleLines, cx, y, { align: "center" });
  }
  y += titleLines.length * titleSize * 1.05;

  // Hairline rule — accent
  y += 10 * k;
  if (draw) {
    pdf.setDrawColor(...accent);
    pdf.setLineWidth(0.5);
    pdf.line(cx - 44 * k, y, cx + 44 * k, y);
  }
  y += 22 * k;

  // Date / time — serif, ink
  // Same hierarchy as the invite hero: weekday eyebrow, prominent date,
  // tracked time. Mirrored here so print and screen never drift.
  const d = formatEventDate(event.date, event.timezone);
  const inkForText = hexToRgb(event.textColor || "") ?? INK_SOFT;
  pdf.setFont("times", "normal");
  pdf.setFontSize(Math.min(11, W * 0.021) * k);
  if (draw) {
    pdf.setTextColor(...inkForText);
    pdf.text(sanitizeForPdf(d.weekday.toUpperCase()), cx, y, { align: "center", charSpace: 2 * k });
  }
  y += 20 * k;
  const dateSize = Math.max(16, Math.min(26, W * 0.042)) * k;
  pdf.setFontSize(dateSize);
  if (draw) pdf.text(sanitizeForPdf(d.dateOnly), cx, y, { align: "center" });
  y += dateSize * 1.1;
  pdf.setFontSize(Math.min(13, W * 0.026) * k);
  if (draw) pdf.text(sanitizeForPdf(d.time), cx, y, { align: "center", charSpace: 1 * k });
  y += 26 * k;

  // Venue — bold serif
  if (event.venue) {
    pdf.setFont("times", "bold");
    pdf.setFontSize(Math.min(15, W * 0.03) * k);
    if (draw) pdf.text(sanitizeForPdf(event.venue), cx, y, { align: "center" });
    y += 18 * k;
  }
  if (event.address) {
    pdf.setFont("times", "normal");
    pdf.setFontSize(Math.min(13, W * 0.026) * k);
    const addrLines = pdf.splitTextToSize(sanitizeForPdf(event.address), W - margin * 2);
    if (draw) pdf.text(addrLines, cx, y, { align: "center" });
    y += addrLines.length * 15 * k;
  }

  // Message — italic serif quote
  const body = sanitizeForPdf((event.message || event.description || "").trim());
  if (body) {
    y += 16 * k;
    pdf.setFont("times", "italic");
    pdf.setFontSize(Math.min(13, W * 0.025) * k);
    const maxBodyWidth = W - margin * 2.4;
    const bodyLines = pdf.splitTextToSize(body, maxBodyWidth);
    const roomLines = Math.max(2, Math.floor((H * 0.5) / (15 * k)));
    const maxLines = Math.max(1, Math.min(roomLines, bodyLineLimit ?? roomLines));
    const shown = bodyLines.slice(0, maxLines);
    if (draw) {
      pdf.setTextColor(...INK_SOFT);
      pdf.text(shown, cx, y, { align: "center" });
    }
    y += shown.length * 15 * k;
  }

  // QR code — flows naturally after the content instead of being pinned
  // to the bottom of the page, so the whole block can be centered.
  if (qr.show) {
    y += 34 * k;
    const qrPx = Math.min(W, H) * 0.28 * k;
    if (draw && qr.dataUrl) {
      pdf.addImage(qr.dataUrl, "PNG", cx - qrPx / 2, y, qrPx, qrPx);
    }
    y += qrPx + 16 * k;
    pdf.setFont("times", "italic");
    pdf.setFontSize(Math.min(10, W * 0.02) * k);
    if (draw) {
      pdf.setTextColor(...accent);
      pdf.text("Scan to RSVP", cx, y, { align: "center" });
    }
    if (event.hashtag) {
      y += 14 * k;
      if (draw) {
        const tag = sanitizeForPdf(event.hashtag.startsWith("#") ? event.hashtag : `#${event.hashtag}`);
        pdf.setTextColor(...INK_SOFT);
        pdf.text(tag, cx, y, { align: "center" });
      }
    }
  }

  return y;
}

/** Smallest scale we will shrink to before dropping message lines instead. */
export const INVITE_MIN_SCALE = 0.62;

/**
 * Picks the largest scale (and, if needed, message line budget) whose
 * measured content height fits inside the printable area, leaving a clear
 * gap between the last line and the gold border.
 */
export function fitInviteLayout(
  measure: (k: number, bodyLineLimit?: number) => number,
  available: number,
): { k: number; bodyLineLimit?: number } {
  const full = measure(1);
  if (full <= available) return { k: 1 };
  // One proportional guess, then a short refinement — measured height is not
  // perfectly linear in k because line wrapping changes with type size.
  let k = Math.max(INVITE_MIN_SCALE, Math.min(1, available / full));
  for (let i = 0; i < 8 && measure(k) > available; i += 1) {
    k = Math.max(INVITE_MIN_SCALE, k - 0.04);
    if (k === INVITE_MIN_SCALE) break;
  }
  if (measure(k) <= available) return { k };
  // Still too tall at the floor: shed message lines rather than clip the QR.
  for (let lines = 6; lines >= 1; lines -= 1) {
    if (measure(k, lines) <= available) return { k, bodyLineLimit: lines };
  }
  return { k, bodyLineLimit: 0 };
}

export async function buildInviteOnePagerPdf(
  event: KEvent,
  options: { sizeId?: string; inviteUrl?: string } = {},
) {
  const size = INVITE_PAGE_SIZES.find((s) => s.id === options.sizeId) ?? INVITE_PAGE_SIZES[0];
  const inviteUrl =
    options.inviteUrl ??
    event.rsvpUrl ??
    (typeof window !== "undefined" ? `${window.location.origin}/invite/${event.id}` : "");

  const pdf = new jsPDF({ orientation: size.width > size.height ? "landscape" : "portrait", unit: "pt", format: [size.width, size.height] });
  const W = size.width;
  const H = size.height;
  const margin = Math.min(W, H) * 0.07;

  // Full-bleed paper background
  pdf.setFillColor(...CREAM);
  pdf.rect(0, 0, W, H, "F");

  // Outer border — gold hairline like the app card
  pdf.setDrawColor(...GOLD);
  pdf.setLineWidth(0.75);
  pdf.roundedRect(margin / 2, margin / 2, W - margin, H - margin, 14, 14);

  let qrDataUrl: string | null = null;
  if (inviteUrl) {
    try {
      qrDataUrl = await QRCode.toDataURL(inviteUrl, { width: 480, margin: 1 });
    } catch {
      /* ignore */
    }
  }

  const qr = { show: !!inviteUrl, dataUrl: qrDataUrl };

  // Clear space we always keep between the content block and the gold border.
  const breathingRoom = Math.min(W, H) * 0.045;
  const available = H - margin * 2 - breathingRoom;

  // Pass 1: measure, shrinking the whole layout until it fits the page.
  const measure = (k: number, bodyLineLimit?: number) =>
    layoutInviteContent(pdf, event, W, H, margin, 0, qr, false, k, bodyLineLimit);
  const { k, bodyLineLimit } = fitInviteLayout(measure, available);
  const contentHeight = measure(k, bodyLineLimit);

  // Pass 2: center that block vertically inside the card, then draw for real.
  const centeredTop = margin + breathingRoom / 2 + (available - contentHeight) / 2;
  const startY = Math.max(margin + breathingRoom / 2 + 8, centeredTop);
  layoutInviteContent(pdf, event, W, H, margin, startY, qr, true, k, bodyLineLimit);

  return { pdf, size };
}


export async function exportInviteOnePagerPdf(
  event: KEvent,
  options: { sizeId?: string; inviteUrl?: string } = {},
) {
  const { pdf, size } = await buildInviteOnePagerPdf(event, options);
  pdf.save(`${safeFilename(event.title) || "invitation"}-${size.id}.pdf`);
}

/**
 * Build the same one-pager and return an object URL for previewing / printing
 * in a new browser tab. Caller is responsible for revoking the URL.
 */
export async function getInviteOnePagerBlobUrl(
  event: KEvent,
  options: { sizeId?: string; inviteUrl?: string } = {},
): Promise<string> {
  const { pdf } = await buildInviteOnePagerPdf(event, options);
  return pdf.output("bloburl") as unknown as string;
}

function safeFilename(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}
