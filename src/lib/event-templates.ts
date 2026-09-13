// Prebuilt event starter templates. Available to every tier — they only
// pre-fill the draft form; gating happens at publish time as usual.
import type { LangCode } from "@/lib/i18n";

export type EventTemplate = {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  draft: {
    title: string;
    description: string;
    message: string;
    language: LangCode;
  };
};

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: "birthday",
    name: "Birthday",
    emoji: "🎂",
    blurb: "Warm, celebratory invite with a personal note.",
    draft: {
      title: "[Name]'s Birthday Celebration",
      description: "An evening of cocktails, cake, and good company.",
      message:
        "It's a milestone worth marking. Join me for an evening of food, drinks, and a few surprises — your presence is the only gift required.",
      language: "en",
    },
  },
  {
    id: "wedding",
    name: "Wedding",
    emoji: "💍",
    blurb: "Elegant, classic save-the-date copy.",
    draft: {
      title: "[Names] — A Wedding Celebration",
      description: "A ceremony and reception in honor of our marriage.",
      message:
        "Together with our families, we invite you to share in the joy of our wedding day. Your presence would mean the world to us.",
      language: "en",
    },
  },
  {
    id: "baby-shower",
    name: "Baby Shower",
    emoji: "🍼",
    blurb: "Soft, joyful copy for a shower or sip-and-see.",
    draft: {
      title: "A Baby Shower for [Name]",
      description: "Brunch, gifts, and a few sweet games to welcome baby.",
      message:
        "A little one is on the way! Join us for an afternoon of brunch, laughs, and love as we shower [Name] with all the joy this new chapter deserves.",
      language: "en",
    },
  },
  {
    id: "corporate",
    name: "Corporate",
    emoji: "🏢",
    blurb: "Polished tone for launches, mixers, or off-sites.",
    draft: {
      title: "[Company] — [Event Name]",
      description: "An evening of networking, conversation, and refreshments.",
      message:
        "We're pleased to invite you to an evening with [Company]. Expect great conversation, refreshments, and a few words on what's ahead. We hope you can join us.",
      language: "en",
    },
  },
  {
    id: "graduation",
    name: "Graduation",
    emoji: "🎓",
    blurb: "Proud, celebratory tone for grad parties.",
    draft: {
      title: "[Name]'s Graduation Celebration",
      description: "Food, drinks, and toasts to mark the milestone.",
      message:
        "After years of hard work, [Name] is officially a graduate! Join us for an afternoon of food, drinks, and toasts to what's next.",
      language: "en",
    },
  },
  {
    id: "holiday",
    name: "Holiday",
    emoji: "✨",
    blurb: "Festive, seasonal welcome — works for any holiday.",
    draft: {
      title: "[Year] Holiday Gathering",
      description: "An evening of warm food, drinks, and good company.",
      message:
        "The season is short and bright — and best spent in good company. Join us for an evening of food, drinks, and the kind of conversation only this time of year invites.",
      language: "en",
    },
  },
];
