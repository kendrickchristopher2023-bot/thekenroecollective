import { call } from "./fn"; const r = await call("view", "listMyContacts", {}, "GET"); console.log(r.body.slice(0,1500));
