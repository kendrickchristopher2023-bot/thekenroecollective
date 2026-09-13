// The Kenroe Collective logo pack.
//
// One list, used by both the owner-only /brand page and the ticketed zip at
// /api/public/brand-pack, so a file can never appear on the page without also
// being in the download.
//
// Where the bytes live: the whole pack is in the private `brand-kit` storage
// bucket, with master copies kept in brand-kit/private/ in this repository
// (not served). Only the two files in PUBLIC_BRAND_FILES also stay in
// public/brand, because the public site itself uses them.

/** Logo files the public site itself depends on. These stay in public/brand. */
export const PUBLIC_BRAND_FILES = [
  // /card/<name> pages and generated email signatures.
  "kenroe-logo-horizontal-2400px-transparent.png",
  // Link-preview picture on the /card/<name> pages (absolute https URL).
  "kenroe-logo-open-graph-1200x630.png",
] as const;

export type BrandAsset = {
  file: string;
  label: string;
  what: string;
  dimensions: string;
  ground: "light" | "dark" | "transparent" | "vector";
};

export const BRAND_ASSETS: BrandAsset[] = [
  {
    file: "kenroe-logo-vector-master.svg",
    label: "Vector master (full colour)",
    what: "Scales to any size with no loss. Send this to printers and sign makers.",
    dimensions: "Vector, any size",
    ground: "vector",
  },
  {
    file: "kenroe-logo-vector-white.svg",
    label: "Vector master (white)",
    what: "The same artwork in cream white, for dark backgrounds.",
    dimensions: "Vector, any size",
    ground: "dark",
  },
  {
    file: "kenroe-logo-vector-one-colour-black.svg",
    label: "Vector master (single colour)",
    what: "Solid black for one-colour printing, embroidery, stamps and engraving.",
    dimensions: "Vector, any size",
    ground: "vector",
  },
  {
    file: "kenroe-logo-portrait-3x4-1500x2000.png",
    label: "Portrait 3:4",
    what: "Stacked lockup on the cream ground, for posters and portrait frames.",
    dimensions: "1500 x 2000",
    ground: "light",
  },
  {
    file: "kenroe-logo-portrait-3x4-1500x2000-transparent.png",
    label: "Portrait 3:4 (transparent)",
    what: "The same portrait with no background, to sit over your own colour or photo.",
    dimensions: "1500 x 2000",
    ground: "transparent",
  },
  {
    file: "kenroe-logo-social-profile-1000x1000.png",
    label: "Social profile picture",
    what: "Square, with the mark held inside a safe circle so nothing is cut off when a platform rounds the corners.",
    dimensions: "1000 x 1000",
    ground: "light",
  },
  {
    file: "kenroe-logo-social-profile-1000x1000-dark.png",
    label: "Social profile picture (dark)",
    what: "The same square on the near-black ground, for dark profile themes.",
    dimensions: "1000 x 1000",
    ground: "dark",
  },
  {
    file: "kenroe-logo-print-2400px-300dpi-transparent.png",
    label: "Business card (transparent)",
    what: "8 inches wide at 300 dots per inch, with no background. Fine for a card at any width up to 8 inches.",
    dimensions: "2400 x 560",
    ground: "transparent",
  },
  {
    file: "kenroe-logo-print-2400px-300dpi-light.png",
    label: "Business card (light ground)",
    what: "The same print size on the cream ground, for cards printed on white or cream stock.",
    dimensions: "2400 x 560",
    ground: "light",
  },
  {
    file: "kenroe-logo-open-graph-1200x630.png",
    label: "Link preview picture",
    what: "The picture that shows when a link is shared in a text or on social media.",
    dimensions: "1200 x 630",
    ground: "light",
  },
  {
    file: "kenroe-logo-horizontal-2400px-transparent.png",
    label: "Horizontal (transparent)",
    what: "The everyday wide lockup with no background.",
    dimensions: "2400 x 560",
    ground: "transparent",
  },
  {
    file: "kenroe-logo-white-inverse-2400px-transparent.png",
    label: "White / inverse",
    what: "Cream white artwork with no background, for use on dark colours and photographs.",
    dimensions: "2400 x 560",
    ground: "transparent",
  },
  {
    file: "kenroe-logo-white-on-dark-2400px.png",
    label: "White on dark",
    what: "The white version already sitting on the near-black brand ground.",
    dimensions: "2400 x 560",
    ground: "dark",
  },
  {
    file: "kenroe-logo-one-colour-black-2400px-transparent.png",
    label: "Single colour (black)",
    what: "Solid black with no background, for one-colour printing, embroidery and engraving.",
    dimensions: "2400 x 560",
    ground: "transparent",
  },
  {
    file: "kenroe-card-qr.svg",
    label: "Business card QR code (vector)",
    what: "The scan code for the printed card. It opens thekenroecollective.com/card, which sends people to the homepage, and where it goes can be changed later without reprinting.",
    dimensions: "Vector, any size",
    ground: "vector",
  },
  {
    file: "kenroe-card-qr-900px-300dpi.png",
    label: "Business card QR code (300 DPI)",
    what: "The same code as a picture file, 3 inches square at 300 dots per inch, so it can be placed at any size down to 0.8 inch.",
    dimensions: "900 x 900",
    ground: "light",
  },
  {
    file: "kenroe-card-qr-christopher.svg",
    label: "Christopher Kendrick, scan code (vector)",
    what: "Opens Christopher's digital card, where a person can save his details to their phone in one tap.",
    dimensions: "Vector, any size",
    ground: "vector",
  },
  {
    file: "kenroe-card-qr-christopher-900px-300dpi.png",
    label: "Christopher Kendrick, scan code (300 DPI)",
    what: "The same personal code as a picture file, 3 inches square at 300 dots per inch.",
    dimensions: "900 x 900",
    ground: "light",
  },
  {
    file: "kenroe-card-qr-adrian.svg",
    label: "Adrian Monroe, scan code (vector)",
    what: "Opens Adrian's digital card, where a person can save his details to their phone in one tap.",
    dimensions: "Vector, any size",
    ground: "vector",
  },
  {
    file: "kenroe-card-qr-adrian-900px-300dpi.png",
    label: "Adrian Monroe, scan code (300 DPI)",
    what: "The same personal code as a picture file, 3 inches square at 300 dots per inch.",
    dimensions: "900 x 900",
    ground: "light",
  },
];

