import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_STEPS } from "@/lib/schedule-messages";

// Every function here runs as the signed-in user, so RLS decides what they can
// read and write. The admin client is only used for work RLS does not grant
// (rebuilding occurrences, dry runs), and always after the user's own client
// has proven they own the schedule.

const PLAN_ERROR = "Schedules is included with Host and Atelier plans.";

async function assertCanUse(supabase: any) {
  const { data } = await supabase.rpc("i_can_use_schedules");
  if (data !== true) throw new Error(PLAN_ERROR);
}

async function ownedSchedule(supabase: any, id: string) {
  const { data, error } = await supabase.from("schedules").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Schedule not found.");
  return data as any;
}

async function rebuild(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { materializeSchedule } = await import("@/lib/schedules-engine.server");
  await materializeSchedule(supabaseAdmin as any, id);
}

const wall = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

const ScheduleInput = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["call", "meeting", "event"]),
  description: z.string().max(4000).nullable().optional(),
  join_url: z.string().max(1000).nullable().optional(),
  dial_in: z.string().max(100).nullable().optional(),
  dial_pin: z.string().max(40).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  start_local: wall,
  timezone: z.string().min(3).max(64),
  duration_minutes: z.number().int().min(5).max(1440),
  rrule: z.string().max(300).nullable(),
  ends_kind: z.enum(["never", "on_date", "count"]),
  until_local: wall.nullable().optional(),
  occurrence_count: z.number().int().min(1).max(1000).nullable().optional(),
  source_type: z.enum(["event", "project"]).nullable().optional(),
  source_id: z.string().max(100).nullable().optional(),
});

function cleanRule(rule: string | null) {
  if (!rule) return null;
  if (/FREQ=(HOURLY|MINUTELY|SECONDLY)/i.test(rule)) throw new Error("Daily is the most often a schedule can repeat.");
  if (!/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,+-]+)*$/.test(rule)) throw new Error("That repeat pattern isn't supported.");
  return rule;
}

export const getScheduleAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as any).rpc("i_can_use_schedules");
    const { data: own } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" });
    const { isDemoCaller } = await import("@/lib/demo-mode.server");
    const isDemo = await isDemoCaller(context as any).catch(() => true);
    return { canUse: data === true, isOwner: own === true, isDemo };
  });

export const listSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const { data: rows, error } = await sb.from("schedules").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: any) => r.id);
    const counts: Record<string, number> = {};
    const next: Record<string, string | null> = {};
    const held: Record<string, number> = {};
    if (ids.length) {
      const [{ data: ppl }, { data: occ }, { data: h }] = await Promise.all([
        sb.from("schedule_people").select("schedule_id").in("schedule_id", ids).is("removed_at", null),
        sb.from("schedule_occurrences").select("schedule_id,starts_at").in("schedule_id", ids).in("status", ["scheduled", "moved"]).gte("starts_at", new Date().toISOString()).order("starts_at"),
        sb.from("schedule_reminder_sends").select("id, occurrence:schedule_occurrences(schedule_id)").in("status", ["held", "paused"]),
      ]);
      for (const p of ppl ?? []) counts[p.schedule_id] = (counts[p.schedule_id] ?? 0) + 1;
      for (const o of occ ?? []) if (!next[o.schedule_id]) next[o.schedule_id] = o.starts_at;
      for (const x of h ?? []) { const sid = x.occurrence?.schedule_id; if (sid) held[sid] = (held[sid] ?? 0) + 1; }
    }
    return (rows ?? []).map((r: any) => ({ ...r, people_count: counts[r.id] ?? 0, next_at: next[r.id] ?? null, held_count: held[r.id] ?? 0 }));
  });

