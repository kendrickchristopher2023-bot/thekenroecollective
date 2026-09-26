import { admin, load } from "./lib"; const s = load();
console.log((await admin.from("schedules").select("title,is_demo").eq("owner_user_id", s.users.owner)).data);
console.log((await admin.from("schedule_reminder_sends").select("status,sms_outbox_id").eq("kind","reply").eq("owner_user_id", s.users.owner)).data?.length);
