/**
 * /card — the one short address printed on the business card QR code.
 *
 * The printed code can never change, so this route does three things:
 *  1. reads its destination from site settings, so an owner can repoint it,
 *  2. appends the tracking parameters here rather than in the printed URL, so
 *     the QR code stays sparse and reliable at business-card size,
 *  3. records the scan (real browsers only) so the owner console can say
 *     whether the cards were worth printing.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  DEFAULT_CARD_CAMPAIGN,
  DEFAULT_CARD_DESTINATION,
  buildCardRedirectUrl,
  isAllowedCardDestination,
} from "@/lib/card-link";

export const Route = createFileRoute("/card")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        let destination = DEFAULT_CARD_DESTINATION;
        let campaign = DEFAULT_CARD_CAMPAIGN;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("site_settings")
            .select("card_destination, card_campaign")
            .eq("id", true)
            .maybeSingle();
          const stored = (data as { card_destination?: string | null } | null)?.card_destination ?? "";
          if (stored && isAllowedCardDestination(stored)) destination = stored;
          const storedCampaign = (data as { card_campaign?: string | null } | null)?.card_campaign ?? "";
          if (storedCampaign) campaign = storedCampaign;
        } catch {
          /* settings unreadable: fall back to the default destination, never a dead card */
        }

        // If the destination is a personal card that has not been switched on
        // yet, send people to the homepage rather than a "not ready" page.
        const personal = /^\/card\/([a-z0-9-]{2,40})$/i.exec(destination.trim());
        if (personal) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: card } = await supabaseAdmin
              .from("business_cards")
              .select("slug")
              .eq("slug", personal[1]!.toLowerCase())
              .eq("published", true)
              .maybeSingle();
            if (!card) destination = "/";
          } catch {
            destination = "/";
          }
        }

        const target = buildCardRedirectUrl(destination, origin, campaign);

        // Count only plausible phone/desktop browsers. Link unfurlers and
        // crawlers hit this URL with no person involved.
        try {
          const { isLikelyBotUserAgent } = await import("@/lib/invite-opens");
          if (!isLikelyBotUserAgent(request.headers.get("user-agent"))) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.rpc("record_card_scan", { _destination: target, _source: campaign });
          }
        } catch {
          /* tracking must never break the redirect */
        }

        return new Response(null, {
          status: 302,
          headers: { location: target, "cache-control": "no-store" },
        });
      },
    },
  },
});
