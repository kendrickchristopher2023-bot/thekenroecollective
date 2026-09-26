import { call } from "./fn";
for (const w of ["owner","view","edit","removed","stranger"]) { const r = await call(w, "listMyContacts", {}, "GET"); console.log(w, r.status, (r.body.match(/[A-Z][a-z]+ Test|Owner Private Contact/g) ?? []).join(",") || "none"); }
