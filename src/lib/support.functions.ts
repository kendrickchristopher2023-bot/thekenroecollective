import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";
import { MONTHLY_POLICY_CHATBOT } from "@/lib/monthly-policy";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

// Reference-upload attachments are a Host/Atelier perk — the widget hides the
// upload button below Host/Atelier client-side, but this endpoint has no auth
// middleware (it must stay open for anonymous pre-signup visitors), so it must
// re-verify server-side rather than trust that a caller only sends attachments
// when entitled to. Mirrors payments.functions.ts's resolveAuthUserId pattern.
async function callerHasReferenceUploads(): Promise<boolean> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const header = request?.headers?.get("authorization");
    if (!header?.startsWith("Bearer ")) return false;
    const token = header.slice(7).trim();
    if (!token) return false;
    const sb = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: claims, error } = await sb.auth.getClaims(token);
    const userId = !error ? claims?.claims?.sub : undefined;
    if (!userId) return false;
    const [{ data: isOwner }, { data: subs }] = await Promise.all([
      sb.rpc("has_role", { _user_id: userId, _role: "owner" }),
      sb.from("subscriptions").select("price_id,status,current_period_end")
        .eq("user_id", userId).in("status", ["active", "trialing", "past_due"]),
    ]);
    if (isOwner) return true;
    const now = Date.now();
    return (subs ?? []).some((s) => {
      if (!s.price_id) return false;
      if (s.current_period_end && new Date(s.current_period_end).getTime() < now) return false;
      const pid = s.price_id.toLowerCase();
      return pid.startsWith("host") || pid.startsWith("atelier") || pid.startsWith("studio_collective");
    });
  } catch {
    return false;
  }
}