export const BRAND_COLOURS = [
  { name: "Oxblood ink", hex: "#4E211E", use: "The logo, headings and primary marks" },
  { name: "Cream ground", hex: "#FAF8F3", use: "Backgrounds and paper stock" },
  { name: "Near black", hex: "#1A1A1A", use: "Dark backgrounds and body ink" },
];

/** Contact details that belong on the card itself, beside the logo and code. */
export const BRAND_CONTACT = {
  website: "thekenroecollective.com",
  email: "concierge@thekenroecollective.com",
  phone: "1-980-236-0667",
  people: [
    { name: "Christopher Kendrick", role: "Founder" },
    { name: "Adrian Monroe", role: "Founder" },
  ],
};

/**
 * Written down once so a printer or designer never has to ask. Kept as plain
 * sentences because this text is also what goes in the downloaded zip.
 */
export const BRAND_RULES = {
  cardContent: [
    `A finished business card carries the logo, the QR code, the names ${BRAND_CONTACT.people.map((p) => p.name).join(" and ")}, each with the title ${BRAND_CONTACT.people[0].role}, and the contact lines ${BRAND_CONTACT.website}, ${BRAND_CONTACT.email} and ${BRAND_CONTACT.phone}.`,
    "Keep the contact lines and names in one place, either under the logo or in a single column opposite the QR code, so the card never feels crowded.",
    "The printed website address stays short (thekenroecollective.com). The QR code handles the /card address by itself.",
    "There is also a personal code per person. Christopher's opens thekenroecollective.com/card/christopher and Adrian's opens /card/adrian, which are the digital cards where somebody can save the contact details straight to their phone. Use the shared code on a card that either founder may hand out, and the personal code on a card belonging to one of them.",
  ].join(" "),
  clearSpace:
    "Leave clear space around the logo equal to the height of the K on every side, and keep other logos, text, edges and folds out of it.",
  minimumSizeScreen:
    "On screen, never place the wide logo narrower than 160 pixels, and never place the square or portrait lockup smaller than 96 pixels.",
  minimumSizePrint:
    "In print, never place the wide logo narrower than 1 inch (25 mm), and always supply the vector file rather than a picture file.",
  colour:
    "Use the oxblood ink on light grounds and the cream white version on dark grounds. Use the single colour version whenever only one ink is available.",
  qrCode: [
    "The printed code must open https://thekenroecollective.com/card and nothing else. Never use a third party QR shortener: those links expire or start charging, and every printed card becomes dead paper.",
    "Print it no smaller than 0.8 inch (20 mm) square. Smaller is unreliable, especially on older phones.",
    "Leave a clear quiet zone all the way around, at least four modules wide (about the width of four of the smallest squares in the code). Nothing may sit inside it.",
    "Dark code on a light background only. Inverted light-on-dark artwork fails on a lot of scanners.",
    "The supplied code is error correction level H, so a small logo may sit in the centre covering no more than the middle fifth. If the code is ever regenerated at a lower level, no logo in the centre.",
  ].join(" "),
  dontDo:
    "Do not stretch, rotate, recolour, add a shadow to, or place the logo on a busy part of a photograph.",
};

