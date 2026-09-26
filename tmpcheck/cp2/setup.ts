import { createHash } from "crypto";
import { admin, PW, save, snapshot } from "./lib";

const s: any = { before: await snapshot() };
console.log("BEFORE", JSON.stringify(s.before));
const mk = async (tag: string) => {
  const { data, error } = await admin.auth.admin.createUser({ email: `cp2-${tag}@example.com`, password: PW, email_confirm: true, user_metadata: { display_name: `CP2 ${tag}` } });
  if (error) throw error;
  return data.user!.id;
};
s.users = {};
for (const t of ["owner", "view", "edit", "removed", "stranger"]) s.users[t] = await mk(t);
const O = s.users.owner;
await new Promise((r) => setTimeout(r, 1500));
await admin.from("profiles").update({ tier: "host", display_name: "CP2 Owner" }).eq("id", O);

const sched = async (title: string, extra: any) => {
  const { data, error } = await admin.from("schedules").insert({ owner_user_id: O, title, start_local: "2027-01-03T16:30:00", timezone: "America/New_York", status: "active", ...extra }).select("id").single();
  if (error) throw error; return data!.id;
};
s.A = await sched("CP2 Reply Test A", { is_demo: true });
s.B = await sched("CP2 Reply Test B", { is_demo: true });
s.C = await sched("CP2 Engine Test C", { summary_channel: "both", instant_channel: "both", host_email: "cp2-host@example.com", host_phone: "+12025550199", host_name: "CP2 Host" });
s.X = await sched("CP2 Owner Private X", { is_demo: true });

const occ = async (sid: string, iso: string) => {
  const d = new Date(iso); const local = new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 19);
  const { data, error } = await admin.from("schedule_occurrences").insert({ schedule_id: sid, starts_at: d.toISOString(), ends_at: new Date(d.getTime() + 3600_000).toISOString(), occurrence_local: local, start_local: local, status: "scheduled" }).select("id").single();
  if (error) throw error; return data!.id;
};
s.occ = { A1: await occ(s.A, "2027-01-03T21:30:00Z"), B0: await occ(s.B, "2026-09-01T20:30:00Z"), C1: await occ(s.C, "2027-02-07T21:30:00Z"), C0: await occ(s.C, "2026-06-07T20:30:00Z"), C00: await occ(s.C, "2026-07-05T20:30:00Z"), C000: await occ(s.C, "2026-08-02T20:30:00Z"), X1: await occ(s.X, "2027-01-04T21:30:00Z") };

const contact = async (n: number, name: string) => {
  const { data, error } = await admin.from("contacts").insert({ owner_user_id: O, display_name: name, phone: `+1202555010${n}`, email: `cp2-p${n}@example.com` }).select("id").single();
  if (error) throw error; return data!.id;
};
s.contacts = {}; for (const [n, nm] of [[1, "Ann Test"], [3, "Cy Test"], [5, "Eve Test"], [6, "Fay Test"], [7, "Gus Test"], [8, "Hal Test"]] as const) s.contacts[n] = await contact(n, nm);
s.contacts.secret = (await admin.from("contacts").insert({ owner_user_id: O, display_name: "Owner Private Contact", email: "cp2-private@example.com" }).select("id").single()).data!.id;
const person = async (sid: string, cid: string, created?: string) => {
  const { data, error } = await admin.from("schedule_people").insert({ schedule_id: sid, contact_id: cid, channel: "both", sms_consent_at: new Date().toISOString(), sms_consent_by: O, first_sms_sent_at: new Date().toISOString(), ...(created ? { created_at: created } : {}) }).select("id,rsvp_token").single();
  if (error) throw error; return data!;
};
s.p = {
  A1: await person(s.A, s.contacts[1]), B1: await person(s.B, s.contacts[1]), B3: await person(s.B, s.contacts[3]), A5: await person(s.A, s.contacts[5]),
  C6: await person(s.C, s.contacts[6], "2026-01-01T00:00:00Z"), C7: await person(s.C, s.contacts[7], "2026-01-01T00:00:00Z"), C8: await person(s.C, s.contacts[8], "2026-07-20T00:00:00Z"),
  X1: await person(s.X, s.contacts[1]),
};
// Steps on C: a nudge 2 days before (no answer only) and a plain email the day before.
await admin.from("schedule_reminder_steps").insert([
  { schedule_id: s.C, offset_minutes: -2880, channel: "sms", body: "Hi {first_name}, are you joining {title}? Reply 1, 2 or 3.", audience: "no_answer", position: 0 },
  { schedule_id: s.C, offset_minutes: -1440, channel: "email", subject: "Reminder: {title}", body: "See you tomorrow", audience: "all", position: 1 },
]);
// Answers on C: Fay yes, Gus no, Hal none. Past-date history: Fay answered the June date only.
await admin.from("schedule_rsvps").insert([
  { schedule_id: s.C, occurrence_id: s.occ.C1, person_id: s.p.C6.id, answer: "yes", source: "link", answered_at: "2027-02-01T12:00:00Z" },
  { schedule_id: s.C, occurrence_id: s.occ.C1, person_id: s.p.C7.id, answer: "no", source: "link", answered_at: "2027-02-01T12:00:00Z" },
  { schedule_id: s.C, occurrence_id: s.occ.C0, person_id: s.p.C6.id, answer: "yes", source: "link", answered_at: "2026-06-06T12:00:00Z" },
]);
// Event where Eve (0105) and Dan (0104) are guests.
s.event = `cp2test${Date.now().toString(36)}`;
{ const { error } = await admin.from("events").insert({ id: s.event, user_id: O, data: { title: "CP2 Test Party", date: "2027-01-20T18:00", timezone: "America/New_York", guests: [{ id: "g4", name: "Dan Test", phone: "+12025550104", status: "pending" }, { id: "g5", name: "Eve Test", phone: "+12025550105", status: "pending" }] } }); if (error) throw error; }

// Co-host invites with known tokens.
s.tokens = {};
for (const r of ["view", "edit", "removed"]) {
  const token = `cp2tok-${r}-${crypto.randomUUID()}`;
  s.tokens[r] = token;
  const { error } = await admin.from("schedule_members").insert({ schedule_id: s.A, owner_user_id: O, invited_by: O, invited_email: `cp2-${r}@example.com`, role: r === "edit" ? "edit" : "view", token_hash: createHash("sha256").update(token).digest("hex") });
  if (error) throw error;
}
save(s);
console.log(JSON.stringify({ users: s.users, A: s.A, B: s.B, C: s.C, X: s.X }, null, 1));
