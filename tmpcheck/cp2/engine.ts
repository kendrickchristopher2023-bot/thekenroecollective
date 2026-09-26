import { admin, load } from "./lib";
import { runTick } from "@/lib/schedules-engine.server";
const s = load(); const O = s.users.owner;
const tick = async (iso: string) => { const r = await runTick(admin as any, { now: new Date(iso), dryRun: true, ownerUserId: O }); return { at: iso, claimed: r.claimed, skipped: r.skipped, notices: r.notices }; };
const sends = async () => (await admin.from("schedule_reminder_sends").select("person_id,channel,status,error,kind").eq("owner_user_id", O).order("created_at")).data!;
const notices = async () => (await admin.from("schedule_host_notices").select("kind,channel,status,error,to_address,body,bucket").eq("schedule_id", s.C).order("created_at")).data!;
const name = (pid: string) => Object.entries(s.p).find(([, v]: any) => v.id === pid)?.[0];

console.log("NUDGE tick", await tick("2027-02-05T21:31:00Z"));
console.log("NUDGE repeat", await tick("2027-02-05T21:36:00Z"));
for (const r of await sends()) console.log("  send", name(r.person_id), r.kind, r.channel, r.status, r.error);

console.log("SUMMARY tick 8:05 AM", await tick("2027-02-07T13:05:00Z"));
console.log("SUMMARY repeat 8:10", await tick("2027-02-07T13:10:00Z"));
await admin.from("schedule_rsvps").insert({ schedule_id: s.C, occurrence_id: s.occ.C1, person_id: s.p.C8.id, answer: "maybe", source: "link", answered_at: "2027-02-07T13:58:00Z" });
console.log("INSTANT after Hal answers", await tick("2027-02-07T14:00:00Z"));
await admin.from("schedule_rsvps").update({ answer: "maybe", answered_at: "2027-02-07T14:03:00Z" }).eq("occurrence_id", s.occ.C1).eq("person_id", s.p.C6.id);
await admin.from("schedule_rsvps").update({ answer: "yes", answered_at: "2027-02-07T14:04:00Z" }).eq("occurrence_id", s.occ.C1).eq("person_id", s.p.C7.id);
console.log("INSTANT 5 min later (batched, expect 0)", await tick("2027-02-07T14:05:00Z"));
console.log("INSTANT 10 min later (expect 0)", await tick("2027-02-07T14:10:00Z"));
console.log("INSTANT 16 min later (expect 2, both answers in one)", await tick("2027-02-07T14:16:00Z"));
console.log("INSTANT repeat (expect 0)", await tick("2027-02-07T14:21:00Z"));
for (const n of await notices()) console.log("  notice", n.kind, n.channel, n.status, n.error ?? "", n.to_address, "|", n.body);
