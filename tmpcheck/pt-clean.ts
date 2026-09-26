import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const c = JSON.parse(readFileSync("/tmp/pt/ctx.json", "utf8"));
for (const u of [c.A, c.B]) {
  const { data: ss } = await admin.from("schedules").select("id").eq("owner_user_id", u.id);
  for (const s of ss ?? []) await admin.from("schedules").delete().eq("id", s.id);
  const { data: cs } = await admin.from("contacts").select("phone").eq("owner_user_id", u.id);
  const phones = (cs ?? []).map((x: any) => x.phone).filter(Boolean);
  await admin.from("contacts").delete().eq("owner_user_id", u.id);
  if (phones.length) await admin.from("sms_consent_log").delete().in("phone_number", phones);
  await admin.auth.admin.deleteUser(u.id);
}
await admin.from("sms_consent_log").delete().like("phone_number", "%20255501%");
console.log("cleaned");
