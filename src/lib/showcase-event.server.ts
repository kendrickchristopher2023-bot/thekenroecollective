/**
 * The showcase invitation's content, in one place.
 *
 * Every name, address, phone number and photograph here is invented. The phone
 * numbers use the 555-01xx reserved range, the email addresses use example.com,
 * and the imagery is generated rather than photographed, so no real person
 * appears anywhere in the marketing material.
 *
 * Server-only: the nightly demo reset and the one-off seeding script import it.
 * See src/lib/showcase.ts for the read/write boundary this event lives behind.
 */
import { SHOWCASE_EVENT_ID } from "@/lib/showcase";

/** Public storage folder holding the showcase imagery and audio. */
export const SHOWCASE_MEDIA_PREFIX = `${SHOWCASE_EVENT_ID}/showcase`;

/** Date helper: N days from today at a fixed local wall-clock time. */
function at(daysFromNow: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:${pad(minute)}`;
}

type Row = [name: string, status: "yes" | "no" | "maybe" | "pending", adults?: number, children?: number, dietary?: string, plus?: string];

/**
 * Forty invented guests with a believable spread of answers, plus-ones,
 * children and dietary needs, so the guest list, capacity bar, waitlist and
 * catering totals all have something real to show.
 */
const GUEST_ROWS: Row[] = [
  ["Rosalind Whitfield", "yes", 2, 0, "", "Desmond Whitfield"],
  ["Naomi Adebayo", "yes", 1, 2, "No shellfish"],
  ["Curtis Beaumont", "yes", 2, 0, "", "Yvette Beaumont"],
  ["Imani Carrington", "yes", 1, 0, "Vegetarian"],
  ["Theo Marchetti", "yes", 2, 1, "", "Lucia Marchetti"],
  ["Priya Raman", "maybe", 1],
  ["Hollis Dunbar", "yes", 1],
  ["Marguerite Lacroix", "yes", 2, 0, "Gluten free", "Etienne Lacroix"],
  ["Jerome Whitfield", "yes", 1],
  ["Alethea Bell", "yes", 1, 1],
  ["Kofi Mensah", "pending", 1],
  ["Delphine Roy", "yes", 1, 0, "Vegan"],
  ["Samuel Ortiz", "no", 1],
  ["Cheyenne Boudreaux", "yes", 2, 0, "", "Marcus Boudreaux"],
  ["Winston Achebe", "yes", 1],
  ["Tabitha Greenlee", "maybe", 1, 2],
  ["Elias Marchetti-Bell", "yes", 1],
  ["Amara Whitfield", "yes", 1],
  ["Odette Fournier", "yes", 1, 0, "Nut allergy"],
  ["Rashaad Coleman", "yes", 2, 0, "", "Jonelle Coleman"],
  ["Serafina Okonkwo", "pending", 1],
  ["Brendan Halloway", "yes", 1],
  ["Constance Ives", "yes", 1, 1, "Pescatarian"],
  ["Malik Osei", "yes", 1],
  ["Lorraine Beaufort", "maybe", 2],
  ["Augustin Pereira", "yes", 1],
  ["Nadia Haddad", "yes", 1, 0, "Halal"],
  ["Everett Sinclair", "pending", 1],
  ["Bettina Krause", "yes", 1],
  ["Jamal Rutherford", "yes", 2, 2, "", "Simone Rutherford"],
  ["Clementine Vaughn", "yes", 1],
  ["Idris Kabaka", "no", 1],
  ["Harriet Ndlovu", "yes", 1, 0, "Vegetarian"],
  ["Peter Lindqvist", "maybe", 1],
  ["Camille Duplessis", "yes", 2, 0, "", "Andre Duplessis"],
  ["Solomon Whitfield", "yes", 1, 1],
  ["Frederica Amos", "pending", 1],
  ["Bishop Emmanuel Cray", "yes", 1],
  ["Loretta Sanford", "yes", 1, 0, "Low sodium"],
  ["Xavier Montrose", "yes", 1],
];

function guests() {
  return GUEST_ROWS.map(([name, status, adults, children, dietary, plus], i) => ({
    id: `showcase-g${i + 1}`,
    name,
    // Invented contacts only: example.com never delivers, 555-01xx is reserved.
    email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
    phone: `(555) 555-01${String(i % 100).padStart(2, "0")}`,
    status,
    adults: adults ?? 1,
    children: children ?? 0,
    dietary: dietary ?? "",
    ...(plus ? { plusOnes: [{ name: plus }] } : {}),
    ...(status === "yes" && i % 7 === 0 ? { accessibilityNotes: "Step-free seating, please" } : {}),
  }));
}

/** Seating: five round tables plus the venue elements, so the chart reads as a real room. */
function seatingTables() {
  const ids = GUEST_ROWS.map((_, i) => `showcase-g${i + 1}`);
  const yes = ids.filter((_, i) => GUEST_ROWS[i]![1] === "yes");
  const chunk = (n: number, size: number) => yes.slice(n * size, n * size + size);
  return [
    { id: "t1", label: "Table One", shape: "round", capacity: 8, guestIds: chunk(0, 6), area: "Reception", x: 26, y: 30 },
    { id: "t2", label: "Table Two", shape: "round", capacity: 8, guestIds: chunk(1, 6), area: "Reception", x: 62, y: 30 },
    { id: "t3", label: "Table Three", shape: "round", capacity: 8, guestIds: chunk(2, 6), area: "Reception", x: 26, y: 58 },
    { id: "t4", label: "Table Four", shape: "round", capacity: 8, guestIds: chunk(3, 6), area: "Reception", x: 62, y: 58 },
    { id: "t5", label: "The Long Table", shape: "rect", capacity: 12, guestIds: chunk(4, 6), area: "Reception", x: 44, y: 14 },
    { id: "e1", label: "Dance floor", shape: "rect", capacity: 0, guestIds: [], kind: "element", elementType: "dance_floor", x: 44, y: 80 },
    { id: "e2", label: "Bar", shape: "rect", capacity: 0, guestIds: [], kind: "element", elementType: "bar", x: 84, y: 80 },
  ];
}

/** Run of show. */
function timelineBlocks() {
  return [
    { id: "b1", time: "16:30", durationMin: 30, title: "Guests arrive, olive grove", owner: "Ushers" },
    { id: "b2", time: "17:00", durationMin: 30, title: "Ceremony", owner: "Bishop Emmanuel Cray" },
    { id: "b3", time: "17:30", durationMin: 60, title: "Cocktails and strings", owner: "Atlas String Quartet" },
    { id: "b4", time: "18:30", durationMin: 90, title: "Dinner, served family style", owner: "Copperline Catering" },
    { id: "b5", time: "20:00", durationMin: 20, title: "Toasts", owner: "Rosalind Whitfield" },
    { id: "b6", time: "20:30", durationMin: 150, title: "Dancing", owner: "DJ Solace" },
    { id: "b7", time: "23:00", durationMin: 15, title: "Last dance and sparklers", owner: "Everyone" },
  ];
}

/**
 * The event row, exactly as the nightly reset inserts it.
 * `media` supplies the public URLs of the uploaded showcase assets.
 */
export function showcaseEventRow(
  userId: string,
  media: {
    hero?: string;
    voiceNote?: string;
    voiceNoteDuration?: number;
    song?: string;
  } = {},
) {
  return {
    id: SHOWCASE_EVENT_ID,
    user_id: userId,
    is_demo: true,
    share_token: "showcase-share-wedding",
    language: "en",
    data: {
      id: SHOWCASE_EVENT_ID,
      title: "Amara & Elias",
      date: at(96, 17, 0),
      timezone: "America/New_York",
      venue: "The Olivet at Harrow Green",
      address: "412 Harrow Green Road, Ashbury, NC 27512",
      description:
        "A garden ceremony beneath the olive trees, then dinner at long tables and dancing until the lanterns go out.",
      message:
        "We have waited a long while for this evening, and it would not be the same without you in it. Come early, stay late, and wear shoes you can dance in.",
      welcomeQuote: "Two families, one long table.",
      dressCode: "Garden formal",
      hashtag: "#AmaraAndElias",
      createdAt: new Date().toISOString(),
      senderName: "Amara & Elias",

      // Look and feel
      ...(media.hero ? { image: media.hero } : {}),
      color: "#7C6A46",
      frame: "botanical",
      inviteAnimation: "bouquet",
      entrancePace: "cinematic",

      // Guest experience
      countdownEnabled: true,
      calendarSyncEnabled: true,
      publicCommentsEnabled: true,
      openGuestList: true,
      plusOnesAllowed: 1,
      kidsEnabled: true,
      petsEnabled: false,
      capacity: 140,
      waitlistEnabled: true,
      autoPromote: true,
      rsvpDeadline: at(60, 21, 0),
      bringSheetEnabled: true,
      bringSheetAllowSuggestions: false,
      bringSheetShowNames: true,

      // Detail the page carries but the reading does not
      accommodations:
        "The Harrow Inn holds a block of rooms under Whitfield, and there is a second block at The Ashbury Lodge, ten minutes away.",
      transit: "Parking is free on site. A shuttle runs from The Harrow Inn from 3:45pm and back from 11:15pm.",
      seating: "Open seating for the ceremony. Assigned tables at dinner, and your table is on the seating chart below.",
      playlistUrl: "https://open.spotify.com/playlist/37i9dQZF1DXaKIA8E7WcJj",

      hosts: [
        {
          id: "h1",
          role: "Host",
          name: "Rosalind Whitfield",
          relationship: "Mother of the bride",
          email: "rosalind@example.com",
          phone: "(555) 555-0191",
          showContact: false,
          bio: "Keeper of the guest list and the family recipe box.",
        },
        {
          id: "h2",
          role: "Co-host",
          name: "Theo Marchetti",
          relationship: "Father of the groom",
          email: "theo@example.com",
          phone: "(555) 555-0192",
          showContact: false,
        },
      ],

      ...(media.voiceNote
        ? {
            voiceMessage: media.voiceNote,
            voiceMessageDuration: media.voiceNoteDuration ?? 0,
          }
        : {}),
      ...(media.song
        ? {
            songUrl: media.song,
            songTitle: "The Long Table",
            songArtist: "Written for Amara & Elias",
            songAllowDownload: false,
          }
        : {}),

      guests: guests(),
      seatingTables: seatingTables(),
      timelineBlocks: timelineBlocks(),
      registry: [
        { id: "r1", store: "Honeyfund", url: "https://www.honeyfund.com", label: "Towards the honeymoon" },
      ],
    },
  };
}

/** Invented well wishes, shown so the feature is visible without being writable. */
export const SHOWCASE_WELL_WISHES: { name: string; message: string }[] = [
  { name: "Naomi Adebayo", message: "I have known Amara since she was small enough to sit on the counter while I cooked. What a joy this is." },
  { name: "Curtis Beaumont", message: "Elias, you got the better end of this deal and you know it. Congratulations to you both." },
  { name: "Marguerite Lacroix", message: "Wishing you a long marriage full of ordinary Tuesdays as good as this day will be." },
  { name: "Bishop Emmanuel Cray", message: "It is my honour to stand with you under those trees." },
  { name: "Harriet Ndlovu", message: "Save me one dance. Just one, and then I will sit down." },
];

/** Invented public comments on the invitation. */
export const SHOWCASE_COMMENTS: { guestId: string; guestName: string; body: string }[] = [
  { guestId: "showcase-g2", guestName: "Naomi Adebayo", body: "Is the shuttle running back to the inn after eleven? Happy to drive otherwise." },
  { guestId: "showcase-g7", guestName: "Hollis Dunbar", body: "Flying in Friday morning. Anyone else landing at Ashbury Regional and want to share a car?" },
  { guestId: "showcase-g10", guestName: "Alethea Bell", body: "The children have already picked their outfits. There is no changing them now." },
];

/** Invented bring-list items so the potluck sheet has something to show. */
export const SHOWCASE_BRING_ITEMS: { title: string; note?: string; slots: number; claimedBy?: string[] }[] = [
  { title: "Welcome basket: fruit", note: "For the rooms at The Harrow Inn", slots: 2, claimedBy: ["Imani C."] },
  { title: "Welcome basket: pound cake", slots: 2, claimedBy: ["Loretta S.", "Delphine R."] },
  { title: "Sparklers for the last dance", note: "Two boxes is plenty", slots: 2, claimedBy: ["Malik O."] },
  { title: "Ice, lots of it", slots: 3 },
];
