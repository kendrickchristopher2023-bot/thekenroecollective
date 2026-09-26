import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { materializeSchedule, runTick } from "@/lib/schedules-engine.server";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const c = JSON.parse(readFileSync("/tmp/pt/ctx.json", "utf8"));
const before = (await admin.from("sms_outbox").select("id", { count: "exact", head: true })).count;
const { DEFAULT_STEPS } = await import("@/lib/schedule-messages");
const { count: sc } = await admin.from("schedule_reminder_steps").select("id", { count: "exact", head: true }).eq("schedule_id", c.S1);
if (!sc) await admin.from("schedule_reminder_steps").insert(DEFAULT_STEPS.map((x: any) => ({ ...x, schedule_id: c.S1 })));
await admin.from("schedule_people").update({ removed_at: new Date().toISOString() }).eq("schedule_id", c.S1).eq("contact_id", c.cids[5]);
await materializeSchedule(admin as any, c.S1);
const r = await runTick(admin as any, { now: new Date("2027-09-05T22:00:30Z"), dryRun: true, ownerUserId: c.A.id });
console.log("tick", JSON.stringify(r));
const { data: ppl } = await admin.from("schedule_people").select("id,paused,removed_at,rsvp_token,contact:contacts(display_name)").eq("schedule_id", c.S1);
const { data: sends } = await admin.from("schedule_reminder_sends").select("person_id,channel,status,error").in("person_id", ppl!.map((p: any) => p.id));
const name = new Map(ppl!.map((p: any) => [p.id, p.contact.display_name + (p.paused ? " (paused)" : "")]));
for (const s of sends ?? []) console.log(" ", name.get(s.person_id), s.channel, s.status, s.error ?? "");
// removed person's calendar link
const removed = ppl!.find((p: any) => p.removed_at);
const live = ppl!.find((p: any) => !p.removed_at);
for (const [lbl, p] of [["active", live], ["removed", removed]] as any) {
  if (!p) { console.log(lbl, "none"); continue; }
  const res = await fetch(`http://localhost:8080/api/public/schedule-calendar/${p.rsvp_token}`);
  console.log("calendar", lbl, res.status);
}
console.log("sms_outbox", before, (await admin.from("sms_outbox").select("id", { count: "exact", head: true })).count);