export const getSchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const schedule = await ownedSchedule(sb, data.id);
    const [{ data: exceptions }, { data: people }, { data: steps }, { data: occurrences }, { data: sends }, { data: allOcc }] = await Promise.all([
      sb.from("schedule_exceptions").select("*").eq("schedule_id", data.id),
      sb.from("schedule_people").select("*, contact:contacts(id,display_name,email,phone,email_opt_out)").eq("schedule_id", data.id).is("removed_at", null).order("created_at"),
      sb.from("schedule_reminder_steps").select("*").eq("schedule_id", data.id).eq("active", true).order("position"),
      sb.from("schedule_occurrences").select("*").eq("schedule_id", data.id).gte("ends_at", new Date().toISOString()).order("starts_at").limit(12),
      sb.from("schedule_reminder_sends").select("id,status,error,channel,due_at,sent_at,created_at,kind,person_id,step_id,occurrence_id").eq("owner_user_id", context.userId).order("created_at", { ascending: false }).limit(300),
      sb.from("schedule_occurrences").select("id,starts_at").eq("schedule_id", data.id),
    ]);
    const occIds = new Set((allOcc ?? []).map((o: any) => o.id));
    const occStart = new Map((allOcc ?? []).map((o: any) => [o.id, o.starts_at]));
    const mine = (sends ?? []).filter((s: any) => occIds.has(s.occurrence_id));
    const { data: canUse } = await sb.rpc("i_can_use_schedules");
    return {
      schedule,
      exceptions: exceptions ?? [],
      people: people ?? [],
      steps: steps ?? [],
      occurrences: occurrences ?? [],
      problems: mine.filter((s: any) => ["held", "paused", "blocked", "failed"].includes(s.status)).slice(0, 50),
      history: mine.slice(0, 60).map((s: any) => ({ ...s, occurrence_starts_at: occStart.get(s.occurrence_id) ?? null })),
      canUse: canUse === true,
    };
  });

export const saveSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid().nullable(), values: ScheduleInput }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertCanUse(sb);
    const v = { ...data.values, rrule: cleanRule(data.values.rrule) };
    if (v.ends_kind !== "on_date") v.until_local = null;
    if (v.ends_kind !== "count") v.occurrence_count = null;
    if (!v.rrule) { v.ends_kind = "count"; v.occurrence_count = 1; v.until_local = null; }
    if (v.source_type && v.source_id) {
      // Never trust a browser-sent link target: it must be the caller's own.
      if (v.source_type === "event") {
        const { data: ok } = await sb.rpc("owns_event", { _event_id: v.source_id, _user_id: context.userId });
        if (ok !== true) throw new Error("You can only attach your own events.");
      } else {
        const { data: ok } = await sb.rpc("pm_is_project_admin", { _project_id: v.source_id, _user_id: context.userId });
        if (ok !== true) throw new Error("You can only attach projects you manage.");
      }
    } else { v.source_type = null; v.source_id = null; }

    let id = data.id;
    if (id) {
      await ownedSchedule(sb, id);
      const { error } = await sb.from("schedules").update(v).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { isDemoCaller } = await import("@/lib/demo-mode.server");
      const is_demo = await isDemoCaller(context as any);
      const { data: row, error } = await sb.from("schedules").insert({ ...v, owner_user_id: context.userId, is_demo }).select("id").single();
      if (error) throw new Error(error.message);
      id = row.id as string;
      const { error: stErr } = await sb.from("schedule_reminder_steps").insert(DEFAULT_STEPS.map((s) => ({ ...s, schedule_id: id })));
      if (stErr) throw new Error(stErr.message);
    }
    await rebuild(id!);
    return { id: id! };
  });

