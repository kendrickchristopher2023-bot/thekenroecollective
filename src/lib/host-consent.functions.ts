import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { HOST_GUEST_CONSENT_TEXT } from "@/lib/host-consent";

type LogInput = {
  eventId?: string | null;
  source: "manual" | "import" | "contacts_picker";
  guestCount?: number;
};

export const logHostGuestConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: LogInput) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("host_data_consent_log").insert({
      host_user_id: userId,
      event_id: data.eventId ?? null,
      consent_text: HOST_GUEST_CONSENT_TEXT,
      source: data.source,
      guest_count: data.guestCount ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