export function brandGuidelinesText(): string {
  const lines = [
    "THE KENROE COLLECTIVE, LOGO USE",
    "",
    "CLEAR SPACE",
    BRAND_RULES.clearSpace,
    "",
    "MINIMUM SIZE, SCREEN",
    BRAND_RULES.minimumSizeScreen,
    "",
    "MINIMUM SIZE, PRINT",
    BRAND_RULES.minimumSizePrint,
    "",
    "COLOUR",
    BRAND_RULES.colour,
    BRAND_COLOURS.map((c) => `  ${c.name}  ${c.hex}  ${c.use}`).join("\n"),
    "",
    "WHAT GOES ON THE BUSINESS CARD",
    BRAND_RULES.cardContent,
    "",
    "THE QR CODE ON THE BUSINESS CARD",
    BRAND_RULES.qrCode,
    "",
    "PLEASE DO NOT",
    BRAND_RULES.dontDo,
    "",
    "WHAT IS IN THIS FOLDER",
    ...BRAND_ASSETS.map((a) => `  ${a.file}  (${a.dimensions})  ${a.what}`),
    "",
    "A NOTE ON PRINTING",
    "The three .svg files are true vector artwork traced from the original logo picture,",
    "so they can be enlarged to any size. Any printer can convert an .svg to EPS or PDF.",
    "If a printer insists on a picture file, use the 2400 pixel wide business card file,",
    "which is 8 inches at 300 dots per inch.",
    "",
  ];
  return lines.join("\n");
}

/**
 * Short listening samples for owners, kept in the private brand-kit bucket
 * under voice/. They are review material, not part of the logo pack, so they
 * stay out of BRAND_ASSETS and out of the zip. Missing files simply hide.
 */
export type BrandVoicePreview = { file: string; label: string; what: string };
export const BRAND_VOICE_PREVIEWS: BrandVoicePreview[] = [
  {
    file: "voice/tenia-reading.mp3",
    label: "Tenia's invitation, read aloud",
    what: "The full invitation reading for Tenia's event, in the new voice, exactly as guests hear it.",
  },
  {
    file: "voice/celebrations-line-one.mp3",
    label: "Celebrations film, first line",
    what: "The opening line of the Celebrations film narration, at the warm, conversational film pace.",
  },
];

/**
 * The three product films, rough cuts, in both shapes. They live in the same
 * private brand-kit bucket under films/, with a contact sheet beside each cut
 * (a still every two seconds, plus a written list of every name shown). Rough
 * cuts for owner review only: nothing here goes on the homepage until
 * Christopher approves the finals. A missing file simply hides.
 */
export type BrandFilm = {
  /** Video object path in the private bucket. */
  file: string;
  /** Contact sheet picture path beside it. */
  sheet: string;
  film: "Celebrations" | "The Workroom" | "Application Kit";
  shape: "Wide (16:9)" | "Upright (9:16)";
  /** Human length, for the card. */
  length: string;
  what: string;
};

export const BRAND_FILMS: BrandFilm[] = [
  {
    file: "films/celebrations-horizontal.mp4",
    sheet: "films/contact-sheets/celebrations-horizontal.jpg",
    film: "Celebrations",
    shape: "Wide (16:9)",
    length: "1:00",
    what: "Invitations, the sample wedding, the photo wall, print at home and the group card.",
  },
  {
    file: "films/celebrations-vertical.mp4",
    sheet: "films/contact-sheets/celebrations-vertical.jpg",
    film: "Celebrations",
    shape: "Upright (9:16)",
    length: "1:00",
    what: "The same film cut upright for phones, captions burned in.",
  },
  {
    file: "films/workroom-horizontal.mp4",
    sheet: "films/contact-sheets/workroom-horizontal.jpg",
    film: "The Workroom",
    shape: "Wide (16:9)",
    length: "0:45",
    what: "Boards, tasks, the team drawer and event links, from the two sample boards.",
  },
  {
    file: "films/workroom-vertical.mp4",
    sheet: "films/contact-sheets/workroom-vertical.jpg",
    film: "The Workroom",
    shape: "Upright (9:16)",
    length: "0:45",
    what: "The same film cut upright for phones, captions burned in.",
  },
  {
    file: "films/application-kit-horizontal.mp4",
    sheet: "films/contact-sheets/application-kit-horizontal.jpg",
    film: "Application Kit",
    shape: "Wide (16:9)",
    length: "0:50",
    what: "Finding a listing, tailoring an application and following it through, invite only.",
  },
  {
    file: "films/application-kit-vertical.mp4",
    sheet: "films/contact-sheets/application-kit-vertical.jpg",
    film: "Application Kit",
    shape: "Upright (9:16)",
    length: "0:50",
    what: "The same film cut upright for phones, captions burned in.",
  },
];
