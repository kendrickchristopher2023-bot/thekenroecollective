import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OPT_OUT_DISCLOSURE =
  " Reply STOP to opt out. Msg & data rates may apply. The Kenroe Collective.";

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

const queueInput = z.object({
  eventId: z.string().min(1).max(120),
  body: z.string().trim().min(1).max(480),
  recipients: z
    .array(
      z.object({
        phone: z.string().trim().min(7).max(32),
        guestId: z.string().max(120).optional(),
        guestName: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(500),
});

/**
 * Queue SMS messages for an event. Enforces TCPA-style consent:
 * - Skips numbers previously opted out (STOP).
 * - Appends a one-time opt-out disclosure the FIRST time we ever text a number
 *   and records that phone in sms_consent_log.
 * Does not alter the underlying send path — messages still land in sms_outbox
 * as `pending`.
 */
export const queueSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(queueInput, data, "sms.functions.ts:37"))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Demo environment: SMS is inert. Nothing is written to sms_outbox, so the
    // drain worker never calls Twilio and no real message is ever sent. The
    // UI still reports success so the flow is demo-able end to end.
    // Identity-aware: the demo account is refused whatever its cookie says.
    const { isDemoRequest, isDemoCaller, logDemoGuard } = await import("@/lib/demo-mode.server");
    if ((await isDemoRequest()) || (await isDemoCaller(context))) {
      await logDemoGuard("send_sms", { eventId: data.eventId ?? null, recipients: data.recipients.length }, userId);
      return {
        queued: data.recipients.length,
        skipped: 0,
        blockedOptOut: 0,
        blockedCap: 0,
        demo: true,
      };
    }

    // Free SMS is Host/Atelier only. Postcard and Whisper unlock sending by
    // buying the one-time `sms_pack_addon` ($6 → profiles.sms_pack_enabled).
    // The previous gate was a bare assertMinTier(..., "whisper") which both
    // rejected paying Postcard users AND (after the tier change) let Whisper
    // through without checking the add-on at all.
    const { resolveUserTier, UpgradeRequiredError } = await import("@/lib/tier-guards.server");
    const resolved = await resolveUserTier(supabase, userId);
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("sms_pack_enabled")
      .eq("id", userId)
      .maybeSingle();
    const smsPackPaid =
      resolved.isOwner || resolved.isAdmin || !!(profileRow as { sms_pack_enabled?: boolean } | null)?.sms_pack_enabled;

    // smsRemindersPerEvent is defined per tier but was never enforced at the
    // actual send path, so a host could queue an unlimited number of SMS for
    // one event (uncapped Twilio spend). Cap total non-failed sends per event
    // against the effective (tier + add-on) limit.
    const { getEffectiveSmsCap, canSendSms, isUnlimited } = await import("@/lib/tier-limits");
    if (!canSendSms(resolved.tier, smsPackPaid)) {
      throw new UpgradeRequiredError("host", "Add the $6 SMS add-on or upgrade to Host to send SMS to your guests.");
    }
    const cap = getEffectiveSmsCap(resolved.tier, smsPackPaid);
    let remainingCap = Infinity;
    if (!isUnlimited(cap)) {
      const { count: alreadySent } = await supabase
        .from("sms_outbox")
        .select("id", { count: "exact", head: true })
        .eq("event_id", data.eventId)
        .neq("status", "failed");
      remainingCap = Math.max(0, cap - (alreadySent ?? 0));
    }

    const prepared = data.recipients
      .map((r) => ({
        raw: r.phone.replace(/\s+/g, ""),
        norm: normalizePhone(r.phone),
        guestId: r.guestId ?? null,
        guestName: r.guestName ?? null,
      }))
      .filter((r) => /\+?\d[\d\-()]{5,}/.test(r.raw) && r.norm.length >= 7);

    if (!prepared.length) {
      return { queued: 0, skipped: data.recipients.length, blockedOptOut: 0, blockedCap: 0 };
    }

    const phones = Array.from(new Set(prepared.map((p) => p.norm)));
    // sms_consent_log is trusted server-only state (RLS restricts writes to service_role).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("sms_consent_log")
      .select("phone_number, opted_out")
      .in("phone_number", phones);

    const existingMap = new Map<string, boolean>();
    for (const row of existing ?? []) {
      existingMap.set(row.phone_number as string, !!row.opted_out);
    }

    const rows: Array<{
      event_id: string;
      user_id: string;
      to_phone: string;
      guest_id: string | null;
      guest_name: string | null;
      body: string;
      status: string;
      provider: string;
    }> = [];
    const newConsentInserts: Array<{ phone_number: string }> = [];
    let blockedOptOut = 0;
    let blockedCap = 0;

    for (const r of prepared) {
      const existingOpted = existingMap.get(r.norm);
      if (existingOpted === true) {
        blockedOptOut += 1;
        continue;
      }
      if (rows.length >= remainingCap) {
        blockedCap += 1;
        continue;
      }
      const isFirstEver = existingOpted === undefined;
      const bodyForRecipient = isFirstEver
        ? `${data.body}${OPT_OUT_DISCLOSURE}`
        : data.body;
      if (isFirstEver) {
        newConsentInserts.push({ phone_number: r.norm });
        existingMap.set(r.norm, false);
      }
      rows.push({
        event_id: data.eventId,
        user_id: userId,
        to_phone: r.raw,
        guest_id: r.guestId,
        guest_name: r.guestName,
        body: bodyForRecipient,
        status: "pending",
        provider: "twilio",
      });
    }

    if (newConsentInserts.length) {
      await supabaseAdmin
        .from("sms_consent_log")
        .upsert(newConsentInserts, { onConflict: "phone_number", ignoreDuplicates: true });
    }

    if (!rows.length) {
      return {
        queued: 0,
        skipped: data.recipients.length - blockedOptOut - blockedCap,
        blockedOptOut,
        blockedCap,
      };
    }

    const { error, count } = await supabase
      .from("sms_outbox")
      .insert(rows, { count: "exact" });
    if (error) throw new Error(error.message);
    // Fire-and-forget: stamp first material use on any attached pass.
    const { markMaterialUse } = await import("@/lib/pass-material-use");
    await markMaterialUse(supabase, data.eventId, "sms_queued", userId);
    return {
      queued: count ?? rows.length,
      skipped: data.recipients.length - rows.length - blockedOptOut - blockedCap,
      blockedOptOut,
      blockedCap,
    };
  });

