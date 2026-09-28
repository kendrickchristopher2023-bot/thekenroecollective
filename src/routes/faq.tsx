import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { TIERS } from "@/lib/tier-config";
import { ECARD_SEND_PRICE_LABEL } from "@/lib/ecards-pricing";


export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ & Help Center — The Kenroe Collective" },
      {
        name: "description",
        content:
          "Simple, clear answers about The Kenroe Collective, covering plans, features, Group eCards, billing, privacy, and how to host beautifully.",
      },
      { property: "og:title", content: "FAQ & Help Center — The Kenroe Collective" },
      {
        property: "og:description",
        content:
          "Simple, clear answers about The Kenroe Collective, covering plans, features, Group eCards, billing, privacy, and how to host beautifully.",
      },
    ],
  }),
  component: FAQPage,
});

type QA = { q: string; a: React.ReactNode };
type Section = { title: string; subtitle: string; items: QA[] };

const P = TIERS.postcard;
const W = TIERS.whisper;
const H = TIERS.host;
const A = TIERS.atelier;

const SECTIONS: Section[] = [
  {
    title: "Getting started",
    subtitle: "The basics — no jargon.",
    items: [
      {
        q: "What is The Kenroe Collective?",
        a: "A premium event hosting platform for weddings, family reunions, birthdays, showers, corporate events, and celebrations of life.",
      },
      {
        q: "How do I create an event?",
        a: (
          <ol className="list-decimal space-y-1 pl-5">
            <li>Sign up for a free account.</li>
            <li>
              <Link to="/events/new" className="text-velvet underline">
                Create your event
              </Link>{" "}
              — add a name, date, and details.
            </li>
            <li>Share your invite link with guests.</li>
          </ol>
        ),
      },
      {
        q: "Do I need an account to RSVP?",
        a: "No. Guests click the invite link and respond — no account needed.",
      },
    ],
  },
  {
    title: "Plans & pricing",
    subtitle: "Pick the right plan in under a minute.",
    items: [
      {
        q: "Which plan is right for me?",
        a: (
          <ul className="space-y-2">
            <li>
              <strong>Trying it out?</strong> Start with {P.name} (free).
            </li>
            <li>
              <strong>Hosting one event?</strong> {W.name} (${W.oneTimePrice} one-time or ${W.monthlyPrice}/mo).
            </li>
            <li>
              <strong>Need vendor coordination and more capacity?</strong> {H.name} (${H.oneTimePrice} or ${H.monthlyPrice}/mo).
            </li>
            <li>
              <strong>Want seating charts, check-in, and AI design tools?</strong> {A.name} (${A.oneTimePrice} or ${A.monthlyPrice}/mo).
            </li>
          </ul>
        ),
      },
      {
        q: "What's the difference between one-time and subscription?",
        a: (
          <>
            <p>
              <strong>One-time:</strong> pay once for a single event. Access lasts for 90 days after your event date (up to 12 months from purchase).
            </p>
            <p className="mt-2">
              <strong>Subscription:</strong> monthly or yearly — use it for unlimited events.
            </p>
          </>
        ),
      },
      {
        q: "Can I upgrade or downgrade?",
        a: (
          <>
            <p>
              <strong>Upgrade anytime.</strong> You pay only the difference for the rest of your billing period, and new features unlock right away.
            </p>
            <p className="mt-2">
              <strong>Downgrade anytime.</strong> Your current plan runs until the end of the period you paid for. Then you drop to the lower tier — nothing gets deleted, but locked features stop working until you upgrade again.
            </p>
          </>
        ),
      },
      {
        q: "What's your refund policy?",
        a: (
          <>
            We offer a 24-hour refund window if the plan or add-on hasn't been used yet. See our full{" "}
            <Link to="/refund-policy" className="text-velvet underline">
              refund policy
            </Link>
            .
          </>
        ),
      },
      {
        q: "What counts as 'used'?",
        a: (
          <ul className="list-disc space-y-1 pl-5">
            <li>Sending an invitation email or SMS to a guest.</li>
            <li>Running an AI generation (design, invite art, thank-you card, etc.).</li>
            <li>Publishing a Photo Wall or turning on Check-in for a live event.</li>
            <li>Exporting a PDF, seating chart, or guest list.</li>
            <li>Sending a vendor RFQ (request for quote).</li>
          </ul>
        ),
      },
    ],
  },
  {
    title: "Features",
    subtitle: "What each tool actually does.",
    items: [
      {
        q: "What is Atelier Studio?",
        a: "Our AI-powered design tool. It creates custom invitations, thank-you cards, and event branding. Think of it as having a designer on call.",
      },
      {
        q: "What is the Photo Wall?",
        a: "A shared photo album for your event. Guests upload photos during and after — like a digital photo booth.",
      },
      {
        q: "What is the Vendor Hub?",
        a: "A marketplace to find and request quotes from verified event vendors (caterers, florists, DJs, etc.).",
      },
      {
        q: "How do seating charts work?",
        a: "Drag and drop guests onto tables. Split parties, set rules (keep people together or apart), shuffle randomly, and export to PDF.",
      },
      {
        q: "What are Projects?",
        a: (
          <>
            Projects — <Link to="/workroom" className="text-velvet underline">The Workroom</Link> — is its own
            product, not an event extra: Kanban boards, tasks, comments, attachments and collaborator
            roles. It works with no event plan at all, and links to a gathering when you want it to. $5/mo
            (or $48/yr) on any plan, including Atelier. See the{" "}
            <Link to="/pricing" search={{ category: "projects" } as never} className="text-velvet underline">
              Projects tab on our pricing page
            </Link>
            .
          </>
        ),
      },
      {
        q: "What is Check-in?",
        a: `A day-of tool: scan guests in as they arrive, add walk-ins who never RSVP'd, and see real-time attendance. Check-in is part of the ${A.name} day-of toolkit, alongside seating charts and run of show.`,
      },
      {
        q: "How do SMS reminders work?",
        a: `Text reminders sent to guests with phone numbers. Guests can opt out anytime by replying STOP. SMS is included free on ${H.name} (${H.limits.smsRemindersPerEvent} per event) and ${A.name} (unlimited). On ${P.name} and ${W.name} you can unlock sending with the $6 one-time SMS add-on instead of upgrading.`,
      },
      {
        q: "Can someone help me manage my event?",
        a: `Yes. Invite a co-host who can edit the event with you, or a viewer who can see the guest list without changing anything. Seats come from your plan: ${W.name} 1, ${H.name} 2, ${A.name} 5. Invitations expire after 14 days, and you can move a seat to someone else at any time. ${P.name} is solo hosting only.`,
      },
      {
        q: "Can guests sign up to bring food (a potluck)?",
        a: "Yes, and it's free on every plan including Postcard. Post the dishes or supplies you need, share the sign-up link, and guests claim a slot from their phone. Two guests can never grab the same slot, and you can export the sheet to PDF, Excel, Word, or CSV.",
      },
      {
        q: "Can I upload my guest list from a spreadsheet?",
        a: `Yes. Bulk guest import reads a CSV or Excel file, matches your columns, and adds everyone at once. It's included on ${H.name} and ${A.name}, and available as a one-time $5 add-on on ${P.name} and ${W.name}.`,
      },
      {

        q: "Can I collect T-shirt sizes and charge for shirts?",
        a: `Yes, on ${H.name} and ${A.name}. Turn on shirt sizes for an event and every guest and named plus-one picks a size when they RSVP. You can also set a price per shirt and allow spare shirts, and the cost is added to what each guest owes.`,
      },
      {
        q: "Can I track who has paid?",
        a: `Yes, on ${H.name} and ${A.name}. Payment tracking shows what each guest owes, what they've paid, and what is outstanding, with a reconciliation report you can export.`,
      },
      {
        q: "Can I search and filter my guest list?",
        a: "Yes, on every plan. Search by name or email, and filter by RSVP status, plus-ones, dietary or accessibility needs, missing T-shirt size, and payment status.",
      },
      {
        q: "Can guests bring plus-ones?",
        a: "Yes. In the event settings, choose how many extra guests each person can bring (0 to 10). When a guest RSVPs yes, they'll see a counter to add plus-ones by name. Plus-ones count toward your event capacity.",
      },
      {
        q: "Can I set a maximum number of attendees?",
        a: "Yes, on every plan. Turn on the 'Cap attendance' toggle and pick a number. When you hit that number, new RSVPs pause automatically. Plus-ones count toward the cap. You can raise or lower the cap anytime.",
      },
      {
        q: "What is the waitlist?",
        a: "When your event is full, overflow guests can join a waitlist instead of being turned away. If someone declines, the next person on the list is invited automatically and emailed. Available on Whisper and higher.",
      },
      {
        q: "Can I set an RSVP deadline?",
        a: "Yes, on every plan. Pick a date and time in the event settings. After the deadline, the RSVP page shows 'RSVPs are now closed' and the buttons are disabled. You can extend the deadline anytime to re-open RSVPs.",
      },
    ],
  },
  {

    title: "Group eCards",
    subtitle: "One card, one link, everyone signs it.",
    items: [
      {
        q: "What is a Group eCard?",
        a: (
          <>
            One digital greeting card that a whole group signs together. You create the card, share a
            single link, and everyone adds their own message. On the reveal date the finished card is
            delivered to the recipient as a cinematic montage they can keep forever.{" "}
            <Link to="/ecards" className="text-velvet underline">
              Start a card
            </Link>
            .
          </>
        ),
      },
      {
        q: "How much does it cost?",
        a: (
          <>
            {ECARD_SEND_PRICE_LABEL} per card. Creating the card and collecting messages is free, and
            you pay only when you send it. It is a one-off charge per card, not a subscription, and it
            is separate from event plans.
          </>
        ),
      },
      {
        q: "Can I get a refund on a card?",
        a: (
          <>
            Creating a card and collecting messages is free. You are only charged{" "}
            {ECARD_SEND_PRICE_LABEL} when you choose to send it, and that payment is final, so there
            are no refunds once a card has been sent. If something goes wrong with a delivery, please
            contact us and we will help put it right.
          </>
        ),
      },
      {
        q: "Do contributors need an account?",
        a: "No sign-up, no app, no password. You share one link and anyone who has it can add a message. There is no limit on how many people sign the card.",
      },
      {
        q: "What can people add to the card?",
        a: (
          <ul className="list-disc space-y-1 pl-5">
            <li>A written message, with an AI "help me write" helper if they get stuck.</li>
            <li>A GIF.</li>
            <li>A photo.</li>
            <li>A short video.</li>
            <li>A voice note recorded right in the browser.</li>
          </ul>
        ),
      },
      {
        q: "Can the recipient see the messages early?",
        a: "No. Every message stays hidden until the reveal date you choose. Contributors see only their own message, so the surprise holds until the day.",
      },
      {
        q: "How is the card delivered?",
        a: "On your reveal date we email the card to the recipient. Opening it plays the messages back as a montage, with optional music, and leaves them a permanent keepsake page they can revisit and share.",
      },
      {
        q: "Are there different designs?",
        a: "Yes. There are 17 themes grouped into occasion packs, covering birthdays, farewells, thank-yous, congratulations, weddings, new babies, get well, and more.",
      },
      {
        q: "Can I change a card after I create it?",
        a: (
          <>
            Yes. From your{" "}
            <Link to="/ecards" className="text-velvet underline">
              eCards list
            </Link>{" "}
            you can edit the card details, moderate or remove a message, duplicate the card to reuse
            the same setup for someone else, or delete a card you no longer want.
          </>
        ),
      },
    ],
  },



  {
    title: "Billing",
    subtitle: "Straightforward payment answers.",
    items: [
      {
        q: "Is there a free trial?",
        a: `Yes — ${P.name} is free forever with basic features. ${A.name} has a 60-day free trial (20 guests, no payment needed, one trial per person).`,
      },
      {
        q: "What payment methods do you accept?",
        a: "All major credit and debit cards via Stripe.",
      },
      {
        q: "Are there any hidden fees?",
        a: "No. You see the price before you pay. Add-ons are optional.",
      },
    ],
  },
  {
    title: "Privacy & safety",
    subtitle: "Your data, your call.",
    items: [
      {
        q: "How is my data protected?",
        a: (
          <>
            We use encryption, secure storage, and strict access controls. Read the full{" "}
            <Link to="/privacy" className="text-velvet underline">
              privacy policy
            </Link>
            .
          </>
        ),
      },
      {
        q: "I'm a guest — can I delete my data?",
        a: (
          <>
            Yes. Visit{" "}
            <Link to="/guest-privacy" className="text-velvet underline">
              /guest-privacy
            </Link>{" "}
            to request deletion.
          </>
        ),
      },
      {
        q: "Do you sell my information?",
        a: "Never. We don't sell data, we don't show ads, and we don't share your information with advertisers.",
      },
    ],
  },
];

