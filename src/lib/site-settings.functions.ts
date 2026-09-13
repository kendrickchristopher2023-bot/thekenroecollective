import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FALLBACK_EMAIL = "support@thekenroecollective.com";

export const getSiteSettings = createServerFn({ method: "GET" }).handler(async () => {
  // contact_email is no longer readable by anon/authenticated through the Data
  // API (it was harvestable by anyone). Read it server-side with the trusted
  // client and return only the single safe field.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("site_settings").select("contact_email").eq("id", true).maybeSingle();
  return { contact_email: data?.contact_email ?? FALLBACK_EMAIL };
});

const Input = z.object({ contact_email: z.string().email().max(200) });

export const updateSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(Input, i, "site-settings.functions.ts:20"))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase
      .from("site_settings")
      .upsert({ id: true, contact_email: data.contact_email, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true, contact_email: data.contact_email };
  });