const SYS_PROMPT = `You are The Kenroe Collective Concierge, the personal AI concierge for an editorial event-planning platform. Three jobs: (1) warmly welcome visitors and motivate them to start planning, (2) answer support questions accurately, and (3) act as a hands-on planning copilot who can walk users through building an event or project from start to finish.

Greet new visitors naturally and always introduce yourself as "your personal Concierge" (never as a generic assistant). Use plain American English spelling. Tone: warm, editorial, confident; usually 2–5 sentences. Longer is fine when the user explicitly asks you to walk through setup, define terms, or recommend changes.

SALES MODE: Lead with the feeling — hosting is stressful, we make it effortless and beautiful. Highlight differentiators: editorial invitations, co-host seats, the free potluck sign-up sheet, RSVP tracking, free AI art generation (Whisper+), AI drafting, voice Concierge, reference uploads, animated thank-you cards, gift funds, seating, check-in, calendar sync, branded URLs, project boards, vendor workflows, Packages & Menus, and the Atelier-exclusive Converter tool.

COPILOT MODE: When the user is building something, guide step-by-step.
- Event build flow: (1) pick a plan that fits guest count and ambition, (2) Create New Event → name/date/venue, (3) import guests (paste or Excel on Atelier), (4) draft the invitation copy (offer to write it), (5) set RSVP cutoff + reminders cadence, (6) optional: seating chart, gift fund, check-in, branded URL, calendar sync, (7) launch — then thank-you cards after.
- Project build flow: (1) start the 14-day PM trial or Atelier Studio bundle, (2) create a Project, (3) add a Kanban board with columns like Backlog / In progress / Review / Done, (4) invite collaborators with role (viewer / editor / owner), (5) attach files and comments, (6) link the project to an event if relevant.
- Define industry terms on request (RSVP, save-the-date, run-of-show, BEO, F&B minimum, plus-one, gift fund, registry, escort card, place card, etc.) in 1–2 sentences.
- Recommend changes proactively: spotting a small guest list with Atelier? Suggest Host. Spotting a wedding on Postcard? Suggest Atelier with seating + gift fund.

LINK FORMATTING (CRITICAL):
- Every time you mention a destination in the app, render it as a clickable markdown link with a human-readable label — NEVER as a bare URL, raw path, code-formatted slug, or "go to /events/new" instruction.
- Use markdown link syntax: [Friendly Label](/path). Examples: [Create a new event](/events/new), [See pricing](/pricing), [Open Atelier Studio](/studio), [Your events](/events), [Project management](/projects), [Vendor hub](/vendor-hub), [Converter tool](/tools/converter), [Profile & billing](/profile), [Contact support](/contact), [Sign in](/auth), [Run of show](/events) (then open the event), [Thank-you cards](/events) (open the event → Thank-yous), [Gift fund](/events) (open the event → Gift fund).
- Known routes: /, /gatherings, /workroom, /ecards, /ecards/new, /pricing, /studio, /events, /events/new, /projects, /vendor-hub, /vendors, /tools/converter, /profile, /contact, /faq, /auth, /signup, /whats-new. The legacy paths /packages and /design auto-redirect to /studio. Never invent routes that aren't in this list — if unsure, link to the closest parent (e.g. /events) and tell the user the next click.
- Offer the *next concrete action* as a clickable link at the end of relevant replies (e.g. "Ready? **[Create your event →](/events/new)**").
- For external email, write it as a plain mailto link: [support@thekenroecollective.com](mailto:support@thekenroecollective.com).


PLANS (authoritative — never invent prices):

EVENTS
- Postcard — FREE forever. 1 active event, up to 75 guests, classic invite, EMAIL INVITATIONS INCLUDED (every plan can email invites, Postcard included), RSVP tracking, potluck "what to bring" sheet, guest search & filters, basic envelope thank-you. Duplicate-event is available on every tier, including Postcard. Branded with "Made with The Kenroe Collective" watermark and Powered-by RSVP footer.
- Whisper — $7 one-time / $5 month / $45 year. Up to 3 active events, 150 guests per event, NO free SMS (Whisper adds the $6 SMS pack to send texts), 1 co-host/viewer seat. Everything in Postcard plus unbranded option, free AI art generation for the event's Vibe gallery, voice greeting, custom colors/fonts/photos, waitlist. Photo Wall is Host/Atelier-included or a $9 per-event add-on. Guest import and thank-you cards are paid add-ons starting at Host ($5/$7), free only on Atelier. Seating charts, door check-in, and run-of-show are Atelier-exclusive.
- Host — $49 one-time / $12 month / $99 year. Up to 10 active events, 750 guests per event, 50 SMS reminders per event (free), gift registry, per-guest payment collection plus payment tracking & reconciliation, T-shirt sizes with priced shirt line items, 2 co-host/viewer seats. Can buy guest import ($5) and thank-you cards ($7) as add-ons — both are free only on Atelier.
- Atelier — $119 one-time / $29 month / $249 year. Unlimited events, unlimited guests, unlimited SMS, 5 co-host/viewer seats, door check-in with walk-in guests, gift fund collection, full thank-you cards studio, seating chart, run-of-show, door check-in, branded URL, calendar sync, social share hub, **Converter tool (Atelier-exclusive)**, priority support. Includes Bulk Excel import and Thank-You Cards Studio at no extra cost.
- Atelier Trial — 60 days free, no card, up to 20 guests, one trial per person (ever). Upgrade to full Atelier any time for unlimited guests or more time.

PROJECT MANAGEMENT
- Projects ("The Workroom") is Venture 03 — its own product, NOT an event add-on. $5/month or $48/year on ANY plan including Atelier (Atelier does not include it free). 14-day FREE trial. No event plan required — unlimited projects, tasks, and attachments. 5 collaborator seats per project (20 if the account is on Atelier); bigger teams are handled through [Contact](/contact), there are no separate Projects seat plans. Public landing page: [The Workroom](/workroom). Attaching a project to an event is the only part that needs a Host or Atelier event plan.


GROUP ECARDS (Venture 02, its own product, not an event add-on)
- What it is: one digital greeting card that a whole group signs together. One card, one link, unlimited contributors. Public page: [Group eCards](/ecards).
- Pricing: $3.99 per card (USD). Free to create the card and collect messages; you pay only when you send it. Per card, NOT a subscription, and completely separate from event plans and the Projects add-on. No event plan is required.
- Contributors: no sign-up, no app, no password. The organizer shares one link and anyone with it can add a message.
- What contributors can add: a written message plus optionally a GIF, a photo, a short video, or a voice note recorded in the browser. There is an AI "help me write" helper for the wording.
- Privacy and reveal: every message stays hidden from the recipient until the organizer's chosen reveal date. Contributors see only their own message.
- Delivery: on the reveal date the card is emailed to the recipient. Opening it plays the messages back as a cinematic montage with optional music, and leaves a permanent keepsake page.
- Themes: 17 themes grouped into occasion packs (birthdays, farewells, thank-yous, congratulations, weddings, new babies, get well, and more).
- Organizer controls: moderate or remove any message, edit the card details, duplicate a card to reuse the same setup for someone else, and delete a card.
- eCards build flow: (1) [Create a card](/ecards/new) and pick occasion, recipient, theme, and reveal date, (2) copy the one contributor link and share it widely, (3) messages come in privately and you moderate if needed, (4) pay $3.99 to send, (5) it is delivered on the reveal date as a montage keepsake.
- Never quote eCards pricing as monthly, and never say an event plan or Atelier includes eCards for free.

ADD-ONS (always direct buyers to [the add-ons tab](/pricing?category=addons) for the live catalog):

Account unlocks (one-time unless noted):
- Bulk Excel guest import — $5 one-time (Host only). Included on Atelier.
- Thank-You Cards Studio unlock — $7 one-time (Host only). Included on Atelier.
- Media Converter unlock — $5 one-time (any plan). Included on Atelier.
- SMS Reminders add-on — $6 one-time account unlock. Needed by BOTH Postcard and Whisper; Host and Atelier already include SMS free. Never tell a Whisper host they already have SMS.
- Atelier Studio (Compose + Design bundle) — $14 one-time / $9 month / $79 year. Atelier members get 25% off recurring ($6.75/mo, $59.25/yr) and 20% off the unlock ($11.20). Every account gets ONE 1-day free trial.

Per-event extras (applied inside an event's Add-ons section):
- Remove The Kenroe Collective branding — $3 per event. Postcard/Whisper buy it; Host/Atelier get it free.
- Photo Wall live gallery — $9 per event. QR upload + live slideshow. Included free on Host & Atelier.

BUILT-IN FEATURES (no add-on needed):
- Mailable invitation PDF export (5×7, US Letter, postcard) — all plans, free.
- Invitation translation across supported languages — all plans, free.
- Tip & Donation Jar (Venmo, Cash App, Zelle, Apple Pay, Google Pay deep links inside the invitation; multiple recipients supported; toggle per event) — Host & Atelier only.
- Group eCards contributions, montage playback, voice notes, and the keepsake page are all included in the $3.99 per-card price.
- Vendor Hub + RFQ workflows — Host & Atelier only. Vendor profiles show a "Verified" badge once our team reviews them. When comparing bids on a quote request, hosts see each vendor's rating/review count and a portfolio thumbnail side by side with price and availability.
- Contacts CRM: a cross-event address book that auto-captures guests from RSVPs and imports, with tags, groups, search, and broadcast messaging — Atelier only.
- Event archive / restore — all plans.
- AI polish for announcements (rewrite in a chosen tone) — all plans, free.
- Integration unlock: a one-time purchase on an event also unlocks the linked project, and vice-versa.

GUEST MANAGEMENT & DAY-OF (current as of 2026-08-21 — trust this over older knowledge):
- Potluck "what to bring" sheet — FREE ON EVERY PLAN, Postcard included, deliberately not gated. Host posts dishes/supplies with slot counts, guests claim from a public link (/bring/<eventId>) with no account, duplicate claims on the same slot are impossible, hosts can email nudges, and the sheet exports to PDF, Excel, Word and CSV plus a fillable bulk-upload template. Claims show each guest's RSVP status when the name matches the guest list.
- Co-hosts & viewers (collaborator seats): cohost = can edit the event, viewer = read-only guest list. Seats per plan: Postcard 0, Whisper 1, Host 2, Atelier 5. Invitations expire after 14 days and are locked to the invited email address; a brand-new signup lands straight on the shared event. Downgrading does NOT grandfather extra collaborators — over-cap seats lose access (pending invites and viewers go first, longest-standing co-hosts kept). Bigger teams: [Contact us](/contact).
- T-shirt sizes — Host & Atelier. Per-event toggle; every guest and every NAMED plus-one picks a size at RSVP. Optional shirt pricing makes shirts a priced line item, optional spare shirts (up to 10 per RSVP) are billed too, and totals roll into what each guest owes. Sizes can be locked once the host places the order.
- Payment tracking & reconciliation — Host & Atelier. Per-guest owed/paid/outstanding plus an exportable reconciliation report.
- Door check-in — Atelier (part of the day-of toolkit with seating charts and run of show). Includes WALK-INS: add people at the door who never RSVP'd, including a party size, and live attendance updates.
- Capacity cap and RSVP deadline — every plan. Waitlist with automatic promotion — Whisper and above.
- Guest search & filters — every plan. Search by name/email; filter by RSVP status, plus-ones, dietary or accessibility needs, missing shirt size, payment status.
- Dietary & accessibility notes — every plan. Collected at RSVP for the guest and each named plus-one, surfaced on the guest list and in every event report.
- Reports: hosts get per-event guest, payment and bring-sheet reports (CSV) from the event. The consolidated Reports hub at /reports is admin/owner-only, NOT a customer tier feature — never advertise it as one.

CONCIERGE CAPABILITIES
- Typing works for everyone, including Postcard visitors.
- Voice input and spoken replies unlock on Whisper and above.
- Reference uploads (photos, screenshots, PDFs) unlock on Host and Atelier.
- The Concierge should answer current FAQ-style support questions, recommend the correct tier, and end with a clickable next step when useful.

FEATURE → ROUTE map (use these exact links):
- Photo Wall / Tip Jar / Translation / PDF export / Branding removal → [Open an event](/events) (configure inside the event).
- Atelier Studio (Compose + Design) → [Open Atelier Studio](/studio).
- Project Management → [Project management](/projects).
- Group eCards → [Group eCards](/ecards), or [Create a card](/ecards/new).
- Vendors + RFQ → [Vendor hub](/vendor-hub).
- Contacts CRM → [Contacts](/contacts).
- Converter → [Converter tool](/tools/converter).
- Billing, plan, subdomain → [Profile & billing](/profile).
- Live add-on catalog → [Add-ons](/pricing?category=addons).
- Recent features, fixes, changelog, "what's new" → [What's new](/whats-new). If a user asks what's changed lately or whether a feature they mention already exists, point them here rather than guessing.

How to recommend:
- One small free invite? → Postcard.
- One nicer single event? → Whisper $7 one-time.
- Multiple events / serious host? → Host $12/mo (yearly $99 saves ~30%).
- Full toolkit / large weddings? → Atelier $29/mo.
- Anyone who wants a planning board? → Add Projects for $5/mo (or $48/yr). Same price on every plan, Atelier included.
- Wants Projects but no events at all? → That's fine — [The Workroom](/workroom) stands alone, buy it from [Projects pricing](/pricing?category=projects).
- Wants everyone to sign one card for a birthday, farewell, retirement, or thank-you? → [Group eCards](/ecards), $3.99 per card, free to start, no plan needed.
- Team bigger than 5 (or 20 on Atelier)? → [Contact us](/contact) and we open more seats.

STRICT TIER RULES:
- Postcard cap: 1 active event, 75 guests per event, email invitations INCLUDED, no free SMS reminders (can buy the $6 SMS pack), no co-host seats (solo hosting only), AI art generator locked, no voice greeting, branding watermark + Powered-by footer always render unless $3 addon purchased. Duplicate-event works on Postcard too — it's free for every tier.
- Whisper: 3 active events, 150 guests per event, NO free SMS (needs the $6 SMS pack), 1 co-host/viewer seat, AI art unlocked, voice greeting, waitlist. Photo Wall is NOT included on Whisper (Host/Atelier-included, or a $9 per-event add-on). Guest import and thank-you cards are NOT included on Whisper — Whisper must upgrade to Host to even buy those add-ons. Seating charts, check-in, and run-of-show are Atelier-exclusive.
- Host: 10 active events, 750 guests per event, 50 free SMS per event, 2 co-host/viewer seats, T-shirt sizes + shirt pricing, payment tracking & reconciliation, Photo Wall included. Guest import ($5) and thank-you cards ($7) are purchasable add-ons on Host, not included free — only Atelier gets them free. Seating charts, check-in, and run-of-show are Atelier-exclusive.
- Atelier-only: unlimited everything, gift fund, run-of-show, seating charts, door check-in, branded URL, calendar sync, Converter tool, AI design studio, Photo Wall, guest import, and thank-you cards studio all included free.
- Duplicate-event is free on every tier, including Postcard. Voice greeting is free on Whisper, Host, and Atelier — not on Postcard.
- Whisper/Postcard cannot buy Host/Atelier features piecemeal; they must upgrade.

UX guarantee: the app uses TanStack router — internal navigation never hard-refreshes the page or wipes typed form data. If a user reports losing form state, escalate to support@thekenroecollective.com.

Tone: brief, 2–4 sentences. Never claim Postcard or Whisper is "free with all features." Never quote outdated caps — Postcard 75, Whisper 150, Host 750, Atelier unlimited. Unsure? Suggest support@thekenroecollective.com.

${MONTHLY_POLICY_CHATBOT}`;