export const listSmsOutbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(z.object({ eventId: z.string().min(1).max(120) }), data, "sms.functions.ts:190"))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("sms_outbox")
      .select("id,to_phone,guest_id,guest_name,body,status,error,created_at,sent_at")
      .eq("event_id", data.eventId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

/** Returns normalized (digits-only) phone numbers currently opted out. */
export const listSmsOptOuts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // sms_consent_log SELECT is restricted to service_role.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("sms_consent_log")
      .select("phone_number")
      .eq("opted_out", true);
    if (error) throw new Error(error.message);
    return { phones: (data ?? []).map((r) => r.phone_number as string) };
  });

/**
 * Reports whether the Twilio SMS provider is fully configured on the server,
 * and separately whether carrier (A2P 10DLC) approval is in place. Public (no
 * auth) — returns booleans only, no secret material.
 */
export const getSmsProviderStatus = createServerFn({ method: "GET" }).handler(async () => {
  // Credentials being present is NOT permission to deliver: US carriers block
  // traffic on an unapproved A2P 10DLC campaign. Verified against Twilio on
  // 2026-08-05: campaign QE2c6890da8086d771620e9b13fadeba0b reports
  // campaign_status VERIFIED with no errors, so delivery is live.
  const A2P_CAMPAIGN_APPROVED = true;
  const hasToken = !!process.env.TWILIO_AUTH_TOKEN;
  const hasSid = !!process.env.TWILIO_ACCOUNT_SID;
  const hasSender =
    !!process.env.TWILIO_MESSAGING_SERVICE_SID || !!process.env.TWILIO_PHONE_NUMBER;
  const configured = hasToken && hasSid && hasSender;
  return {
    connected: configured && A2P_CAMPAIGN_APPROVED,
    configured,
    carrierApproved: A2P_CAMPAIGN_APPROVED,
  };
});