/** "This and all future": end the old series the day before, start a new one. */
export const splitSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), fromLocal: wall, values: ScheduleInput }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertCanUse(sb);
    const old = await ownedSchedule(sb, data.id);
    if (!old.rrule) throw new Error("A one-time schedule has no future dates to split.");
    const d = new Date(`${data.fromLocal}:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const untilLocal = d.toISOString().slice(0, 16);
    const { error: e1 } = await sb.from("schedules").update({ ends_kind: "on_date", until_local: untilLocal, occurrence_count: null }).eq("id", data.id);
    if (e1) throw new Error(e1.message);
    const v = { ...data.values, rrule: cleanRule(data.values.rrule) };
    const { data: row, error } = await sb
      .from("schedules")
      .insert({ ...v, owner_user_id: context.userId, parent_schedule_id: data.id, is_demo: old.is_demo, source_type: old.source_type, source_id: old.source_id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const newId = row.id as string;
    const [{ data: steps }, { data: ppl }] = await Promise.all([
      sb.from("schedule_reminder_steps").select("offset_minutes,channel,is_starting_now,subject,body,position").eq("schedule_id", data.id).eq("active", true),
      sb.from("schedule_people").select("contact_id,channel,paused,sms_consent_by,sms_consent_at,first_sms_sent_at").eq("schedule_id", data.id).is("removed_at", null),
    ]);
    if (steps?.length) await sb.from("schedule_reminder_steps").insert(steps.map((s: any) => ({ ...s, schedule_id: newId })));
    if (ppl?.length) await sb.from("schedule_people").insert(ppl.map((p: any) => ({ ...p, schedule_id: newId })));
    await rebuild(data.id);
    await rebuild(newId);
    return { id: newId };
  });

export const setScheduleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["active", "paused", "ended"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await ownedSchedule(sb, data.id);
    const { error } = await sb.from("schedules").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await ownedSchedule(sb, data.id);
    const { error } = await sb.from("schedules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      originalLocal: wall,
      action: z.enum(["skip", "move", "clear"]),
      newStartLocal: wall.nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await ownedSchedule(sb, data.id);
    if (data.action === "clear") {
      await sb.from("schedule_exceptions").delete().eq("schedule_id", data.id).eq("original_local", data.originalLocal);
    } else {
      if (data.action === "move" && !data.newStartLocal) throw new Error("Pick the new date and time.");
      const { error } = await sb.from("schedule_exceptions").upsert(
        { schedule_id: data.id, original_local: data.originalLocal, action: data.action, new_start_local: data.action === "move" ? data.newStartLocal : null },
        { onConflict: "schedule_id,original_local" },
      );
      if (error) throw new Error(error.message);
    }
    await rebuild(data.id);
    return { ok: true };
  });

const StepInput = z.object({
  offset_minutes: z.number().int().min(-43200).max(0),
  channel: z.enum(["email", "sms"]),
  is_starting_now: z.boolean(),
  subject: z.string().max(200).nullable(),
  body: z.string().trim().min(1).max(2000),
});

export const saveSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), steps: z.array(StepInput).max(10) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertCanUse(sb);
    await ownedSchedule(sb, data.id);
    // Steps that already sent are switched off, never deleted, so their send
    // history (and the no-double-send key) is kept.
    const { data: existing } = await sb.from("schedule_reminder_steps").select("id").eq("schedule_id", data.id).eq("active", true);
    const exIds = (existing ?? []).map((s: any) => s.id);
    const { data: used } = exIds.length ? await sb.from("schedule_reminder_sends").select("step_id").in("step_id", exIds) : { data: [] };
    const usedIds = new Set((used ?? []).map((u: any) => u.step_id));
    const unused = exIds.filter((x: string) => !usedIds.has(x));
    if (unused.length) await sb.from("schedule_reminder_steps").delete().in("id", unused);
    if (usedIds.size) await sb.from("schedule_reminder_steps").update({ active: false }).in("id", [...usedIds]);
    const rows = data.steps.map((s, i) => ({ ...s, is_starting_now: s.offset_minutes === 0 ? true : s.is_starting_now, schedule_id: data.id, position: i, active: true }));
    if (rows.length) {
      const { error } = await sb.from("schedule_reminder_steps").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------------- People ----------------

const NewPerson = z.object({
  contactId: z.string().uuid().nullable().optional(),
  name: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(320).optional(),
});

async function upsertContact(sb: any, userId: string, p: { name?: string; phone?: string; email?: string }, existingId?: string | null) {
  const { toE164, validEmail } = await import("@/lib/contact-import.server");
  const phone = p.phone ? toE164(p.phone) : "";
  const email = p.email && validEmail(p.email) ? p.email.trim().toLowerCase() : "";
  if (p.phone && !phone) throw new Error(`"${p.phone}" is not a valid phone number.`);
  if (p.email && !email) throw new Error(`"${p.email}" is not a valid email address.`);
  if (!phone && !email) throw new Error("Each person needs a phone number or an email.");
  if (existingId) {
    const { data: ex } = await sb.from("contacts").select("*").eq("id", existingId).maybeSingle();
    if (!ex) throw new Error("That contact was not found.");
    const patch: Record<string, string> = {};
    if (!ex.display_name && p.name) patch.display_name = p.name.trim();
    if (!ex.phone && phone) patch.phone = phone;
    if (!ex.email && email) patch.email = email;
    if (Object.keys(patch).length) await sb.from("contacts").update(patch).eq("id", existingId);
    return existingId;
  }
  // Dedupe against every stored phone form and the normalized email.
  const { phoneKeys } = await import("@/lib/phone-keys");
  const forms = phone ? phoneKeys(phone).flatMap((k) => [k, `+${k}`]) : [];
  let q = sb.from("contacts").select("id").eq("owner_user_id", userId).is("merged_into", null).limit(1);
  const ors = [...(email ? [`email_norm.eq.${email}`] : []), ...forms.map((f) => `phone_norm.eq.${f}`)];
  if (ors.length) {
    const { data: found } = await q.or(ors.join(","));
    if (found?.[0]) return upsertContact(sb, userId, p, found[0].id);
  }
  const { data: row, error } = await sb
    .from("contacts")
    .insert({ owner_user_id: userId, display_name: p.name?.trim() || null, phone: phone || null, email: email || null, source: "schedules" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return row.id as string;
}

export const addPeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      scheduleId: z.string().uuid(),
      people: z.array(NewPerson).max(500).default([]),
      groupIds: z.array(z.string().uuid()).max(50).default([]),
      channel: z.enum(["email", "sms", "both"]),
      smsConsent: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertCanUse(sb);
    await ownedSchedule(sb, data.scheduleId);
    if (data.channel !== "email" && !data.smsConsent) {
      throw new Error("Please confirm these people agreed to get text reminders from you.");
    }
    const ids = new Set<string>();
    for (const p of data.people) {
      if (p.contactId) {
        const { data: c } = await sb.from("contacts").select("id").eq("id", p.contactId).maybeSingle();
        if (!c) throw new Error("That contact was not found.");
        ids.add(p.contactId);
      } else ids.add(await upsertContact(sb, context.userId, p));
    }
    if (data.groupIds.length) {
      const { data: g } = await sb.from("contact_groups").select("id").in("id", data.groupIds);
      const okGroups = (g ?? []).map((x: any) => x.id);
      if (okGroups.length) {
        const { data: m } = await sb.from("contact_group_members").select("contact_id").in("group_id", okGroups);
        for (const x of m ?? []) ids.add(x.contact_id);
      }
    }
    const now = new Date().toISOString();
    const consent = data.channel !== "email" ? { sms_consent_by: context.userId, sms_consent_at: now } : {};
    const rows = [...ids].map((contact_id) => ({ schedule_id: data.scheduleId, contact_id, channel: data.channel, removed_at: null, paused: false, ...consent }));
    if (rows.length) {
      const { error } = await sb.from("schedule_people").upsert(rows, { onConflict: "schedule_id,contact_id" });
      if (error) throw new Error(error.message);
    }
    if (data.channel !== "email" && ids.size) {
      // Mirror into the shared consent record so every sender sees it.
      const { data: cs } = await sb.from("contacts").select("phone").in("id", [...ids]);
      const phones = (cs ?? []).map((c: any) => c.phone).filter(Boolean);
      if (phones.length) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        for (const phone of phones) {
          const { data: ex } = await (supabaseAdmin as any).from("sms_consent_log").select("id").eq("phone_number", phone).maybeSingle();
          if (!ex) await (supabaseAdmin as any).from("sms_consent_log").insert({ phone_number: phone, opted_out: false });
        }
      }
    }
    return { added: rows.length };
  });

export const updatePerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      personId: z.string().uuid(),
      channel: z.enum(["email", "sms", "both"]).optional(),
      paused: z.boolean().optional(),
      remove: z.boolean().optional(),
      smsConsent: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: p } = await sb.from("schedule_people").select("*").eq("id", data.personId).maybeSingle();
    if (!p) throw new Error("Person not found.");
    const patch: Record<string, unknown> = {};
    if (data.channel) {
      if (data.channel !== "email" && !p.sms_consent_at && !data.smsConsent) {
        throw new Error("Please confirm this person agreed to get text reminders from you.");
      }
      patch.channel = data.channel;
      if (data.channel !== "email" && !p.sms_consent_at) { patch.sms_consent_by = context.userId; patch.sms_consent_at = new Date().toISOString(); }
    }
    if (typeof data.paused === "boolean") patch.paused = data.paused;
    if (data.remove) patch.removed_at = new Date().toISOString();
    const { error } = await sb.from("schedule_people").update(patch).eq("id", data.personId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const [{ data: contacts }, { data: groups }, { data: members }] = await Promise.all([
      sb.from("contacts").select("id,display_name,email,phone").is("merged_into", null).order("display_name").limit(2000),
      sb.from("contact_groups").select("id,name").order("name"),
      sb.from("contact_group_members").select("group_id"),
    ]);
    const counts: Record<string, number> = {};
    for (const m of members ?? []) counts[m.group_id] = (counts[m.group_id] ?? 0) + 1;
    return { contacts: contacts ?? [], groups: (groups ?? []).map((g: any) => ({ ...g, count: counts[g.id] ?? 0 })) };
  });

// ---------------- Import ----------------

export const parseContactImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      kind: z.enum(["csv", "xlsx", "image", "pdf", "text"]),
      storagePath: z.string().max(300).nullable().optional(),
      mime: z.string().max(100).nullable().optional(),
      text: z.string().max(20000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertCanUse(sb);
    // Demo/showcase accounts and the demo hostname never reach the paid AI parse.
    const { isDemoCaller, assertNotDemo } = await import("@/lib/demo-mode.server");
    if (await isDemoCaller(context as any)) throw new Error("Importing from a file is turned off in the demo.");
    await assertNotDemo("contact import");
    const imp = await import("@/lib/contact-import.server");
    let rows: Awaited<ReturnType<typeof imp.parseSheet>> = [];
    let importId: string | null = null;

    if (data.kind === "text") {
      if (!data.text?.trim()) throw new Error("Paste a list first.");
      rows = await imp.extractWithAi({ kind: "text", text: data.text });
    } else {
      const path = data.storagePath ?? "";
      if (!path.startsWith(`${context.userId}/`)) throw new Error("That file is not yours.");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rec, error: recErr } = await (supabaseAdmin as any)
        .from("contact_imports")
        .insert({ owner_user_id: context.userId, storage_path: path, kind: data.kind })
        .select("id")
        .single();
      if (recErr) throw new Error(recErr.message);
      importId = rec.id;
      // Read through the user's own session: storage policies only allow their folder.
      const { data: blob, error } = await sb.storage.from("contact-imports").download(path);
      if (error || !blob) throw new Error("We couldn't open that file. Please upload it again.");
      const buf = new Uint8Array(await blob.arrayBuffer());
      const L = imp.IMPORT_LIMITS;
      if (data.kind === "csv" || data.kind === "xlsx") {
        if (buf.byteLength > L.sheetBytes) throw new Error("Spreadsheets can be up to 5 MB.");
        rows = await imp.parseSheet(buf);
      } else if (data.kind === "image") {
        if (buf.byteLength > L.imageBytes) throw new Error("Photos can be up to 10 MB.");
        rows = await imp.extractWithAi({ kind: "image", mime: data.mime || "image/jpeg", base64: Buffer.from(buf).toString("base64") });
      } else {
        if (buf.byteLength > L.pdfBytes) throw new Error("PDFs can be up to 10 MB.");
        if (imp.countPdfPages(buf) > L.pdfPages) throw new Error("PDFs can be up to 10 pages.");
        rows = await imp.extractWithAi({ kind: "pdf", base64: Buffer.from(buf).toString("base64") });
      }
      await (supabaseAdmin as any).from("contact_imports").update({ status: "parsed", row_count: rows.length }).eq("id", importId);
    }

    // Validate and match against the owner's existing contacts.
    const { data: existing } = await sb.from("contacts").select("id,display_name,email,phone,email_norm").is("merged_into", null).limit(5000);
    const byEmail = new Map<string, any>();
    const byPhone = new Map<string, any>();
    const { canonicalPhone } = await import("@/lib/phone-keys");
    for (const c of existing ?? []) {
      if (c.email_norm) byEmail.set(c.email_norm, c);
      if (c.phone) byPhone.set(canonicalPhone(c.phone), c);
    }
    const reviewed = rows.map((r) => {
      const phone = r.phone ? imp.toE164(r.phone) : "";
      const email = r.email.trim().toLowerCase();
      const dup = (email && byEmail.get(email)) || (phone && byPhone.get(canonicalPhone(phone))) || null;
      return {
        name: r.name,
        phone: phone || r.phone,
        email,
        phoneValid: !r.phone || !!phone,
        emailValid: !email || imp.validEmail(email),
        confidence: r.confidence,
        duplicate: dup ? { id: dup.id, name: dup.display_name, email: dup.email, phone: dup.phone } : null,
      };
    });
    return { importId, rows: reviewed };
  });

export const confirmContactImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      importId: z.string().uuid().nullable(),
      scheduleId: z.string().uuid(),
      channel: z.enum(["email", "sms", "both"]),
      smsConsent: z.boolean(),
      rows: z.array(
        z.object({
          name: z.string().max(200),
          phone: z.string().max(40),
          email: z.string().max(320),
          action: z.enum(["new", "merge", "skip"]),
          existingId: z.string().uuid().nullable().optional(),
        }),
      ).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertCanUse(sb);
    await ownedSchedule(sb, data.scheduleId);
    if (data.channel !== "email" && !data.smsConsent) {
      throw new Error("Please confirm these people agreed to get text reminders from you.");
    }
    const ids: string[] = [];
    const problems: string[] = [];
    const refused: { name: string; reason: string }[] = [];
    const cleared: { name: string; field: "email" | "phone" }[] = [];
    const { toE164, validEmail } = await import("@/lib/contact-import.server");
    for (const r of data.rows) {
      if (r.action === "skip") continue;
      // The server is the real guard: an invalid value is never saved.
      const label = r.name.trim() || r.email.trim() || r.phone.trim() || "Unnamed row";
      const rawEmail = r.email.trim().toLowerCase();
      const rawPhone = r.phone.trim();
      const email = rawEmail && validEmail(rawEmail) ? rawEmail : "";
      const phone = rawPhone ? toE164(rawPhone) : "";
      if (!email && !phone) {
        refused.push({ name: label, reason: rawEmail || rawPhone ? "The email and phone are not valid, so there is no way to reach this person." : "This row has no email or phone." });
        continue;
      }
      if (rawEmail && !email) cleared.push({ name: label, field: "email" });
      if (rawPhone && !phone) cleared.push({ name: label, field: "phone" });
      try {
        ids.push(await upsertContact(sb, context.userId, { name: r.name, phone, email }, r.action === "merge" ? r.existingId : null));
      } catch (e) {
        problems.push(`${label}: ${(e as Error).message}`);
      }
    }
    const now = new Date().toISOString();
    const consent = data.channel !== "email" ? { sms_consent_by: context.userId, sms_consent_at: now } : {};
    const unique = [...new Set(ids)];
    if (unique.length) {
      const { error } = await sb
        .from("schedule_people")
        .upsert(unique.map((contact_id) => ({ schedule_id: data.scheduleId, contact_id, channel: data.channel, removed_at: null, ...consent })), { onConflict: "schedule_id,contact_id" });
      if (error) throw new Error(error.message);
    }
    if (data.importId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rec } = await (supabaseAdmin as any).from("contact_imports").select("storage_path,owner_user_id").eq("id", data.importId).maybeSingle();
      if (rec && rec.owner_user_id === context.userId) {
        if (rec.storage_path) await sb.storage.from("contact-imports").remove([rec.storage_path]);
        await (supabaseAdmin as any).from("contact_imports").update({ status: "confirmed", storage_path: null }).eq("id", data.importId);
      }
    }
    return { added: unique.length, problems, refused, cleared };
  });

// ---------------- Send now ----------------

const SendNowTarget = z.object({
  scheduleId: z.string().uuid(),
  occurrenceId: z.string().uuid().nullable(),
  channel: z.enum(["email", "sms", "both"]),
  personIds: z.array(z.string().uuid()).max(500).nullable(),
});

export const previewSendNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendNowTarget.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const engine = await import("@/lib/schedules-engine.server");
    const { isDemoCaller } = await import("@/lib/demo-mode.server");
    const r = await engine.manualSendPreview(supabaseAdmin as any, context.supabase, context.userId, data);
    return { ...r, demo: r.demo || (await isDemoCaller(context as any).catch(() => true)) };
  });

export const sendNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    SendNowTarget.extend({
      occurrenceId: z.string().uuid(),
      requestId: z.string().uuid(),
      subject: z.string().trim().min(1).max(200),
      emailBody: z.string().trim().min(1).max(4000),
      smsBody: z.string().trim().min(1).max(480),
      textsAtMorning: z.boolean().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const engine = await import("@/lib/schedules-engine.server");
    const { isDemoCaller } = await import("@/lib/demo-mode.server");
    // Demo and showcase sessions are dry runs no matter what the browser sends.
    const forceDryRun = await isDemoCaller(context as any).catch(() => true);
    return engine.manualSend(supabaseAdmin as any, context.supabase, context.userId, { ...data, forceDryRun });
  });

// ---------------- Owner tools ----------------

export const runScheduleEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ dryRun: z.boolean().default(true) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: own } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" });
    if (own !== true) throw new Error("Owners only.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const engine = await import("@/lib/schedules-engine.server");
    // Only the caller's own schedules, so a test run never touches anyone else's.
    const { data: mine } = await (context.supabase as any).from("schedules").select("id");
    for (const s of mine ?? []) await engine.materializeSchedule(supabaseAdmin as any, s.id);
    return engine.runTick(supabaseAdmin as any, { dryRun: data.dryRun, ownerUserId: context.userId });
  });

export const getPersonPage = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().regex(/^[a-f0-9]{48}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: p } = await admin.from("schedule_people").select("schedule_id,removed_at,contact:contacts(display_name)").eq("rsvp_token", data.token).maybeSingle();
    if (!p || p.removed_at) return null;
    const { data: s } = await admin.from("schedules").select("title,kind,timezone,join_url,dial_in,dial_pin,location,rrule,start_local,duration_minutes,ends_kind,until_local,occurrence_count,description").eq("id", p.schedule_id).maybeSingle();
    if (!s) return null;
    const { data: next } = await admin.from("schedule_occurrences").select("starts_at").eq("schedule_id", p.schedule_id).in("status", ["scheduled", "moved"]).gte("ends_at", new Date().toISOString()).order("starts_at").limit(1);
    return {
      firstName: String(p.contact?.display_name ?? "").split(/\s+/)[0] || "",
      title: s.title,
      kind: s.kind,
      timezone: s.timezone,
      joinUrl: s.join_url,
      dialIn: s.dial_in,
      dialPin: s.dial_pin,
      location: s.location,
      description: s.description,
      rrule: s.rrule,
      nextAt: next?.[0]?.starts_at ?? null,
      schedule: { start_local: s.start_local, timezone: s.timezone, duration_minutes: s.duration_minutes, rrule: s.rrule, ends_kind: s.ends_kind, until_local: s.until_local, occurrence_count: s.occurrence_count },
    };
  });

/** Cancel an import: delete the uploaded file now and mark the import discarded. */
export const discardContactImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ importId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rec } = await (supabaseAdmin as any).from("contact_imports").select("storage_path,owner_user_id").eq("id", data.importId).maybeSingle();
    if (!rec || rec.owner_user_id !== context.userId) throw new Error("Import not found.");
    if (rec.storage_path) await sb.storage.from("contact-imports").remove([rec.storage_path]);
    await (supabaseAdmin as any).from("contact_imports").update({ status: "discarded", storage_path: null }).eq("id", data.importId);
    return { ok: true };
  });