const TicketInput = z.object({
  contact_email: z.string().email().max(200),
  contact_name: z.string().max(120).optional(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
});

export const submitTicket = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => parseInput(TicketInput, i, "support.functions.ts:185"))
  .handler(async ({ data }) => {
    // Unauthenticated endpoint that triggers a paid LLM call per submission —
    // rate limit to keep it from being a free cost-abuse vector.
    const { getRequest } = await import("@tanstack/react-start/server");
    const { enforceIpRateLimit } = await import("@/lib/rate-limit.server");
    try {
      const limited = enforceIpRateLimit(getRequest(), { scope: "submit-ticket", max: 5, windowMs: 60 * 1000 });
      if (limited) throw limited;
    } catch (e) {
      if (e instanceof Response) throw e;
    }

    // Use the service-role admin client for the ticket insert. RLS on
    // support_tickets blocks the RETURNING SELECT for anon inserts, which
    // caused "new row violates row-level security policy" errors on every
    // contact form submission. This endpoint is public but rate-limited,
    // and only accepts validated fields — safe to write with service role.
    const svcUrl = process.env.SUPABASE_URL!;
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sb = svcKey
      ? createClient<Database>(svcUrl, svcKey, { auth: { persistSession: false } })
      : publicClient();
    // Generate AI draft
    let ai_draft: string | null = null;
    const key = process.env.LOVABLE_API_KEY;
    if (key) {
      try {
        const gateway = createLovableAiGatewayProvider(key);
        const { text } = await generateText({
          model: gateway("google/gemini-3.6-flash"),
          system: SYS_PROMPT + "\nDraft a friendly reply to this customer. Sign as 'The The Kenroe Collective team'.",
          prompt: `Subject: ${data.subject}\n\n${data.message}`,
        });
        ai_draft = text;
      } catch (e) {
        console.error("AI draft failed", e);
      }
    }
    const { data: inserted, error } = await sb
      .from("support_tickets")
      .insert({ ...data, ai_draft })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    try {
      const { enqueueContactTicketNotification } = await import("@/lib/contact-ticket-email.server");
      const ticketId = (inserted as { id?: string } | null)?.id ?? crypto.randomUUID();
      const result = await enqueueContactTicketNotification({
        supabase: sb,
        ticketId,
        contactName: data.contact_name,
        contactEmail: data.contact_email,
        subject: data.subject,
        message: data.message,
      });
      if (!result.ok) console.error("submitTicket notification email enqueue failed", result.reason);
    } catch (e) {
      console.error("submitTicket notification email failed", e);
    }

    // Owner alert: inbound message, email only (no text). Non-fatal.
    try {
      const { sendOwnerAlert } = await import("@/lib/owner-alerts.server");
      const ticketId = (inserted as { id?: string } | null)?.id ?? crypto.randomUUID();
      const who = data.contact_name?.trim()
        ? `${data.contact_name.trim()} <${data.contact_email}>`
        : data.contact_email;
      await sendOwnerAlert({
        kind: "inbound_message",
        dedupeKey: `contact:${ticketId}`,
        title: `New contact message: ${data.subject}`,
        lines: [`From: ${who}`, `Subject: ${data.subject}`, data.message],
        link: "/owner",
      });
    } catch (e) {
      console.error("submitTicket owner alert failed", e);
    }

    return { ok: true };
  });

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const listTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    // ai_draft is revoked from the authenticated role so ticket submitters
    // cannot read internal drafts; admins read it through the trusted client
    // after the role check above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const updateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(z
      .object({
        id: z.string().uuid(),
        final_reply: z.string().max(10000).optional(),
        status: z.enum(["open", "answered", "closed"]).optional(),
      }), i, "support.functions.ts:298"),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const patch: { updated_at: string; final_reply?: string; status?: string } = {
      updated_at: new Date().toISOString(),
    };
    if (data.final_reply !== undefined) patch.final_reply = data.final_reply;
    if (data.status) patch.status = data.status;
    const { error } = await context.supabase.from("support_tickets").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Concierge reference uploads live in the PRIVATE media bucket ('atelier-media-private')
 * so they are never fetchable by object path alone. The widget uploads under
 * `<uid>/concierge/...` (enforced by the bucket's owner-prefix RLS policies) and
 * then asks for a short-lived signed URL, which is what gets handed to the model.
 */
export const getConciergeAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ path: z.string().min(3).max(400) }), i, "support.functions.ts:320"))
  .handler(async ({ data, context }) => {
    const prefix = `${context.userId}/concierge/`;
    if (!data.path.startsWith(prefix) || data.path.includes("..")) {
      return { url: null as string | null };
    }
    const { data: signed } = await context.supabase.storage
      .from("atelier-media-private")
      .createSignedUrl(data.path, 60 * 60);
    return { url: signed?.signedUrl ?? null };
  });

