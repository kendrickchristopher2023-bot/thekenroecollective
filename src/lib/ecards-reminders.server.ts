// Group eCards — organizer reminder worker. Server-only.
//
// A few days before the reveal, the ORGANIZER gets one friendly email nudging
// them to re-share the contribution link. Contributors are anonymous and have
// no email on file, so they are never emailed by this job.
//
// Idempotent: ecards.reminder_sent_at is stamped once and re-checked before
// every send, so a card can only ever be reminded a single time.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { enqueueTransactionalEmailServer } from "@/lib/email/server-enqueue.server";
import { ECARD_EMAIL_FALLBACK_TZ, ECARD_SITE_ORIGIN } from "@/lib/ecards-delivery.server";
import { formatDateTimeInZone } from "@/lib/ecards-time";
import { isDaytimeInZone } from "@/lib/reminder-window";

/** How many days before the reveal the final organizer reminder goes out. */
export const REMINDER_LEAD_DAYS = 3;

/**
 * The earlier nudge, sent as the countdown enters the yellow / red zone. It is
 * a separate stage with its own stamp column, so each stage sends at most once.
 */
export const EARLY_REMINDER_LEAD_DAYS = 7;

type Stage = "early" | "final";

const STAGE_COLUMN: Record<Stage, "reminder_early_sent_at" | "reminder_sent_at"> = {
  early: "reminder_early_sent_at",
  final: "reminder_sent_at",
};

type ReminderCard = {
  id: string;
  occasion: string;
  recipient_name: string;
  public_slug: string;
  organizer_user_id: string;
  reveal_date: string;
  reminder_sent_at: string | null;
  reminder_early_sent_at: string | null;
  delivered_at: string | null;
  organizer_timezone: string | null;
};

function adminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function organizerEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

async function remindOne(
  admin: SupabaseClient,
  card: ReminderCard,
  stage: Stage,
): Promise<{ ok: boolean; reason?: string }> {
  const column = STAGE_COLUMN[stage];
  if (card[column]) return { ok: false, reason: "already_reminded" };
  // The final reminder supersedes the early one, never the other way round.
  if (stage === "early" && card.reminder_sent_at) return { ok: false, reason: "already_reminded" };
  if (card.delivered_at) return { ok: false, reason: "already_delivered" };

  // Land in the organizer's daytime. If the reminder falls due overnight for
  // them, hold it: the stage stamp is still null, so a later hourly run inside
  // their 8:00 AM to 8:00 PM window picks it up and still sends exactly once.
  if (!isDaytimeInZone(card.organizer_timezone)) {
    return { ok: false, reason: "outside_daytime_window" };
  }

  const organizer = await organizerEmail(admin, card.organizer_user_id);
  if (!organizer) return { ok: false, reason: "no_organizer_email" };

  const count = await admin
    .from("ecard_contributions")
    .select("id", { count: "exact", head: true })
    .eq("ecard_id", card.id)
    .eq("is_hidden", false);

  // Emails have no live viewer, so the reveal time is always labelled with an
  // explicit zone: the organizer's stored zone, otherwise the US default.
  const revealDateLabel = formatDateTimeInZone(
    card.reveal_date,
    card.organizer_timezone || ECARD_EMAIL_FALLBACK_TZ,
  );

  const sent = await enqueueTransactionalEmailServer({
    templateName: "ecard-reminder",
    recipientEmail: organizer,
    idempotencyKey: `ecard-reminder-${stage}-${card.id}`,
    templateData: {
      recipientName: card.recipient_name,
      occasion: card.occasion,
      messageCount: count.count ?? 0,
      revealDateLabel,
      daysLeft: daysUntil(card.reveal_date),
      shareUrl: `${ECARD_SITE_ORIGIN}/c/${card.public_slug}`,
      dashboardUrl: `${ECARD_SITE_ORIGIN}/ecards/${card.id}`,
    },
    label: "ecard-reminder",
  });

  if (!sent.ok) return { ok: false, reason: sent.reason ?? "send_failed" };

  // Stamp only after a successful enqueue, and only if still unstamped.
  await admin
    .from("ecards")
    .update({ [column]: new Date().toISOString() })
    .eq("id", card.id)
    .is(column, null);

  return { ok: true };
}

const SELECT_COLUMNS =
  "id, occasion, recipient_name, public_slug, organizer_user_id, reveal_date, reminder_sent_at, reminder_early_sent_at, delivered_at, organizer_timezone";

/** Cards whose reveal falls inside a stage window and still need that stage. */
async function dueForStage(admin: SupabaseClient, stage: Stage): Promise<ReminderCard[]> {
  const now = Date.now();
  const leadDays = stage === "early" ? EARLY_REMINDER_LEAD_DAYS : REMINDER_LEAD_DAYS;
  const windowEnd = new Date(now + leadDays * 86_400_000).toISOString();

  const { getDemoUserIds } = await import("@/lib/demo-accounts.server");
  const demoUserIds = await getDemoUserIds();

  let query = admin
    .from("ecards")
    .select(SELECT_COLUMNS)
    .is(STAGE_COLUMN[stage], null)
    .is("delivered_at", null)
    .neq("status", "draft")
    .gt("reveal_date", new Date(now).toISOString())
    .lte("reveal_date", windowEnd)
    .limit(200);
  for (const id of demoUserIds) query = query.neq("organizer_user_id", id);

  if (stage === "early") {
    // Only the window between the two stages, so a card close to reveal gets the
    // final reminder rather than a duplicate early one.
    query = query
      .is("reminder_sent_at", null)
      .gt("reveal_date", new Date(now + REMINDER_LEAD_DAYS * 86_400_000).toISOString());
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data as ReminderCard[];
}

/**
 * Cron entry point: remind organizers whose reveal is inside a stage window and
 * who have not had that stage yet. Organizer only, contributors are anonymous
 * and never emailed. Each stage is stamped, so it sends at most once per card.
 */
export async function sendDueEcardReminders(): Promise<{
  considered: number;
  reminded: number;
  skipped: number;
}> {
  const admin = adminClient();
  if (!admin) return { considered: 0, reminded: 0, skipped: 0 };

  let considered = 0;
  let reminded = 0;
  let skipped = 0;

  for (const stage of ["final", "early"] as Stage[]) {
    const cards = await dueForStage(admin, stage);
    considered += cards.length;
    for (const card of cards) {
      const res = await remindOne(admin, card, stage);
      if (res.ok) reminded += 1;
      else skipped += 1;
    }
  }

  return { considered, reminded, skipped };
}

