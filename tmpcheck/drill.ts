import { createClient } from "@supabase/supabase-js";
import { gunzipSync } from "zlib";
const t0 = Date.now();
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: folders } = await db.storage.from("db-backups").list("", { limit: 500 });
const dates = (folders ?? []).map(f => f.name).filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort();
const prefix = dates[dates.length - 1];
const { data: blob, error } = await db.storage.from("db-backups").download(`${prefix}/events.json.gz`);
if (error || !blob) throw new Error("download failed: " + error?.message);
const json = JSON.parse(gunzipSync(Buffer.from(await blob.arrayBuffer())).toString("utf8"));
console.log("export folder:", prefix, "exported_at:", json.exported_at, "rows in file:", json.rows.length);

await db.from("restore_drill_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
const { error: insErr } = await db.from("restore_drill_events").insert(json.rows);
if (insErr) throw new Error("restore insert failed: " + insErr.message);

const { data: restored } = await db.from("restore_drill_events").select("*");
const { data: live } = await db.from("events").select("*");
const norm = (r: any) => JSON.stringify(Object.keys(r).sort().map(k => [k, r[k]]));
const rm = new Map((restored ?? []).map((r: any) => [r.id, norm(r)]));
const lm = new Map((live ?? []).map((r: any) => [r.id, norm(r)]));
let same = 0; const diff: string[] = []; const onlyLive: string[] = []; const onlyBackup: string[] = [];
for (const [id, v] of lm) { if (!rm.has(id)) onlyLive.push(id); else if (rm.get(id) === v) same++; else diff.push(id); }
for (const id of rm.keys()) if (!lm.has(id)) onlyBackup.push(id);
console.log(JSON.stringify({ restored_rows: restored?.length, live_rows: live?.length, identical: same, differing: diff, only_in_live: onlyLive, only_in_backup: onlyBackup, seconds: ((Date.now()-t0)/1000).toFixed(1) }, null, 2));