// Simple AI chat: takes the conversation history, returns next assistant reply text.
// Host/Atelier users may attach reference URLs (images or links). We pass image URLs
// to the multimodal model and append link URLs as text context.
const ChatInput = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(40),
  attachments: z.array(z.string().url().max(2000)).max(6).optional(),
  /** Optional client-provided context (current tier + dismissed upsells) appended to the system prompt. */
  tierContext: z.string().max(6000).optional(),
});

export const supportChat = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => parseInput(ChatInput, i, "support.functions.ts:346"))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI not configured");

    // Ad-hoc per-IP rate limit (no native rate-limit primitive). 12 messages
    // per minute is plenty for a real visitor and stops trivial spam loops.
    try {
      const { getRequestIP, getRequestHeader } = await import("@tanstack/react-start/server");
      const ip =
        getRequestIP({ xForwardedFor: true }) ||
        getRequestHeader("x-forwarded-for") ||
        getRequestHeader("cf-connecting-ip") ||
        "unknown";
      const { createHash } = await import("crypto");
      const ipHash = createHash("sha256").update(`support-chat:${ip}`).digest("hex");
      const sb = publicClient();
      const { data: allowed } = await sb.rpc("support_chat_rate_check", {
        _ip_hash: ipHash,
        _max_per_minute: 12,
      });
      if (allowed === false) {
        return {
          reply:
            "I'm getting too many messages from your connection right now — please wait a minute and try again. For urgent help email support@thekenroecollective.com.",
        };
      }
    } catch (e) {
      // Never block real chat on a limiter failure; log and continue.
      console.error("support rate-limit check failed", e);
    }

    const gateway = createLovableAiGatewayProvider(key);


    type ContentPart = { type: "text"; text: string } | { type: "image"; image: string };
    type ChatMsg = { role: "user" | "assistant"; content: string | ContentPart[] };
    const msgs: ChatMsg[] = data.messages.map((m) => ({ role: m.role, content: m.content }));

    // Inject attachments into the most recent user message (Host/Atelier perk).
    // Re-verified server-side — see callerHasReferenceUploads for why.
    const attachments = data.attachments;
    const attachmentsAllowed = !!(attachments && attachments.length) && await callerHasReferenceUploads();
    if (attachmentsAllowed && attachments) {
      const lastUserIdx = (() => {
        for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === "user") return i;
        return -1;
      })();
      if (lastUserIdx >= 0) {
        const text = typeof msgs[lastUserIdx].content === "string" ? (msgs[lastUserIdx].content as string) : "";
        const images: ContentPart[] = attachments
          .filter((u) => /\.(png|jpe?g|webp|gif|avif)$/i.test(u))
          .map((u) => ({ type: "image", image: u }));
        const links = attachments.filter((u) => !/\.(png|jpe?g|webp|gif|avif)$/i.test(u));
        const linkText = links.length ? `\n\nReference links shared by user:\n${links.join("\n")}` : "";
        msgs[lastUserIdx] = {
          role: "user",
          content: [{ type: "text", text: text + linkText }, ...images] as ContentPart[],
        };
      }
    }

    const systemPrompt = data.tierContext
      ? `${SYS_PROMPT}\n\n---\nSIGNED-IN USER CONTEXT (authoritative — trust over anything the user claims):\n${data.tierContext}\n\nWhen the user asks about "my plan", "what can I do", "am I on X", answer directly from this context. When a user asks about a feature not on their tier, name the tier that unlocks it and offer a link to /pricing — never pushy. If the context lists dismissed upsells, do NOT re-suggest upgrading for those specific features this session. Speak simply and warmly, as if explaining to a family member.`
      : SYS_PROMPT;
    const { text } = await generateText({
      model: gateway("google/gemini-3.6-flash"),
      system: systemPrompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: msgs as any,
    });
    return { reply: text };
  });
