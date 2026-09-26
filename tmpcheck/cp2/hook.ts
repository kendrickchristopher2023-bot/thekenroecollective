import { createHmac } from "crypto";
import { admin, load } from "./lib";
const s = load(); const O = s.users.owner;
const H = 3600_000;
const HOOK = "http://localhost:8080/api/public/hooks/sms-opt-out-webhook";
const hist = async (pid: string, occ: string, agoH: number) => {
  const { error } = await admin.from("schedule_reminder_sends").insert({ occurrence_id: occ, person_id: pid, step_id: null, channel: "sms", kind: "manual", owner_user_id: O, due_at: new Date(Date.now() - agoH * H).toISOString(), sent_at: new Date(Date.now() - agoH * H).toISOString(), status: "sent", body: "test history" }).select("id").single();
  if (error) throw error;
};
const post = async (from: string, body: string, sign: "good" | "bad" | "none" = "good") => {
  const p = new URLSearchParams({ From: from, Body: body, MessageSid: `SMcp2${Math.random().toString(36).slice(2)}` });
  const keys = [...p.keys()].sort(); let d = HOOK; for (const k of keys) d += k + p.get(k);
  const sig = createHmac("sha1", process.env.TWILIO_AUTH_TOKEN!).update(d).digest("base64");
  const h: any = { "content-type": "application/x-www-form-urlencoded" };
  if (sign === "good") h["x-twilio-signature"] = sig; if (sign === "bad") h["x-twilio-signature"] = sig.slice(0, -4) + "AAA=";
  const r = await fetch(HOOK, { method: "POST", headers: h, body: p.toString() });
  const t = await r.text(); const m = t.match(/<Message>(.*)<\/Message>/);
  return `${r.status} ${m ? "TwiML: " + m[1] : t.includes("<Response/>") ? "(empty TwiML)" : t.slice(0, 60)}`;
};
const rsvp = async (occ: string, pid: string) => (await admin.from("schedule_rsvps").select("answer,source").eq("occurrence_id", occ).eq("person_id", pid).maybeSingle()).data;
const lastReply = async (pid: string) => (await admin.from("schedule_reminder_sends").select("status,error,body").eq("person_id", pid).eq("kind", "reply").order("created_at", { ascending: false }).limit(1)).data?.[0];
const ob0 = (await admin.from("sms_outbox").select("*", { count: "exact", head: true })).count;

console.log("bad signature:", await post("+12025550101", "1", "bad"));
console.log("no signature:", await post("+12025550101", "1", "none"));
console.log("HELP:", await post("+12025550109", "HELP"));
console.log("STOP:", await post("+12025550109", "STOP"));
console.log("START:", await post("+12025550109", "START"));

await hist(s.p.A1.id, s.occ.A1, 2);
for (const w of ["1", "2", "3", "YES", "maybe", "can't make it", "I'll be there"]) {
  const r = await post("+12025550101", w);
  console.log(`A only, "${w}":`, r, "| saved:", JSON.stringify(await rsvp(s.occ.A1, s.p.A1.id)), "| confirmation:", JSON.stringify(await lastReply(s.p.A1.id)));
}
await hist(s.p.B1.id, s.occ.B0, 5);
console.log(`A 2h ago + B 5h ago, "3":`, await post("+12025550101", "3"), "| saved:", JSON.stringify(await rsvp(s.occ.A1, s.p.A1.id)), "| confirmation:", JSON.stringify(await lastReply(s.p.A1.id)));
await admin.from("schedule_reminder_sends").update({ sent_at: new Date(Date.now() - 80 * H).toISOString() }).eq("person_id", s.p.B1.id);
console.log(`A 2h ago + B 80h ago, "3":`, await post("+12025550101", "3"), "| saved:", JSON.stringify(await rsvp(s.occ.A1, s.p.A1.id)));
await hist(s.p.B3.id, s.occ.B0, 2);
console.log(`B only, no upcoming date, "1":`, await post("+12025550103", "1"), "| saved:", JSON.stringify(await rsvp(s.occ.B0, s.p.B3.id)), "| confirmation:", JSON.stringify(await lastReply(s.p.B3.id)));
console.log(`event guest only, "YES":`, await post("+12025550104", "YES"));
await hist(s.p.A5.id, s.occ.A1, 2);
console.log(`event guest + schedule A texted (no event text on record), "1":`, await post("+12025550105", "1"), "| saved:", JSON.stringify(await rsvp(s.occ.A1, s.p.A5.id)));
console.log(`STOP first for a schedule person:`, await post("+12025550105", "STOP"), "| A5 answer unchanged:", JSON.stringify(await rsvp(s.occ.A1, s.p.A5.id)));
const ev = (await admin.from("events").select("data").eq("id", s.event).single()).data as any;
console.log("event guests:", JSON.stringify(ev.data.guests.map((g: any) => [g.name, g.status])));
const ob1 = (await admin.from("sms_outbox").select("*", { count: "exact", head: true })).count;
console.log("sms_outbox before/after:", ob0, ob1);
