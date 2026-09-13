// Client-safe helpers for AI Packages: allergen extraction, cost rollups, PDF export.
import type { AiPackageRow, AiPackageContent } from "@/lib/ai-packages.functions";
import { formatTimestamp } from "@/lib/datetime";

// ---------- Allergen / dietary badges ------------------------------------
const ALLERGEN_PATTERNS: Array<{ label: string; re: RegExp; tone: "warn" | "info" }> = [
  { label: "Vegan", re: /\bvegan\b/i, tone: "info" },
  { label: "Vegetarian", re: /\bvegetarian\b/i, tone: "info" },
  { label: "Gluten-free", re: /\b(gluten[- ]free|gf)\b/i, tone: "info" },
  { label: "Dairy-free", re: /\b(dairy[- ]free|df|lactose[- ]free)\b/i, tone: "info" },
  { label: "Nut-free", re: /\bnut[- ]free\b/i, tone: "info" },
  { label: "Halal", re: /\bhalal\b/i, tone: "info" },
  { label: "Kosher", re: /\bkosher\b/i, tone: "info" },
  { label: "Contains nuts", re: /\b(peanut|almond|walnut|cashew|pecan|hazelnut|pistachio|tree nut)s?\b/i, tone: "warn" },
  { label: "Contains shellfish", re: /\b(shellfish|shrimp|prawn|crab|lobster|oyster|mussel|scallop)s?\b/i, tone: "warn" },
  { label: "Contains dairy", re: /\b(cheese|milk|butter|cream|yogurt|yoghurt|parmesan|mozzarella|ricotta)\b/i, tone: "warn" },
  { label: "Contains gluten", re: /\b(wheat|bread|pasta|flour|crouton|barley|rye)\b/i, tone: "warn" },
  { label: "Contains egg", re: /\b(eggs?|aioli|mayonnaise)\b/i, tone: "warn" },
  { label: "Contains soy", re: /\b(soy|tofu|edamame|tempeh)\b/i, tone: "warn" },
  { label: "Contains alcohol", re: /\b(wine|beer|champagne|prosecco|bourbon|whisk(e)?y|vodka|gin|rum|tequila|cocktail|liqueur)\b/i, tone: "warn" },
];

export type Allergen = { label: string; tone: "warn" | "info" };

export function extractAllergens(pkg: AiPackageRow): Allergen[] {
  const c = pkg.content;
  const haystacks: string[] = [c.summary ?? ""];
  for (const s of c.sections ?? []) {
    for (const it of s.items ?? []) {
      haystacks.push(it.name, it.description ?? "", it.notes ?? "");
    }
  }
  const text = haystacks.join(" \n ");
  const seen = new Map<string, Allergen>();
  for (const p of ALLERGEN_PATTERNS) {
    if (p.re.test(text) && !seen.has(p.label)) {
      seen.set(p.label, { label: p.label, tone: p.tone });
    }
  }
  return Array.from(seen.values());
}

// ---------- Live cost rollup --------------------------------------------
export type CostRollup = {
  itemsTotalCents: number;
  itemCount: number;
  perGuestCents: number | null;
  estimatedTotalCents: number | null;
};

export function rollupCost(pkg: Pick<AiPackageRow, "content" | "guest_count">): CostRollup {
  let total = 0;
  let count = 0;
  for (const s of pkg.content.sections ?? []) {
    for (const it of s.items ?? []) {
      if (typeof it.price_cents === "number") {
        total += it.price_cents;
        count += 1;
      }
    }
  }
  const guests = pkg.guest_count ?? null;
  const estimated = pkg.content.estimated_total_cents ?? null;
  return {
    itemsTotalCents: total,
    itemCount: count,
    perGuestCents: guests && total > 0 ? Math.round(total / guests) : null,
    estimatedTotalCents: estimated,
  };
}

export function fmtUsd(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------- PDF export (lazy import of jsPDF) ----------------------------
export async function exportPackageToPdf(pkg: AiPackageRow): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 56;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = margin;
  const c = pkg.content as AiPackageContent;

  const ensureSpace = (h: number) => {
    if (y + h > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };
  const writeWrapped = (text: string, size: number, opts: { bold?: boolean; gap?: number } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, contentWidth) as string[];
    for (const line of lines) {
      ensureSpace(size + 4);
      doc.text(line, margin, y);
      y += size + 4;
    }
    y += opts.gap ?? 4;
  };

  writeWrapped(c.title || pkg.title || "Package", 22, { bold: true, gap: 8 });
  if (c.summary) writeWrapped(c.summary, 11, { gap: 10 });

  const meta: string[] = [];
  if (pkg.guest_count) meta.push(`Guests: ${pkg.guest_count}`);
  if (pkg.budget_cents) meta.push(`Budget: ${fmtUsd(pkg.budget_cents)}`);
  const roll = rollupCost(pkg);
  if (roll.itemsTotalCents > 0) meta.push(`Items total: ${fmtUsd(roll.itemsTotalCents)}`);
  if (roll.perGuestCents) meta.push(`Per guest: ${fmtUsd(roll.perGuestCents)}`);
  if (meta.length) writeWrapped(meta.join("   ·   "), 10, { gap: 14 });

  for (const s of c.sections ?? []) {
    writeWrapped(s.heading.toUpperCase(), 12, { bold: true, gap: 4 });
    for (const it of s.items ?? []) {
      const price = typeof it.price_cents === "number" ? `   ${fmtUsd(it.price_cents)}` : "";
      writeWrapped(`• ${it.name}${price}`, 11, { bold: true, gap: 2 });
      if (it.description) writeWrapped(`   ${it.description}`, 10, { gap: 2 });
    }
    y += 6;
  }

  if (c.tiers?.length) {
    writeWrapped("TIERS", 12, { bold: true, gap: 4 });
    for (const t of c.tiers) {
      const price = typeof t.price_cents === "number" ? `   ${fmtUsd(t.price_cents)}` : "";
      writeWrapped(`${t.name}${price}`, 11, { bold: true, gap: 2 });
      for (const inc of t.includes) writeWrapped(`   • ${inc}`, 10, { gap: 2 });
      y += 6;
    }
  }

  const allergens = extractAllergens(pkg);
  if (allergens.length) {
    writeWrapped("DIETARY & ALLERGEN NOTES", 12, { bold: true, gap: 4 });
    writeWrapped(allergens.map((a) => a.label).join(", "), 10, { gap: 8 });
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("Composed by The Kenroe Collective — Packages & Menus", margin, pageHeight - 28);

  const safeTitle = (c.title || pkg.title || "package").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
  doc.save(`${safeTitle || "package"}.pdf`);
}
