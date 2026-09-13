// Design Studio — template catalog (client-safe, no server imports).
// Each template is a self-contained schema the renderer + editor both consume.

export type DesignKind = "menu" | "package" | "apparel" | "signage" | "favor" | "thank_you";

export type FieldType = "text" | "longtext" | "list" | "image" | "color" | "emoji";

export type TemplateField = {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  defaultValue?: any;
  maxLength?: number;
};

export type DesignTemplate = {
  id: string;
  kind: DesignKind;
  name: string;
  blurb: string;
  // Canvas in CSS px at 1x; PDF exports at 2x via jsPDF.
  width: number;
  height: number;
  palette: { bg: string; fg: string; accent: string; muted: string };
  fontFamily: { display: string; body: string };
  fields: TemplateField[];
  // Multi-page support — array of page IDs. Defaults to ["main"]. The
  // renderer branches on (template.id, pageId) to draw extra pages.
  pages?: string[];
};

export function pagesOf(t: DesignTemplate): string[] {
  return t.pages && t.pages.length > 0 ? t.pages : ["main"];
}

const palettes = {
  velvet: { bg: "#0F0B0B", fg: "#F5EFE6", accent: "#D4B483", muted: "#A38560" },
  cream: { bg: "#F5EFE6", fg: "#1A1410", accent: "#5C1D1D", muted: "#A38560" },
  midnight: { bg: "#0F172A", fg: "#F8FAFC", accent: "#3B82F6", muted: "#94A3B8" },
  blush: { bg: "#FDF2F4", fg: "#3A1419", accent: "#B8576A", muted: "#C9A0A8" },
  forest: { bg: "#F4F1E8", fg: "#1F2D1F", accent: "#3D5B3D", muted: "#7A8B7A" },
};

const fonts = {
  editorial: { display: "Playfair Display, Georgia, serif", body: "Inter, system-ui, sans-serif" },
  modern: { display: "Outfit, system-ui, sans-serif", body: "Inter, system-ui, sans-serif" },
  classic: { display: "Cormorant Garamond, Georgia, serif", body: "Lato, system-ui, sans-serif" },
};

