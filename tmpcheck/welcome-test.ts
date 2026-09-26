import { createClient } from "@supabase/supabase-js";
import { runTick, materializeSchedule } from "@/lib/schedules-engine.server";
import * as published from "./published-engine.server";
import { eventInstant } from "@/lib/datetime";

const URL = process.env.SUPABASE_URL!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY!;
const TZ = "America/New_York";
const at = (w: string) => eventInstant(w, TZ);
const log = (...a: any[]) => console.log(...a);
const DEMO = process.env.DEMO_UID!;

async function mkUser(tag: string) {
  const email = `welcome-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Test-pass-12345!", email_confirm: true });
  if (error) throw error;
  return { id: data.user!.id, email };
}
async function sends(scheduleId: string) {
  const { data: pp } = await admin.from("schedule_people").select("id, contact:contacts(display_name)").eq("schedule_id", scheduleId);
  const names = new Map((pp ?? []).map((p: any) => [p.id, p.contact?.display_name]));
  const { data } = await admin.from("schedule_reminder_sends").select("kind,channel,status,error,due_at,person_id").in("person_id", [...names.keys()]).order("created_at");
  return (data ?? []).map((r: any) => ({ ...r, name: names.get(r.person_id) }));
}
async function addPerson(owner: string, sid: string, name: string, phone: string | null, email: string | null, channel: string, consent: boolean) {
  const { data: c, error: ce } = await admin.from("contacts").insert({ owner_user_id: owner, display_name: name, phone, email, source: "schedules" }).select("id").single();
  if (ce) throw ce;
  const row: any = { schedule_id: sid, contact_id: c!.id, channel };
  if (consent) { row.sms_consent_by = owner; row.sms_consent_at = new Date().toISOString(); }
  const { data, error } = await admin.from("schedule_people").insert(row).select("id").single();
  if (error) throw new Error(`${name}: ${error.message}`);
  return data!.id;
}
async function mkSchedule(owner: string, title: string, welcome: Record<string, any>) {
  const { data: s, error } = await admin.from("schedules").insert({
    owner_user_id: owner, title, kind: "call", start_local: "2027-03-07T19:00", timezone: TZ, duration_minutes: 60,
    rrule: "FREQ=MONTHLY;BYDAY=1SU", ends_kind: "never", join_url: "https://example.com/join", ...welcome,
  }).select("*").single();
  if (error) throw error;
  const steps = [
    { offset_minutes: -10080, channel: "email", subject: "Next week: {title}", body: "Hi {first_name}, {title} is {when}.", is_starting_now: false, position: 0 },
    { offset_minutes: -1440, channel: "sms", body: "Hi {first_name}, {title} is tomorrow.", is_starting_now: false, position: 1 },
    { offset_minutes: -60, channel: "sms", body: "{title} in 1 hour.", is_starting_now: false, position: 2 },
    { offset_minutes: 0, channel: "sms", body: "{title} starting now.", is_starting_now: true, position: 3 },
  ].map((x) => ({ ...x, schedule_id: s!.id, active: true }));
  await admin.from("schedule_reminder_steps").insert(steps);
  await materializeSchedule(admin as any, s!.id, at("2027-02-20T12:00"));
  return s!;
}

const cleanup: { users: string[]; schedules: string[]; phones: string[] } = { users: [], schedules: [], phones: [] };
const WELCOME = { welcome_enabled: true, welcome_at: at("2027-03-03T18:00").toISOString(), welcome_channel: "both", welcome_subject: "Welcome: {title}", welcome_body: "Hi {first_name}, {title} starts {when}. Add it: {calendar}", welcome_late_joiners: true };

try {
  const outboxBefore = (await admin.from("sms_outbox").select("id", { count: "exact", head: true })).count;
  const owner = await mkUser("owner"); cleanup.users.push(owner.id);
  await admin.from("subscriptions").insert({ user_id: owner.id, product_id: "manual_atelier_test", price_id: "manual", status: "active", stripe_subscription_id: `manual_test_${Date.now()}`, stripe_customer_id: "manual_test", environment: "sandbox" });
  const s = await mkSchedule(owner.id, "Welcome Test Call", WELCOME); cleanup.schedules.push(s.id);
  const A = await addPerson(owner.id, s.id, "Ann Example", "+12025550101", "ann@example.com", "both", true);
  const B = await addPerson(owner.id, s.id, "Bo Optout", "+12025550102", "bo@example.com", "both", true);
  let C: string | null = null;
  try { C = await addPerson(owner.id, s.id, "Cy Noconsent", "+12025550103", "cy@example.com", "both", false); }
  catch (e: any) { log("No-consent text person refused by database:", e.message); C = await addPerson(owner.id, s.id, "Cy Noconsent", "+12025550103", "cy@example.com", "email", false); }
  cleanup.phones.push("+12025550102");
  await admin.from("sms_consent_log").insert({ phone_number: "+12025550102", opted_out: true, source: "test" } as any);
  const run = (w: string, extra: any = {}) => runTick(admin as any, { now: at(w), dryRun: true, ownerUserId: owner.id, ...extra });

  log("\n1) Feb 28 7:00 PM, email 1 week before is due, welcome is Mar 3 6:00 PM");
  log(await run("2027-02-28T19:02"));
  log(await sends(s.id));

  log("\n2) Mar 3 6:01 PM, welcome due. Then a second tick at the same time.");
  log(await run("2027-03-03T18:01"));
  const t2 = await Promise.all([run("2027-03-03T18:01"), run("2027-03-03T18:01")]);
  log("second+third (concurrent) ticks:", t2.map((r) => ({ claimed: r.claimed, welcomes: r.welcomes })));
  log((await sends(s.id)).filter((r) => r.kind === "welcome"));
  log("welcome_sent_at:", (await admin.from("schedules").select("welcome_sent_at").eq("id", s.id).single()).data);

  log("\n3) Late joiner with option On");
  await addPerson(owner.id, s.id, "Dee Late", "+12025550104", "dee@example.com", "both", true);
  log(await run("2027-03-03T18:10"));
  await admin.from("schedules").update({ welcome_late_joiners: false }).eq("id", s.id);
  await addPerson(owner.id, s.id, "Eve Later", "+12025550105", "eve@example.com", "both", true);
  log("option Off:", await run("2027-03-03T18:20"));
  log((await sends(s.id)).filter((r) => r.kind === "welcome").map((r) => `${r.name} ${r.channel} ${r.status} ${r.error ?? ""}`));

  log("\n4) Mar 6 7:00 PM, text 1 day before (after the welcome) sends normally");
  log(await run("2027-03-06T19:02"));
  log((await sends(s.id)).filter((r) => r.kind === "auto").map((r) => `${r.name} ${r.channel} ${r.status} ${r.error ?? ""} due ${r.due_at}`));

  log("\n5) Published engine against the new table");
  const s2 = await mkSchedule(owner.id, "Published Engine Test", WELCOME); cleanup.schedules.push(s2.id);
  await addPerson(owner.id, s2.id, "Pat Published", "+12025550106", "pat@example.com", "both", true);
  const pubRun = (w: string) => published.runTick(admin as any, { now: at(w), dryRun: true, ownerUserId: owner.id });
  // limit to s2 by pausing s
  await admin.from("schedules").update({ status: "paused" }).eq("id", s.id);
  log("before welcome (email 1 week before):", await pubRun("2027-02-28T19:02"));
  log("after welcome (text 1 day before):", await pubRun("2027-03-06T19:02"));
  log(await sends(s2.id));
  const s3 = await mkSchedule(owner.id, "No Welcome Test", {}); cleanup.schedules.push(s3.id);
  await addPerson(owner.id, s3.id, "Nia Nowelcome", "+12025550107", "nia@example.com", "both", true);
  log("no welcome, published engine:", await pubRun("2027-02-28T19:02"));
  log(await sends(s3.id));

  log("\n6) Second non-owner account");
  const other = await mkUser("other"); cleanup.users.push(other.id);
  const uc = createClient(URL, ANON, { auth: { persistSession: false } });
  await uc.auth.signInWithPassword({ email: other.email, password: "Test-pass-12345!" });
  log("read:", await uc.from("schedules").select("id,welcome_body,welcome_at").eq("id", s.id));
  log("update:", await uc.from("schedules").update({ welcome_body: "hacked" }).eq("id", s.id).select("id"));
  log("welcome rows:", await uc.from("schedule_reminder_sends").select("id").eq("kind", "welcome"));
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  log("signed out read:", await anon.from("schedules").select("id,welcome_body").eq("id", s.id));
  log("still:", (await admin.from("schedules").select("welcome_body").eq("id", s.id).single()).data);

  if (DEMO) {
    log("\n7) Demo schedule");
    const d = await mkSchedule(DEMO, "Demo Welcome Test", WELCOME); cleanup.schedules.push(d.id);
    log("is_demo:", d.is_demo);
    await addPerson(DEMO, d.id, "Demo Person", "+12025550108", "demo-person@example.com", "both", true);
    log(await runTick(admin as any, { now: at("2027-03-03T18:01"), dryRun: false, ownerUserId: DEMO }));
    log(await sends(d.id));
  }
  const outboxAfter = (await admin.from("sms_outbox").select("id", { count: "exact", head: true })).count;
  log("\nsms_outbox before/after:", outboxBefore, outboxAfter);
} finally {
  for (const id of cleanup.schedules) await admin.from("schedules").delete().eq("id", id);
  for (const ph of cleanup.phones) await admin.from("sms_consent_log").delete().eq("phone_number", ph).eq("source", "test");
  for (const u of cleanup.users) {
    await admin.from("contacts").delete().eq("owner_user_id", u);
    await admin.from("subscriptions").delete().eq("user_id", u);
    await admin.auth.admin.deleteUser(u);
  }
  if (DEMO) await admin.from("contacts").delete().eq("owner_user_id", DEMO).eq("email", "demo-person@example.com");
  log("cleanup done");
}
