// Owner Command Center, Phase 2: compact "recent issues" list for the AI.
//
// READ ONLY. Returns small, already-aggregated strings, never raw table rows,
// so the AI prompt stays cheap. When a venture is selected, only signals that
// clearly belong to it are included.
import { withoutAccounts } from "@/lib/owner-account-filter";
import {
  VENTURE_EMAIL_PREFIXES,
  VENTURE_ROUTE_PREFIXES,
  type VentureId,
} from "@/lib/owner-ventures";

export type IssueLine = { area: string; detail: string; count: number };


function top(map: Map<string, number>, limit: number): Array<[string, number]> {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function short(text: string | null | undefined, max = 120): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "no detail recorded";
  return t.length > max ? `${t.slice(0, max)}...` : t;
}

/** Grouped, capped issue signals for the window. Nothing here identifies a customer. */
export async function loadRecentIssues(
  since: string,
  until: string,
  venture: VentureId = "all",
): Promise<IssueLine[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const out: IssueLine[] = [];
  const all = venture === "all";
  const routePrefixes = (VENTURE_ROUTE_PREFIXES as any)[venture] as string[] | undefined;
  const templatePrefixes = (VENTURE_EMAIL_PREFIXES as any)[venture] as string[] | undefined;
  const matches = (value: string | null | undefined, prefixes: string[] | undefined) => {
    if (all) return true;
    if (!prefixes || prefixes.length === 0) return false;
    const v = String(value ?? "").toLowerCase();
    return prefixes.some((p) => v.startsWith(p.toLowerCase()));
  };


  // Demo and sample-account activity is not a customer problem, so it is left
  // out of every signal that records which account it came from.
  const { getDemoUserIds } = await import("@/lib/demo-accounts.server");
  const systemIds = await getDemoUserIds().catch(() => [] as string[]);
  const notSystem = (q: any, col: string) => withoutAccounts(q, col, systemIds);

  const [errors, bounces, smsFails, unpaid] = await Promise.all([
    notSystem(
      supabaseAdmin
        .from("app_error_logs")
        .select("error_name,message,route")
        .gte("created_at", since)
        .lt("created_at", until)
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(300),
      "user_id",
    ),
    supabaseAdmin
      .from("email_send_log")
      .select("template_name,error_message")
      .gte("created_at", since)
      .lt("created_at", until)
      .eq("status", "bounced")
      .limit(300),
    notSystem(
      supabaseAdmin
        .from("sms_outbox")
        .select("error")
        .gte("created_at", since)
        .lt("created_at", until)
        .eq("status", "failed")
        .limit(300),
      "user_id",
    ),
    notSystem(
      supabaseAdmin
        .from("ecards")
        .select("id,created_at")
        .gte("created_at", since)
        .lt("created_at", until)
        .is("paid_at", null)
        .limit(500),
      "organizer_user_id",
    ),
  ]);

  const errorMap = new Map<string, number>();
  for (const r of errors.data ?? []) {
    if (!matches(r.route, routePrefixes)) continue;
    const key = `${r.error_name || "Error"} on ${r.route || "unknown page"}: ${short(r.message, 90)}`;
    errorMap.set(key, (errorMap.get(key) ?? 0) + 1);
  }
  for (const [detail, count] of top(errorMap, 5)) {
    out.push({ area: "Errors", detail, count });
  }

  const bounceMap = new Map<string, number>();
  for (const r of bounces.data ?? []) {
    if (!matches(r.template_name, templatePrefixes)) continue;
    const key = `${r.template_name || "email"}: ${short(r.error_message, 70)}`;
    bounceMap.set(key, (bounceMap.get(key) ?? 0) + 1);
  }
  for (const [detail, count] of top(bounceMap, 4)) {
    out.push({ area: "Email bounces", detail, count });
  }

  const smsMap = new Map<string, number>();
  for (const r of all || venture === "events" ? (smsFails.data ?? []) : []) {
    const key = short(r.error, 80);
    smsMap.set(key, (smsMap.get(key) ?? 0) + 1);
  }
  for (const [detail, count] of top(smsMap, 4)) {
    out.push({ area: "Text failures", detail, count });
  }

  const stuckCutoff = Date.now() - 3 * 86400000;
  const stuckIds = (all || venture === "ecards" ? (unpaid.data ?? []) : [])
    .filter((r: any) => new Date(r.created_at).getTime() < stuckCutoff)
    .map((r: any) => r.id as string);

  if (stuckIds.length) {
    let withMessages = 0;
    // Chunked count of unpaid cards that already collected at least one message.
    for (let i = 0; i < stuckIds.length; i += 100) {
      const chunk = stuckIds.slice(i, i + 100);
      const { data } = await supabaseAdmin
        .from("ecard_contributions")
        .select("ecard_id")
        .in("ecard_id", chunk)
        .limit(2000);
      withMessages += new Set((data ?? []).map((r) => r.ecard_id)).size;
    }
    if (withMessages) {
      out.push({
        area: "Stuck eCards",
        detail: "cards older than 3 days that collected messages but were never sent",
        count: withMessages,
      });
    }
  }

  return out;
}
