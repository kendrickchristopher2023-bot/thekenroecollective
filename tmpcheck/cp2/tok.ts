import { createHash, randomBytes } from "crypto"; import { admin, load, save } from "./lib";
const s = load();
for (const r of ["view","edit","removed"]) { const t = randomBytes(24).toString("hex"); const { error } = await admin.from("schedule_members").update({ token_hash: createHash("sha256").update(t).digest("hex") }).eq("schedule_id", s.A).eq("invited_email", `cp2-${r}@example.com`); if (error) throw error; s.tokens[r] = t; }
save(s); console.log("ok");
