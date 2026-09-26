import { createClient } from "@supabase/supabase-js";
import { materializeSchedule } from "@/lib/schedules-engine.server";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const mode = process.argv[2];
if (mode === "clean") {
  const uid = (await Bun.file("/tmp/browser/welcome/uid.txt").text()).trim();
  await admin.from("schedules").delete().eq("owner_user_id", uid);
  await admin.from("contacts").delete().eq("owner_user_id", uid);
  await admin.from("subscriptions").delete().eq("user_id", uid);
  await admin.auth.admin.deleteUser(uid);
  console.log("cleaned");
} else {
  const email = `welcome-ui-${Date.now()}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({ email, password: "Test-pass-12345!", email_confirm: true });
  const uid = u.user!.id;
  await admin.from("subscriptions").insert({ user_id: uid, product_id: "manual_atelier_test", price_id: "atelier_monthly", status: "active", stripe_subscription_id: `manual_test_${Date.now()}`, stripe_customer_id: "manual_test", environment: "sandbox" });
  const { data: s } = await admin.from("schedules").insert({ owner_user_id: uid, title: "Example Family Monthly Call", kind: "call", start_local: "2026-11-01T16:30", timezone: "America/New_York", duration_minutes: 60, rrule: "FREQ=MONTHLY;BYDAY=1SU", ends_kind: "never", join_url: "https://example.com/join" }).select("id").single();
  const steps = [
    { offset_minutes: -10080, channel: "email", subject: "Next week: {title}", body: "Hi {first_name}, {title} is {when}.", is_starting_now: false, position: 0 },
    { offset_minutes: -1440, channel: "sms", body: "Hi {first_name}, {title} is tomorrow.", is_starting_now: false, position: 1 },
    { offset_minutes: -60, channel: "sms", body: "{title} in 1 hour.", is_starting_now: false, position: 2 },
    { offset_minutes: 0, channel: "sms", body: "{title} starting now.", is_starting_now: true, position: 3 },
  ].map((x) => ({ ...x, schedule_id: s!.id, active: true }));
  await admin.from("schedule_reminder_steps").insert(steps);
  for (const [i, n] of ["Ann Example", "Bo Example"].entries()) {
    const { data: c } = await admin.from("contacts").insert({ owner_user_id: uid, display_name: n, phone: `+120255501${11 + i}`, email: `p${i}@example.com`, source: "schedules" }).select("id").single();
    await admin.from("schedule_people").insert({ schedule_id: s!.id, contact_id: c!.id, channel: "both", sms_consent_by: uid, sms_consent_at: new Date().toISOString() });
  }
  await materializeSchedule(admin as any, s!.id);
  const anon = createClient(process.env.SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: sess } = await anon.auth.signInWithPassword({ email, password: "Test-pass-12345!" });
  await Bun.write("/tmp/browser/welcome/session.json", JSON.stringify(sess.session));
  await Bun.write("/tmp/browser/welcome/uid.txt", uid);
  await Bun.write("/tmp/browser/welcome/sid.txt", s!.id);
  console.log("ok");
}
