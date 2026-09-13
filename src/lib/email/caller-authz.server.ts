import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Authorization helpers for the one email path a signed-in host can trigger
 * from the browser. Server-only — never trust the client's claim about who it
 * may email.
 */

/** True when `recipient` is on the guest list of an event owned by `userId`. */
export async function ownsRecipient(
  supabase: SupabaseClient<any, any>,
  userId: string,
  recipient: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("events")
    .select("data")
    .eq("user_id", userId)
    .limit(500);

  if (error || !data) return false;
  for (const row of data as Array<{ data: any }>) {
    const guests = Array.isArray(row?.data?.guests) ? row.data.guests : [];
    for (const g of guests) {
      const em = typeof g?.email === "string" ? g.email.trim().toLowerCase() : "";
      if (em && em === recipient) return true;
    }
  }
  return false;
}

/** Owner/admin staff accounts may send to arbitrary addresses (test sends). */
export async function isStaff(
  supabase: SupabaseClient<any, any>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["owner", "super_admin"])
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

/**
 * Only allow URLs inside rendered emails when they point at our own site or a
 * known media host. Prevents a caller from turning a trusted-domain email into
 * a phishing vector.
 */
export function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    const supabaseHost = (() => {
      try {
        return new URL(process.env.SUPABASE_URL as string).hostname.toLowerCase();
      } catch {
        return "";
      }
    })();
    const allowed = [
      "thekenroecollective.com",
      "kenroecollective.com",
      "kenroes.com",
      "lovable.app",
      "giphy.com",
      "supabase.co",
    ];
    if (supabaseHost && host === supabaseHost) return true;
    return allowed.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
