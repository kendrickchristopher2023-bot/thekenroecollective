import { readFileSync } from "fs"; import { toJSONAsync } from "seroval"; import { load } from "./lib";
const S = JSON.parse(readFileSync("/tmp/cp2/sessions.json","utf8")); const st = load();
const id = (name: string) => Buffer.from(JSON.stringify({ file: "/src/lib/schedules.functions.ts?tss-serverfn-split", export: `${name}_createServerFn_handler` })).toString("base64url");
export async function call(who: string, name: string, data: any, method = "POST") {
  const u = `http://localhost:8080/_serverFn/${id(name)}`;
  const h: any = { authorization: `Bearer ${S[who].access_token}`, "content-type": "application/json", "x-tsr-serverFn": "true" };
  const pl = JSON.stringify(await toJSONAsync({ data }));
  const r = method === "GET" ? await fetch(`${u}?payload=${encodeURIComponent(pl)}`, { headers: h }) : await fetch(u, { method, headers: h, body: pl });
  const t = await r.text(); return { status: r.status, body: t.slice(0, 300) };
}
if (import.meta.main) console.log(await call("owner", "getSchedule", { id: st.A }, process.argv[2] ?? "POST"));
