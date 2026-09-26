import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
const url = process.env.SUPABASE_URL!, srk = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, srk, { auth: { persistSession: false } });
const stamp = Date.now();
const pw = "Tst-" + stamp + "-xZ9!";
async function mk(tag: string) {
  const email = `pt-${tag}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error; return { id: data.user!.id, email };
}
const A = await mk("owner"), B = await mk("other");
await new Promise(r => setTimeout(r, 1500));
await admin.from("profiles").update({ tier: "atelier" }).eq("id", A.id);
await admin.from("profiles").update({ tier: "atelier" }).eq("id", B.id);
const people = [
  ["Gloria Test", "2025550101", "gloria@example.com"], ["Ben Test", "2025550102", "ben@example.com"],
  ["Cara Test", "2025550103", "cara@example.com"], ["Dan Test", "2025550104", "dan@example.com"],
  ["Eve Test", "2025550105", "eve@example.com"], ["Frank Test", "", "frank@example.com"],
  ["Existing Only", "2025550109", "existing@example.com"],
];
const cids: string[] = [];
for (const [n, p, e] of people) {
  const { data, error } = await admin.from("contacts").insert({ owner_user_id: A.id, display_name: n, phone: p ? "+1" + p : null, email: e, source: "schedules" }).select("id").single();
  if (error) throw error; cids.push(data.id);
}
async function sched(owner: string, title: string) {
  const { data, error } = await admin.from("schedules").insert({ owner_user_id: owner, title, kind: "call", start_local: "2027-09-05T19:00", timezone: "America/New_York", duration_minutes: 60, rrule: null, ends_kind: "count", occurrence_count: 1 }).select("id").single();
  if (error) throw error; return data.id as string;
}
const S1 = await sched(A.id, "PT Test Call"), S2 = await sched(A.id, "PT Second Call");
const now = new Date().toISOString();
const rows = cids.slice(0, 6).map((c, i) => ({ schedule_id: S1, contact_id: c, channel: i === 4 ? "email" : i === 5 ? "email" : "both", ...(i < 4 ? { sms_consent_by: A.id, sms_consent_at: now } : {}), first_sms_sent_at: i === 0 ? now : null }));
const { error: pe } = await admin.from("schedule_people").insert(rows); if (pe) throw pe;
await admin.from("schedule_people").insert({ schedule_id: S2, contact_id: cids[0], channel: "email" });
// B: own schedule + person
const { data: bc } = await admin.from("contacts").insert({ owner_user_id: B.id, display_name: "B Person", email: "bperson@example.com", source: "schedules" }).select("id").single();
const SB = await sched(B.id, "PT B Call");
const { data: bp } = await admin.from("schedule_people").insert({ schedule_id: SB, contact_id: bc!.id, channel: "email" }).select("id").single();
writeFileSync("/tmp/pt/ctx.json", JSON.stringify({ A, B, pw, S1, S2, SB, bPerson: bp!.id, cids }));
console.log("ok", S1);
