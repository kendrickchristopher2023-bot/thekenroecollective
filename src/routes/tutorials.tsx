import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { TIERS } from "@/lib/tier-config";
import { ECARD_SEND_PRICE_LABEL } from "@/lib/ecards-pricing";

export const Route = createFileRoute("/tutorials")({
  head: () => ({
    meta: [
      { title: "How it works — The Kenroe Collective" },
      {
        name: "description",
        content:
          "Step-by-step tutorials for creating events, inviting guests, using seating charts, AI design, sending Group eCards, and managing your billing.",
      },
      { property: "og:title", content: "How it works — The Kenroe Collective" },
      {
        property: "og:description",
        content:
          "Simple, visual guides for every part of hosting and for sending Group eCards with The Kenroe Collective.",
      },
    ],
  }),
  component: TutorialsPage,
});

type TierBadge = "Everyone" | "Whisper & above" | "Host & above" | "Atelier only";

type Tutorial = {
  title: string;
  tier: TierBadge;
  steps: string[];
};

type Section = {
  title: string;
  subtitle: string;
  tutorials: Tutorial[];
};

const P = TIERS.postcard;
const W = TIERS.whisper;
const H = TIERS.host;
const A = TIERS.atelier;

const SECTIONS: Section[] = [
  {
    title: "Getting started",
    subtitle: "The basics — for everyone.",
    tutorials: [
      {
        title: "Create your account",
        tier: "Everyone",
        steps: [
          "Click Sign up in the top-right corner.",
          "Enter your email and pick a password. You're in — no credit card needed to start.",
        ],
      },
      {
        title: "Create your first event",
        tier: "Everyone",
        steps: [
          "From the dashboard, click Create New Event.",
          "Add a name, date, time, and location.",
          "Pick a theme or leave the default. Save the draft.",
          "When you're ready, click Publish — your invite link is live.",
        ],
      },
      {
        title: "Share your invite link",
        tier: "Everyone",
        steps: [
          "Open your event page.",
          "Click Share and copy the link.",
          "Paste it into a text, email, or social post. That's it — guests don't need an account.",
        ],
      },
      {
        title: "Track RSVPs",
        tier: "Everyone",
        steps: [
          "Open your event and click the Guests tab.",
          "You'll see who's coming, who declined, and who hasn't responded yet.",
          "Counts update in real time as guests reply.",
        ],
      },
    ],
  },
  {
    title: "Managing guests",
    subtitle: `Available on ${W.name} and above.`,
    tutorials: [
      {
        title: "Add guests manually",
        tier: "Whisper & above",
        steps: [
          "Open your event and click the Guests tab.",
          "Click Add guest.",
          "Type their name and email (phone is optional for SMS reminders).",
          "Save. They'll receive their invitation right away.",
        ],
      },
      {
        title: "Import guests from a spreadsheet",
        tier: "Whisper & above",
        steps: [
          "In your Guests tab, click Import.",
          "Download the template (or paste your own list with name and email columns).",
          "Upload the file. Review the preview.",
          "Click Confirm — everyone gets added at once.",
        ],
      },
      {
        title: "Send email invitations",
        tier: "Whisper & above",
        steps: [
          "Open your event and click Invite.",
          "Pick who to send to (everyone, or a selection).",
          "Customize the message or leave the default.",
          "Click Send. Guests can RSVP with one click.",
        ],
      },
      {
        title: "Send SMS reminders",
        tier: "Whisper & above",
        steps: [
          "Open your event and click Reminders.",
          "Choose SMS and pick the guests to nudge (must have phone numbers).",
          "Write a short message (or use a template).",
          "Send now or schedule for later. Guests can reply STOP to opt out.",
        ],
      },
    ],
  },
  {
    title: "Design & customize",
    subtitle: `Available on ${H.name} and above.`,
    tutorials: [
      {
        title: "Turn on the Photo Wall",
        tier: "Host & above",
        steps: [
          "Open your event and click Photo Wall.",
          "Toggle it on. A QR code appears — print it or show it on screen.",
          "Guests scan and upload photos from their phones — no app needed.",
          "Photos appear in a live slideshow you can put on the big screen.",
        ],
      },
      {
        title: "Customize your event branding",
        tier: "Host & above",
        steps: [
          "Open your event and click Design.",
          "Upload your logo or pick a theme.",
          "Set colors and fonts.",
          "Save — your invitation, RSVP page, and thank-you cards all match.",
        ],
      },
      {
        title: "Send announcements",
        tier: "Whisper & above",
        steps: [
          "Open your event and click Announcements.",
          "Write your update (venue change, timing, weather note, etc.).",
          "Pick delivery: email, SMS, or in-app — email and SMS require Whisper or above; in-app is free on every plan.",
          "Send now or schedule.",
        ],
      },
    ],
  },
  {
    title: "Day-of toolkit",
    subtitle: `Available on ${A.name}.`,
    tutorials: [
      {
        title: "Build a seating chart",
        tier: "Atelier only",
        steps: [
          "Open your event and click Seating.",
          "Add tables and set how many seats each holds.",
          "Drag guests from the sidebar onto seats.",
          "Use Split to separate parties, Lock to keep tables fixed, and Shuffle to randomize the rest.",
          "Export to PDF when you're happy.",
        ],
      },
      {
        title: "Use check-in on event day",
        tier: "Atelier only",
        steps: [
          "Open your event on your phone and click Check-in.",
          "Point your camera at each guest's QR code (from their invitation).",
          "Tap to confirm — arrivals show live for your team.",
        ],
      },
    ],
  },
  {
    title: "AI features",
    subtitle: `Available on ${A.name}.`,
    tutorials: [
      {
        title: "Use the AI Design Studio",
        tier: "Atelier only",
        steps: [
          "Open Atelier Studio from the main menu.",
          "Describe the invitation or thank-you card you want (e.g. \"garden wedding, sage green, watercolor\").",
          "Pick a style. The AI generates several options.",
          "Refine, save to your event, and export as PDF or image.",
        ],
      },
      {
        title: "Use AI Polish on announcements",
        tier: "Everyone",
        steps: [
          "Start writing an announcement.",
          "Click AI Polish.",
          "The AI rewrites it — accept, tweak, or try again.",
        ],
      },
      {
        title: "Use Recommendations",
        tier: "Everyone",
        steps: [
          "Open your event dashboard.",
          "Look for the Recommendations panel.",
          "It suggests next steps: reminders to send, thank-you cards to send, and more, based on your event's dates and RSVPs.",
          "Click any suggestion to act on it.",
        ],
      },
    ],
  },
  {
    title: "Vendor Hub",
    subtitle: `Available on ${H.name} and above.`,
    tutorials: [
      {
        title: "Create a Request for Quotation (RFQ)",
        tier: "Host & above",
        steps: [
          "Open Vendor Hub and click New RFQ.",
          "Describe what you need (catering, florals, DJ, etc.), your date, and your budget range.",
          "Pick vendors to invite, or let us broadcast to matching pros.",
          "Send. Bids come back in your inbox.",
        ],
      },
      {
        title: "Review vendor bids",
        tier: "Host & above",
        steps: [
          "Open Vendor Hub and click your RFQ.",
          "See each bid side by side — price, timeline, portfolio, reviews.",
          "Message a vendor to ask questions.",
          "Accept the one you like — the others are automatically notified.",
        ],
      },
      {
        title: "How vendors get verified",
        tier: "Host & above",
        steps: [
          "Vendors submit business info, portfolio, and reviews.",
          "Our team reviews their profile and confirms they're real.",
          "Verified vendors get a badge you'll see on their profile and bids.",
        ],
      },
    ],
  },
  {
    title: "Group eCards",
    subtitle: "One card, one link, everyone signs it.",
    tutorials: [
      {
        title: "Create a card and pick a theme",
        tier: "Everyone",
        steps: [
          "Open Group eCards and click Create a card.",
          "Choose the occasion, name the recipient, and pick one of the 17 themes.",
          "Set the reveal date, the day the card is delivered to the recipient.",
          `Creating and collecting is free. You pay ${ECARD_SEND_PRICE_LABEL} per card only when you send it, and it is not a subscription.`,
        ],
      },
      {
        title: "Share one link so everyone signs it",
        tier: "Everyone",
        steps: [
          "Copy the contributor link from your card and send it to as many people as you like.",
          "Contributors do not need an account or an app.",
          "Each person adds a message, plus an optional GIF, photo, short video, or voice note. An AI helper can draft the wording for them.",
          "Messages stay hidden from the recipient until the reveal date. You can moderate or remove any message.",
        ],
      },
      {
        title: "It is delivered on the reveal date",
        tier: "Everyone",
        steps: [
          "On your reveal date the card is emailed to the recipient.",
          "Opening it plays the messages back as a cinematic montage, with optional music.",
          "The recipient keeps a permanent keepsake page they can revisit and share.",
          "Need the same setup again? Duplicate the card. Changed your mind? Edit or delete it from your eCards list.",
        ],
      },
    ],
  },
  {
    title: "Billing & account",

    subtitle: "Managing your plan.",
    tutorials: [
      {
        title: "Upgrade your plan",
        tier: "Everyone",
        steps: [
          "Go to Profile → Billing (or click any Upgrade button).",
          "Pick your new tier and billing cycle (monthly, yearly, or one-time).",
          "Confirm payment. Upgrades unlock immediately — you pay only the prorated difference.",
        ],
      },
      {
        title: "Cancel your subscription",
        tier: "Everyone",
        steps: [
          "Go to Profile → Billing.",
          "Scroll down and click Cancel subscription.",
          "Confirm. You keep access until the end of the period you paid for. Nothing gets deleted.",
        ],
      },
      {
        title: "Request a refund",
        tier: "Everyone",
        steps: [
          "Refunds are available within 24 hours of purchase if the plan hasn't been used.",
          "Go to the Contact page and ask for a refund with your order details.",
          "See the full policy at the Refund Policy page.",
        ],
      },
      {
        title: "Manage your payment method",
        tier: "Everyone",
        steps: [
          "Go to Profile → Billing.",
          "Click Manage payment method — opens your secure billing portal.",
          "Add a new card or update your existing one. Changes save automatically.",
        ],
      },
    ],
  },
];

