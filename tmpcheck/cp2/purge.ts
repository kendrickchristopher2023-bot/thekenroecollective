import { admin } from "./lib";
const { data } = await admin.from("sms_outbox").select("id,to_phone,status,created_at").like("to_phone", "%202555010%");
console.log(JSON.stringify(data));
const { error } = await admin.from("sms_outbox").delete().like("to_phone", "%202555010%");
console.log("deleted", error ?? "ok", (await admin.from("sms_outbox").select("*",{count:"exact",head:true})).count);
