import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listEvents from "./tools/list_events";
import getEvent from "./tools/get_event";
import whoami from "./tools/whoami";

// The OAuth issuer MUST be the direct Supabase host. On publish, SUPABASE_URL is
// rewritten to the .lovable.cloud proxy which mcp-js rejects (RFC 8414 issuer
// mismatch). VITE_SUPABASE_PROJECT_ID is inlined at build time by Vite and is
// the only value that survives publish unchanged.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "kenroe-collective-mcp",
  title: "The Kenroe Collective",
  version: "0.1.0",
  instructions:
    "Tools for The Kenroe Collective — an editorial event planning app. Use `whoami` to confirm the connection, `list_events` to see the signed-in user's gatherings, and `get_event` to fetch full details of a specific event.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoami, listEvents, getEvent],
});
