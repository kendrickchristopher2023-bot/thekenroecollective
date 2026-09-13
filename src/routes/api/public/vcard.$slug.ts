/**
 * The saved contact file, /api/public/vcard/<person>.
 *
 * This is the whole point of the digital card: one tap and the person is in
 * somebody's phone with name, role, company, email and number already filled
 * in. It is also where the phone number lives when the page itself does not
 * show it, so a scraper reading the page finds nothing to sell on.
 *
 * Every download is counted as a save, which is the number that says whether
 * the card is doing any work.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/vcard/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const slug = String(params.slug ?? "").toLowerCase().replace(/\.vcf$/, "");
        const origin = new URL(request.url).origin;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("business_cards")
          .select("slug, full_name, role, organisation, email, phone, website, photo_url, show_phone_on_page, tagline, published")
          .eq("slug", slug)
          .eq("published", true)
          .maybeSingle();

        // An unfinished card has nothing worth saving to a phone.
        if (!data) return new Response("No card at that address.", { status: 404 });

        const { buildVCard, vCardFilename } = await import("@/lib/business-card");
        const card = data as never;
        const body = buildVCard(card, `${origin}/card/${slug}`);

        try {
          const { isLikelyBotUserAgent } = await import("@/lib/invite-opens");
          if (!isLikelyBotUserAgent(request.headers.get("user-agent"))) {
            await supabaseAdmin.rpc("record_card_scan", {
              _destination: `${origin}/card/${slug}`,
              _source: "digital-card",
              _card_slug: slug,
              _action: "save",
            });
          }
        } catch {
          /* counting must never stop somebody saving the contact */
        }

        return new Response(body, {
          headers: {
            // text/vcard is what iOS Contacts and Android Contacts both accept.
            "content-type": "text/vcard; charset=utf-8",
            "content-disposition": `attachment; filename="${vCardFilename(card)}"`,
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