export const TEMPLATES: DesignTemplate[] = [
  // ── Menus ──────────────────────────────────────────────────
  {
    id: "menu_editorial",
    kind: "menu",
    name: "Editorial menu",
    blurb: "Single-page tasting menu with course markers.",
    width: 600, height: 800, palette: palettes.cream, fontFamily: fonts.editorial,
    fields: [
      { key: "eyebrow", label: "Eyebrow", type: "text", defaultValue: "An evening of", maxLength: 40 },
      { key: "title", label: "Title", type: "text", defaultValue: "Menu", maxLength: 60 },
      { key: "subtitle", label: "Subtitle", type: "text", defaultValue: "Curated by the house", maxLength: 80 },
      { key: "courses", label: "Courses", type: "list", defaultValue: [
        { name: "First", desc: "Heirloom tomato, basil oil, sea salt", emoji: "🍅", badges: ["Vegan","GF"] },
        { name: "Second", desc: "Burrata, pickled stone fruit, olive crumb", emoji: "🧀", badges: [] },
        { name: "Main", desc: "Braised short rib, smoked carrot, jus", emoji: "🥩", badges: [] },
        { name: "Sweet", desc: "Olive oil cake, candied citrus, crème", emoji: "🍰", badges: [] },
      ]},
      { key: "footer", label: "Footer note", type: "text", defaultValue: "Please advise of any allergies", maxLength: 100 },
    ],
  },
  {
    id: "menu_midnight",
    kind: "menu",
    name: "Midnight tasting",
    blurb: "Dark, dramatic menu for late-night dinners.",
    width: 600, height: 800, palette: palettes.velvet, fontFamily: fonts.classic,
    fields: [
      { key: "eyebrow", label: "Eyebrow", type: "text", defaultValue: "Twelve courses", maxLength: 40 },
      { key: "title", label: "Title", type: "text", defaultValue: "Nocturne", maxLength: 60 },
      { key: "subtitle", label: "Subtitle", type: "text", defaultValue: "A study in slow fire", maxLength: 80 },
      { key: "courses", label: "Courses", type: "list", defaultValue: [
        { name: "Amuse", desc: "Charred onion broth, gold leaf", emoji: "✨", badges: [] },
        { name: "Sea", desc: "Hand-dived scallop, brown butter", emoji: "🦪", badges: [] },
        { name: "Garden", desc: "Roast beets, hazelnut, smoked yogurt", emoji: "🌿", badges: ["V"] },
        { name: "Hearth", desc: "Aged ribeye, bone marrow, char", emoji: "🔥", badges: [] },
        { name: "Final", desc: "Burnt honey ice cream, sea salt", emoji: "🍯", badges: [] },
      ]},
      { key: "footer", label: "Footer note", type: "text", defaultValue: "Wines paired on request", maxLength: 100 },
    ],
  },
  // ── Packages ───────────────────────────────────────────────
  {
    id: "package_onepager",
    kind: "package",
    name: "Package one-pager",
    blurb: "Single-sheet leave-behind with three tiers.",
    width: 800, height: 1000, palette: palettes.cream, fontFamily: fonts.modern,
    fields: [
      { key: "title", label: "Title", type: "text", defaultValue: "The Atelier Suite", maxLength: 60 },
      { key: "subtitle", label: "Subtitle", type: "text", defaultValue: "Three considered tiers", maxLength: 80 },
      { key: "hero_image", label: "Hero image", type: "image", defaultValue: "" },
      { key: "tiers", label: "Tiers", type: "list", defaultValue: [
        { name: "Essentials", price: "$2,400", includes: ["Coordination","Floral basics","Bar service"] },
        { name: "Signature", price: "$4,800", includes: ["Full planning","Premium florals","Live music","Photography"] },
        { name: "Atelier", price: "$8,200", includes: ["White-glove planning","Bespoke florals","Quartet","Cinematography","Custom favors"] },
      ]},
      { key: "footer", label: "Footer", type: "text", defaultValue: "Pricing for 80 guests · custom quotes on request", maxLength: 120 },
    ],
  },
  // ── Multi-page book menu ───────────────────────────────────
  {
    id: "menu_book",
    kind: "menu",
    name: "Book menu (2 pages)",
    blurb: "Folded book — front cover + course list inside.",
    width: 600, height: 800, palette: palettes.cream, fontFamily: fonts.editorial,
    pages: ["cover", "inside"],
    fields: [
      { key: "eyebrow", label: "Eyebrow", type: "text", defaultValue: "An evening of", maxLength: 40 },
      { key: "title", label: "Title", type: "text", defaultValue: "Menu", maxLength: 60 },
      { key: "subtitle", label: "Subtitle", type: "text", defaultValue: "Curated by the house", maxLength: 80 },
      { key: "courses", label: "Courses", type: "list", defaultValue: [
        { name: "First", desc: "Heirloom tomato, basil oil, sea salt", emoji: "🍅", badges: ["Vegan","GF"] },
        { name: "Second", desc: "Burrata, pickled stone fruit, olive crumb", emoji: "🧀", badges: [] },
        { name: "Main", desc: "Braised short rib, smoked carrot, jus", emoji: "🥩", badges: [] },
        { name: "Sweet", desc: "Olive oil cake, candied citrus, crème", emoji: "🍰", badges: [] },
      ]},
      { key: "footer", label: "Footer note", type: "text", defaultValue: "Please advise of any allergies", maxLength: 100 },
    ],
  },
  // ── Apparel ────────────────────────────────────────────────
  {
    id: "apparel_crest",
    kind: "apparel",
    name: "Tee — crest",
    blurb: "Front-center crest with date.",
    width: 600, height: 700, palette: palettes.midnight, fontFamily: fonts.classic,
    fields: [
      { key: "shirt_color", label: "Shirt color", type: "color", defaultValue: "#111827" },
      { key: "ink_color", label: "Ink color", type: "color", defaultValue: "#F5EFE6" },
      { key: "top", label: "Top text", type: "text", defaultValue: "EST · 2026", maxLength: 30 },
      { key: "monogram", label: "Monogram / icon", type: "text", defaultValue: "K", maxLength: 4 },
      { key: "bottom", label: "Bottom text", type: "text", defaultValue: "THE COLLECTIVE", maxLength: 30 },
      { key: "tagline", label: "Tagline", type: "text", defaultValue: "Made with love", maxLength: 40 },
    ],
  },
  {
    id: "apparel_event",
    kind: "apparel",
    name: "Tee — event (front + back)",
    blurb: "Bold typography tee with optional back print.",
    width: 600, height: 700, palette: palettes.blush, fontFamily: fonts.editorial,
    pages: ["front", "back"],
    fields: [
      { key: "shirt_color", label: "Shirt color", type: "color", defaultValue: "#FDF2F4" },
      { key: "ink_color", label: "Ink color", type: "color", defaultValue: "#3A1419" },
      { key: "headline", label: "Headline (front)", type: "text", defaultValue: "Together", maxLength: 24 },
      { key: "sub", label: "Sub (front)", type: "text", defaultValue: "Sarah & James", maxLength: 40 },
      { key: "date", label: "Date (front)", type: "text", defaultValue: "06 · 21 · 2026", maxLength: 24 },
      { key: "place", label: "Place (front)", type: "text", defaultValue: "Charleston · SC", maxLength: 40 },
      { key: "back_text", label: "Back print", type: "text", defaultValue: "EST · 2026", maxLength: 40 },
      { key: "back_number", label: "Back number", type: "text", defaultValue: "06", maxLength: 4 },
    ],
  },
  // ── Signage ────────────────────────────────────────────────
  {
    id: "signage_welcome",
    kind: "signage",
    name: "Welcome sign",
    blurb: "Tall portrait welcome sign for entry.",
    width: 600, height: 900, palette: palettes.forest, fontFamily: fonts.editorial,
    fields: [
      { key: "eyebrow", label: "Eyebrow", type: "text", defaultValue: "Welcome to", maxLength: 30 },
      { key: "headline", label: "Headline", type: "text", defaultValue: "The Garden", maxLength: 40 },
      { key: "subline", label: "Sub line", type: "text", defaultValue: "Sarah & James · 06.21.2026", maxLength: 60 },
      { key: "footer", label: "Footer", type: "text", defaultValue: "Cocktails on the lawn · dinner at seven", maxLength: 90 },
      { key: "emoji", label: "Accent emoji", type: "emoji", defaultValue: "🌿" },
    ],
  },
  // ── Favor tag ──────────────────────────────────────────────
  {
    id: "favor_tag",
    kind: "favor",
    name: "Favor tag",
    blurb: "Small square gift/favor tag.",
    width: 500, height: 500, palette: palettes.blush, fontFamily: fonts.classic,
    fields: [
      { key: "headline", label: "Headline", type: "text", defaultValue: "Thank you", maxLength: 24 },
      { key: "sub", label: "Sub", type: "text", defaultValue: "for celebrating with us", maxLength: 60 },
      { key: "signature", label: "Signature", type: "text", defaultValue: "— S & J", maxLength: 24 },
      { key: "emoji", label: "Emoji", type: "emoji", defaultValue: "🤍" },
    ],
  },
  // ── Thank-you card ─────────────────────────────────────────
  {
    id: "thankyou_card",
    kind: "thank_you",
    name: "Thank-you card",
    blurb: "Landscape thank-you with photo.",
    width: 900, height: 600, palette: palettes.cream, fontFamily: fonts.editorial,
    fields: [
      { key: "photo", label: "Photo", type: "image", defaultValue: "" },
      { key: "headline", label: "Headline", type: "text", defaultValue: "With gratitude", maxLength: 40 },
      { key: "body", label: "Body", type: "longtext", defaultValue: "Thank you for being part of our day. Your presence meant everything.", maxLength: 280 },
      { key: "signature", label: "Signature", type: "text", defaultValue: "— Sarah & James", maxLength: 40 },
    ],
  },
];

export function getTemplate(id: string): DesignTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function defaultContentFor(template: DesignTemplate): Record<string, any> {
  const out: Record<string, any> = {
    palette: { ...template.palette },
    fontFamily: { ...template.fontFamily },
  };
  for (const f of template.fields) out[f.key] = structuredClone(f.defaultValue ?? "");
  return out;
}