function TierBadgePill({ tier }: { tier: TierBadge }) {
  const color =
    tier === "Everyone"
      ? "bg-secondary text-ink/70"
      : tier === "Whisper & above"
        ? "bg-velvet/10 text-velvet"
        : tier === "Host & above"
          ? "bg-ink/10 text-ink"
          : "bg-gold/20 text-ink";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] ${color}`}
    >
      {tier}
    </span>
  );
}

function TutorialsPage() {
  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      <SiteNav />

      <section className="relative overflow-hidden border-b border-ink/5">
        <div className="relative mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet/80">
            How it works
          </span>
          <h1 className="mt-3 font-serif text-5xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
            Step-by-step <span className="italic text-velvet">tutorials</span>
          </h1>
          <p className="mt-5 max-w-[60ch] text-pretty text-lg text-muted-foreground">
            Simple, plain-language guides for every part of hosting — from creating your first event to using AI design tools.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/events/new"
              className="inline-flex items-center rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
            >
              Start an event
            </Link>
            <Link
              to="/faq"
              className="inline-flex items-center rounded-full bg-transparent px-5 py-2.5 text-sm font-medium ring-1 ring-ink/10 transition-colors hover:bg-secondary"
            >
              Read the FAQ
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="space-y-16">
          {SECTIONS.map((section) => (
            <div key={section.title} className="grid gap-8 md:grid-cols-[1fr_2fr]">
              <div>
                <h2 className="font-serif text-2xl font-medium">{section.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{section.subtitle}</p>
              </div>
              <div className="space-y-4">
                {section.tutorials.map((tut) => (
                  <div
                    key={tut.title}
                    className="rounded-2xl bg-secondary/50 p-6 ring-1 ring-ink/5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-serif text-lg">{tut.title}</h3>
                      <TierBadgePill tier={tut.tier} />
                    </div>
                    <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink/80">
                      {tut.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-24 rounded-3xl bg-ink p-10 text-white sm:p-14">
          <div className="grid gap-6 md:grid-cols-[2fr_1fr] md:items-center">
            <div>
              <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-gold">
                Still need help?
              </span>
              <h3 className="mt-3 font-serif text-3xl sm:text-4xl">
                Ask us anything.
              </h3>
              <p className="mt-3 max-w-[50ch] text-zinc-400">
                Check the FAQ for common questions, or send a note — a real human replies.
              </p>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <Link
                to="/faq"
                className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-medium text-ink hover:bg-paper"
              >
                Read the FAQ
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center rounded-full bg-white/10 px-5 py-2.5 text-sm font-medium text-white ring-1 ring-white/20 hover:bg-white/20"
              >
                Contact support
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