function FAQPage() {
  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      <SiteNav />

      <section className="relative overflow-hidden border-b border-ink/5">
        <DecorArches />
        <div className="relative mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet/80">
            Help Center
          </span>
          <h1 className="mt-3 font-serif text-5xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
            How can we <span className="italic text-velvet">help</span>?
          </h1>
          <p className="mt-5 max-w-[60ch] text-pretty text-lg text-muted-foreground">
            Clear, plain-English answers about plans, features, billing, and privacy.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
            >
              Contact a human
            </Link>
            <Link
              to="/events/new"
              className="inline-flex items-center rounded-full bg-transparent px-5 py-2.5 text-sm font-medium ring-1 ring-ink/10 transition-colors hover:bg-secondary"
            >
              Start an event
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
              <div className="divide-y divide-ink/5 rounded-2xl bg-secondary/50 ring-1 ring-ink/5">
                {section.items.map((item, i) => (
                  <FAQItem key={i} q={item.q} a={item.a} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-24 overflow-hidden rounded-3xl bg-ink p-10 text-white sm:p-14">
          <div className="grid gap-6 md:grid-cols-[2fr_1fr] md:items-center">
            <div>
              <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-gold">
                Still curious?
              </span>
              <h3 className="mt-3 font-serif text-3xl sm:text-4xl">
                Our concierge replies in seconds.
              </h3>
              <p className="mt-3 max-w-[50ch] text-zinc-400">
                Use the chat bubble for instant guidance on pricing, event setup, vendors, projects, or day-of workflows.
              </p>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <Link
                to="/contact"
                className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-medium text-ink hover:bg-paper"
              >
                Email support
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-full bg-white/10 px-5 py-2.5 text-sm font-medium text-white ring-1 ring-white/20 hover:bg-white/20"
              >
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="group"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-6 px-6 py-5 text-left list-none [&::-webkit-details-marker]:hidden">
        <span className="font-serif text-lg leading-snug">{q}</span>
        <span
          aria-hidden
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper text-velvet ring-1 ring-ink/10 transition-transform ${
            open ? "rotate-45" : ""
          }`}
        >
          +
        </span>
      </summary>
      <div className="px-6 pb-6 text-sm leading-relaxed text-ink/80">{a}</div>
    </details>
  );
}

function DecorArches() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute -right-20 -top-10 h-[420px] w-[420px] text-velvet/[0.07]"
      viewBox="0 0 400 400"
      fill="none"
    >
      <defs>
        <pattern id="dots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="400" height="400" fill="url(#dots)" />
      <path
        d="M60 340 Q60 140 200 140 Q340 140 340 340"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M110 340 Q110 190 200 190 Q290 190 290 340"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M160 340 Q160 240 200 240 Q240 240 240 340"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}
