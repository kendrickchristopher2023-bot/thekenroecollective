import { createClient } from "@supabase/supabase-js"; import { readFileSync } from "fs"; import { randomUUID } from "crypto";
import { admin, load } from "./lib"; import { call } from "./fn";
const S = JSON.parse(readFileSync("/tmp/cp2/sessions.json","utf8")); const st = load();
const { data: mem } = await admin.from("schedule_members").select("id").eq("schedule_id", st.A).eq("invited_email", "cp2-removed@example.com").single();
console.log("owner revokes removed:", (await call("owner", "revokeCohost", { id: st.A, memberId: mem!.id })).status);
const short = (r: any) => r.status === 200 && !r.body.includes('"error":{"t":') && !r.body.includes("$TSR/Error") ? "ALLOWED" : `refused(${(r.body.match(/"s":"([^"]{0,70})/)?.[1]) ?? r.status})`;
const sn = { scheduleId: st.A, occurrenceId: st.occ.A1, channel: "sms", personIds: [], includeDeclined: false };
for (const who of ["owner","view","edit","removed","stranger"]) {
  const out: Record<string,string> = {};
  const ls = await call(who, "listSchedules", {}, "GET"); out.listTitles = (ls.body.match(/CP2 [A-Za-z ]+/g) ?? []).join(",") || "(none)";
  out.getA = short(await call(who, "getSchedule", { id: st.A }, "GET"));
  out.getOwnersOtherX = short(await call(who, "getSchedule", { id: st.X }, "GET"));
  out.getC = short(await call(who, "getSchedule", { id: st.C }, "GET"));
  out.reportCSV_A = short(await call(who, "getAttendanceReport", { id: st.A, occurrenceId: null }));
  out.reportX = short(await call(who, "getAttendanceReport", { id: st.X, occurrenceId: null }));
  out.historyA = short(await call(who, "getAttendanceHistory", { id: st.A }));
  out.previewSendNowA = short(await call(who, "previewSendNow", sn));
  out.sendNowA_noRecipients = short(await call(who, "sendNow", { ...sn, requestId: randomUUID(), subject: "x", emailBody: "x", smsBody: "x" }));
  out.saveStepsA = short(await call(who, "saveSteps", { id: st.A, steps: [] }));
  out.listCohostsA = short(await call(who, "listCohosts", { id: st.A }));
  const lc = await call(who, "listMyContacts", {}, "GET"); out.ownerContactsVisible = String((lc.body.match(/cp2-p\d|Owner Private Contact/g) ?? []).length);
  const u = createClient(process.env.SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, { global: { headers: { Authorization: `Bearer ${S[who].access_token}` } }, auth: { persistSession: false } });
  const [sc, co, pe, rs] = await Promise.all([u.from("schedules").select("title").eq("owner_user_id", st.users.owner), u.from("contacts").select("display_name").eq("owner_user_id", st.users.owner), u.from("schedule_people").select("id,schedule_id").in("schedule_id", [st.A, st.X, st.C]), u.from("schedule_rsvps").select("id").in("schedule_id", [st.A, st.C])]);
  out.db_schedules = (sc.data ?? []).map((r: any) => r.title.replace("CP2 ","")).join(",") || "0";
  out.db_contacts = String(co.data?.length ?? 0); out.db_people = String(pe.data?.length ?? 0); out.db_rsvps = String(rs.data?.length ?? 0);
  console.log(who, JSON.stringify(out));
}
