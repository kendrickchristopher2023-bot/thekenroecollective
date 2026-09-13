// Group eCards (Venture 02) theme presets. Client-safe, no server imports.

export type EcardTheme = {
  id: string;
  name: string;
  blurb: string;
  /** Page background (CSS value, used inline). */
  bg: string;
  /** Card surface color. */
  surface: string;
  /** Primary ink color on the surface. */
  ink: string;
  /** Accent used for buttons, rules, and highlights. */
  accent: string;
  /** Accent foreground. */
  accentInk: string;
  /** Display font stack for headlines. */
  display: string;
  motif: string;
  /** Picker grouping label. Older themes default to "House styles". */
  group: string;
};

export const ECARD_THEME_GROUPS = [
  "House styles",
  "Birthdays and congratulations",
  "Farewells and milestones",
  "Care and thanks",
  "Seasonal",
] as const;

export const ECARD_THEMES: EcardTheme[] = [
  {
    id: "confetti",
    name: "Confetti",
    blurb: "Bright and celebratory. Great for birthdays.",
    bg: "linear-gradient(160deg, #FFF7ED 0%, #FDE8E8 55%, #F5E7FF 100%)",
    surface: "#FFFFFF",
    ink: "#1F1A17",
    accent: "#C2410C",
    accentInk: "#FFFFFF",
    display: "'Playfair Display', Georgia, serif",
    motif: "🎉",
    group: "Birthdays and congratulations",
  },
  {
    id: "velvet",
    name: "Velvet",
    blurb: "The house look. Deep red on warm cream.",
    bg: "linear-gradient(170deg, #F5EFE6 0%, #EFE2D2 100%)",
    surface: "#FFFDF9",
    ink: "#1A1410",
    accent: "#5C1D1D",
    accentInk: "#F5EFE6",
    display: "'Playfair Display', Georgia, serif",
    motif: "🕯️",
    group: "House styles",
  },
  {
    id: "midnight",
    name: "Midnight",
    blurb: "Dark, modern, and quietly formal.",
    bg: "linear-gradient(165deg, #0F172A 0%, #17233F 100%)",
    surface: "#1B2740",
    ink: "#F8FAFC",
    accent: "#60A5FA",
    accentInk: "#0F172A",
    display: "'Outfit', system-ui, sans-serif",
    motif: "✨",
    group: "House styles",
  },
  {
    id: "walnut",
    name: "Walnut",
    blurb: "Warm brown, the Group eCards house color.",
    bg: "linear-gradient(165deg, #F6F0E8 0%, #E8DBCB 100%)",
    surface: "#FFFCF7",
    ink: "#241812",
    accent: "#6B4227",
    accentInk: "#F6F0E8",
    display: "'Cormorant Garamond', Georgia, serif",
    motif: "🤎",
    group: "House styles",
  },
  {
    id: "blossom",
    name: "Blossom",
    blurb: "Soft blush. Lovely for thank yous and new babies.",
    bg: "linear-gradient(160deg, #FDF2F4 0%, #FBE7EC 100%)",
    surface: "#FFFFFF",
    ink: "#3A1419",
    accent: "#B8576A",
    accentInk: "#FFFFFF",
    display: "'Cormorant Garamond', Georgia, serif",
    motif: "🌸",
    group: "Care and thanks",
  },
  {
    id: "garden",
    name: "Garden",
    blurb: "Calm greens. Retirements, leavings, thank yous.",
    bg: "linear-gradient(160deg, #F4F1E8 0%, #E7EFE4 100%)",
    surface: "#FFFFFF",
    ink: "#1F2D1F",
    accent: "#3D5B3D",
    accentInk: "#FFFFFF",
    display: "'Cormorant Garamond', Georgia, serif",
    motif: "🌿",
    group: "Farewells and milestones",
  },
  {
    id: "gold",
    name: "Gold leaf",
    blurb: "Understated luxe for milestones and weddings.",
    bg: "linear-gradient(160deg, #1A1410 0%, #2A2018 100%)",
    surface: "#241C15",
    ink: "#F5EFE6",
    accent: "#D4B483",
    accentInk: "#1A1410",
    display: "'Playfair Display', Georgia, serif",
    motif: "🥂",
    group: "Farewells and milestones",
  },
  {
    id: "balloons",
    name: "Balloons",
    blurb: "Playful primary colors for a big birthday.",
    bg: "linear-gradient(155deg, #FFF9E8 0%, #FFE9DE 50%, #E6F1FF 100%)",
    surface: "#FFFFFF",
    ink: "#1C2436",
    accent: "#1D4ED8",
    accentInk: "#FFFFFF",
    display: "'Outfit', system-ui, sans-serif",
    motif: "🎈",
    group: "Birthdays and congratulations",
  },
  {
    id: "fizz",
    name: "Fizz",
    blurb: "Bright congratulations. New jobs, exam results, wins.",
    bg: "linear-gradient(160deg, #FFFDF2 0%, #FFF3C9 55%, #FDE7D2 100%)",
    surface: "#FFFFFF",
    ink: "#2A2010",
    accent: "#B45309",
    accentInk: "#FFFFFF",
    display: "'Outfit', system-ui, sans-serif",
    motif: "🎊",
    group: "Birthdays and congratulations",
  },
  {
    id: "voyage",
    name: "Voyage",
    blurb: "Calm blues for leavers and farewells.",
    bg: "linear-gradient(160deg, #F1F6FB 0%, #DDEAF6 100%)",
    surface: "#FFFFFF",
    ink: "#152436",
    accent: "#1E5F8C",
    accentInk: "#FFFFFF",
    display: "'Cormorant Garamond', Georgia, serif",
    motif: "🕊️",
    group: "Farewells and milestones",
  },
  {
    id: "ivory",
    name: "Ivory",
    blurb: "Wedding formal. Quiet ivory and soft grey.",
    bg: "linear-gradient(160deg, #FBF8F3 0%, #F0EBE3 100%)",
    surface: "#FFFFFF",
    ink: "#20201D",
    accent: "#8A7C63",
    accentInk: "#FFFFFF",
    display: "'Cormorant Garamond', Georgia, serif",
    motif: "💍",
    group: "Farewells and milestones",
  },
  {
    id: "cradle",
    name: "Cradle",
    blurb: "Gentle pastels for a new baby.",
    bg: "linear-gradient(160deg, #F7FBFF 0%, #EAF3FA 45%, #FDF1F4 100%)",
    surface: "#FFFFFF",
    ink: "#22303C",
    accent: "#5B8AA6",
    accentInk: "#FFFFFF",
    display: "'Cormorant Garamond', Georgia, serif",
    motif: "🧸",
    group: "Care and thanks",
  },
  {
    id: "sunroom",
    name: "Sunroom",
    blurb: "Warm and cheering. Get well soon.",
    bg: "linear-gradient(160deg, #FFFCF0 0%, #FFF3DC 55%, #F3F8EC 100%)",
    surface: "#FFFFFF",
    ink: "#2C2617",
    accent: "#A97218",
    accentInk: "#FFFFFF",
    display: "'Outfit', system-ui, sans-serif",
    motif: "🌼",
    group: "Care and thanks",
  },
  {
    id: "gratitude",
    name: "Gratitude",
    blurb: "Simple and sincere. Thank yous of any size.",
    bg: "linear-gradient(160deg, #F7F4EE 0%, #EDE7DB 100%)",
    surface: "#FFFFFF",
    ink: "#242018",
    accent: "#6E5B3E",
    accentInk: "#FFFFFF",
    display: "'Playfair Display', Georgia, serif",
    motif: "💌",
    group: "Care and thanks",
  },
  {
    id: "stillwater",
    name: "Still water",
    blurb: "Understated and respectful. Sympathy and condolences.",
    bg: "linear-gradient(165deg, #F4F5F6 0%, #E7EAEC 100%)",
    surface: "#FFFFFF",
    ink: "#242A2E",
    accent: "#4A5560",
    accentInk: "#FFFFFF",
    display: "'Cormorant Garamond', Georgia, serif",
    motif: "🤍",
    group: "Care and thanks",
  },
  {
    id: "evergreen",
    name: "Evergreen",
    blurb: "Holiday warmth without the glitter.",
    bg: "linear-gradient(165deg, #12261C 0%, #1B3627 100%)",
    surface: "#1B3527",
    ink: "#F3EFE3",
    accent: "#C9A227",
    accentInk: "#12261C",
    display: "'Playfair Display', Georgia, serif",
    motif: "🌲",
    group: "Seasonal",
  },
  {
    id: "firstlight",
    name: "First light",
    blurb: "Fresh spring greens and pale sun.",
    bg: "linear-gradient(160deg, #FBFDF4 0%, #EDF6E2 55%, #FFF8E3 100%)",
    surface: "#FFFFFF",
    ink: "#1F2A1B",
    accent: "#4B7A2F",
    accentInk: "#FFFFFF",
    display: "'Outfit', system-ui, sans-serif",
    motif: "🌷",
    group: "Seasonal",
  },
];

export const ECARD_OCCASIONS = [
  "Birthday",
  "Farewell",
  "Thank you",
  "Congratulations",
  "New baby",
  "Wedding",
  "Retirement",
  "Get well soon",
  "Anniversary",
  "With sympathy",
  "Happy holidays",
  "Just because",
];

export function getEcardTheme(id: string | null | undefined): EcardTheme {
  return ECARD_THEMES.find((t) => t.id === id) ?? ECARD_THEMES[0]!;
}

/** Themes bucketed for the picker, in ECARD_THEME_GROUPS order. */
export function groupedEcardThemes(): Array<{ group: string; themes: EcardTheme[] }> {
  return ECARD_THEME_GROUPS.map((group) => ({
    group,
    themes: ECARD_THEMES.filter((t) => t.group === group),
  })).filter((g) => g.themes.length > 0);
}
