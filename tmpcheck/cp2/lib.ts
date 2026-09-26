import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "fs";
export const URL_ = process.env.SUPABASE_URL!;
export const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
export const REUNION = "3e9d32bc-f47f-4b78-9fb4-7e08e54f6e5f";
export const PW = "Cp2-Test-Only-9f3k!";
export const STATE = "/tmp/cp2/state.json";
export const load = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {});
export const save = (s: any) => writeFileSync(STATE, JSON.stringify(s, null, 2));
export async function snapshot() {
  const c = async (t: string, f?: (q: any) => any) => { let q: any = admin.from(t).select("*", { count: "exact", head: true }); if (f) q = f(q); const { count, error } = await q; if (error) throw error; return count; };
  const { data: r } = await admin.from("schedules").select("id,title,status,welcome_enabled,welcome_at,welcome_channel,host_name,host_phone,host_email,summary_channel,instant_channel,updated_at").eq("id", REUNION).single();
  return {
    sms_outbox: await c("sms_outbox"),
    reunion: r,
    reunion_people_active: await c("schedule_people", (q) => q.eq("schedule_id", REUNION).is("removed_at", null)),
    reunion_rsvps: await c("schedule_rsvps", (q) => q.eq("schedule_id", REUNION)),
    reunion_sends: await (async () => { const { data } = await admin.from("schedule_occurrences").select("id").eq("schedule_id", REUNION); return c("schedule_reminder_sends", (q) => q.in("occurrence_id", (data ?? []).map((o: any) => o.id))); })(),
    reunion_notices: await c("schedule_host_notices", (q) => q.eq("schedule_id", REUNION)),
  };
}
