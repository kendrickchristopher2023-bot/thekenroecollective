import { createClient } from "@supabase/supabase-js"; import { writeFileSync } from "fs"; import { PW } from "./lib";
const out: any = {};
for (const t of ["owner","view","edit","removed","stranger"]) {
  const c = createClient(process.env.SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "", { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `cp2-${t}@example.com`, password: PW });
  if (error) throw error; out[t] = data.session;
}
writeFileSync("/tmp/cp2/sessions.json", JSON.stringify(out)); console.log("ok");
