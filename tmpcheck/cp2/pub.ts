import { admin, REUNION } from "./lib";
import { findEventCandidate } from "@/lib/sms-rsvp.server";
const { data } = await admin.from("schedule_people").select("contact:contacts(phone)").eq("schedule_id", REUNION).is("removed_at", null);
let withPhone = 0, eventMatch: string[] = [];
for (const p of data ?? []) { const ph = (p as any).contact?.phone; if (!ph) continue; withPhone++; const c = await findEventCandidate(admin as any, ph); if (c) eventMatch.push(c.title); }
console.log({ people: data?.length, withPhone, onUpcomingEventGuestList: eventMatch.length, events: [...new Set(eventMatch)] });
