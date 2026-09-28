/**
 * The digital business card, one page per person at /card/<name>.
 *
 * A stranger who scans a printed card wants to know who they just met before
 * they want a product tour, so this page leads with the person and offers the
 * invitation demo as a secondary action.
 *
 * The phone number is deliberately absent from the visible page unless it is
 * switched on in the owner console: a number in plain text on a public page is
 * collected by scrapers and cannot be un-collected. It always travels inside
 * the saved contact file.
 */
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Check, Copy, Download, Mail, Phone, Share2, UserPlus } from "lucide-react";
import QRCode from "qrcode";

import { SiteFooter } from "@/components/site-nav";
import { GlobalErrorFallback } from "@/components/global-error-fallback";
import { getBusinessCard } from "@/lib/business-card.functions";
import { displayWebsite, formatPhone, initials, type BusinessCard } from "@/lib/business-card";
import { resolveShowcaseTarget, SHOWCASE_FALLBACK_EVENT_ID } from "@/lib/showcase.functions";

export const Route = createFileRoute("/card/$slug")({
  loader: async ({ params }) => {
    const [card, showcase] = await Promise.all([
      getBusinessCard({ data: { slug: params.slug } }),
      // The sample invitation heals itself when asked; if it still cannot be
      // confirmed, the button falls back to the reunion rather than a 404.
      resolveShowcaseTarget().catch(() => ({ eventId: SHOWCASE_FALLBACK_EVENT_ID, showcase: false })),
    ]);
    // Printed scan codes are permanent while card records are not, so an
    // unpublished or missing card must never be a dead end: send the person
    // to the homepage, the same way bare /card does.
    if (!card) throw redirect({ to: "/" });
    return { card, showcaseEventId: showcase.eventId };
  },
  head: ({ loaderData }) => {
    const card = loaderData?.card;
    const name = card ? `${card.full_name}, ${card.role}` : "Business card";
    const title = card ? `${name} — The Kenroe Collective` : "Business card — The Kenroe Collective";
    const description = card
      ? `${card.full_name}, ${card.role} at ${card.organisation}. Save the contact details straight to your phone.`
      : "Save the contact details straight to your phone.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary_large_image" },
        {
          property: "og:image",
          content: "https://thekenroecollective.com/brand/kenroe-logo-open-graph-1200x630.png",
        },
        {
          name: "twitter:image",
          content: "https://thekenroecollective.com/brand/kenroe-logo-open-graph-1200x630.png",
        },
      ],
    };
  },
  component: CardPage,
  errorComponent: GlobalErrorFallback,
  notFoundComponent: () => (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="font-serif text-2xl">This card is not currently available</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        The link may have been mistyped, or the card may have been switched off. Everything else is still here on the
        homepage.
      </p>
      <Link to="/" className="mt-6 inline-block rounded-full bg-primary px-5 py-3 text-sm text-primary-foreground">
        Go to the homepage
      </Link>
    </div>
  ),

});

/** Draws the card as a picture so it can be texted or dropped into a signature. */
function drawCardImage(
  card: BusinessCard,
  logo: HTMLImageElement | null,
  qr: HTMLImageElement | null,
): HTMLCanvasElement {
  const W = 1200;
  const H = 675;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FAF8F3";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#4E211E";
  ctx.fillRect(0, 0, 18, H);

  if (logo) {
    const w = 320;
    const h = (logo.height / logo.width) * w;
    ctx.drawImage(logo, 92, 78, w, h);
  }

  ctx.fillStyle = "#4E211E";
  ctx.font = "600 62px Georgia, serif";
  ctx.fillText(card.full_name, 92, 300);
  ctx.fillStyle = "#1A1A1A";
  ctx.font = "30px Helvetica, Arial, sans-serif";
  ctx.fillText(`${card.role}, ${card.organisation}`, 92, 350);

  ctx.font = "28px Helvetica, Arial, sans-serif";
  let y = 430;
  const lines = [card.email, formatPhone(card.phone), displayWebsite(card.website)].filter(Boolean) as string[];
  for (const line of lines) {
    ctx.fillText(line, 92, y);
    y += 46;
  }

  // The scan code travels with the picture, so a saved or texted card still
  // opens the live page for whoever receives it.
  if (qr) {
    const size = 240;
    const pad = 16;
    const x = W - size - pad * 2 - 60;
    const qy = 200;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x, qy, size + pad * 2, size + pad * 2);
    ctx.drawImage(qr, x + pad, qy + pad, size, size);
    ctx.fillStyle = "#4E211E";
    ctx.font = "22px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Scan to open this card", x + (size + pad * 2) / 2, qy + size + pad * 2 + 34);
    ctx.textAlign = "left";
  }
  return canvas;
}

function CardPage() {
  const { card, showcaseEventId } = Route.useLoaderData();
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [url, setUrl] = useState(`https://thekenroecollective.com/card/${card.slug}`);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const qrRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setUrl(window.location.href);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    const img = new Image();
    img.src = "/brand/kenroe-logo-horizontal-2400px-transparent.png";
    img.onload = () => {
      logoRef.current = img;
    };
    // The code always points at the canonical card address, matching the
    // printed codes, even when the page is reached through a shorter link.
    QRCode.toDataURL(`https://thekenroecollective.com/card/${card.slug}`, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M",
    }).then((dataUrl) => {
      setQrDataUrl(dataUrl);
      const qrImg = new Image();
      qrImg.src = dataUrl;
      qrImg.onload = () => {
        qrRef.current = qrImg;
      };
    }).catch(() => {});
  }, [card.slug]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the address is in the bar anyway */
    }
  }

  async function onShare() {
    try {
      await navigator.share({ title: `${card.full_name}, ${card.role}`, text: card.organisation, url });
    } catch {
      /* the person closed the share sheet */
    }
  }

  function onDownloadImage() {
    const canvas = drawCardImage(card, logoRef.current, qrRef.current);
    const link = document.createElement("a");
    link.download = `${card.slug}-card.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <>
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-xl px-4 pb-16 pt-12 sm:px-6">
          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="flex flex-col items-center gap-4 bg-[#FAF8F3] px-6 py-10 text-center">
              {card.photo_url ? (
                <img
                  src={card.photo_url}
                  alt={card.full_name}
                  className="h-28 w-28 rounded-full border-2 border-[#4E211E]/20 object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-[#4E211E]/20 bg-[#4E211E] font-serif text-3xl text-[#FAF8F3]"
                >
                  {initials(card.full_name)}
                </span>
              )}
              <div>
                <h1 className="font-serif text-3xl text-[#4E211E]">{card.full_name}</h1>
                <p className="mt-1 text-sm text-[#1A1A1A]">
                  {card.role}, {card.organisation}
                </p>
                {card.tagline ? <p className="mt-2 text-sm text-[#1A1A1A]/70">{card.tagline}</p> : null}
              </div>
              <img
                src="/brand/kenroe-logo-horizontal-2400px-transparent.png"
                alt="The Kenroe Collective"
                className="mt-2 h-8 w-auto"
              />
            </div>

            <div className="space-y-3 px-6 py-6">
              <a
                href={`/api/public/vcard/${card.slug}`}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-4 text-sm font-medium text-primary-foreground"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Save to contacts
              </a>
              <p className="text-center text-xs text-muted-foreground">
                Adds the name, role, company, email{card.phone ? " and phone number" : ""} to your phone in one tap.
              </p>

              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <a
                    href={`mailto:${card.email}`}
                    className="flex items-center gap-3 rounded-xl border border-border px-4 py-3"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{card.email}</span>
                  </a>
                </li>
                {card.show_phone_on_page && card.phone ? (
                  <li>
                    <a
                      href={`tel:${card.phone}`}
                      className="flex items-center gap-3 rounded-xl border border-border px-4 py-3"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span>{formatPhone(card.phone)}</span>
                    </a>
                  </li>
                ) : null}
                <li>
                  <a
                    href={card.website}
                    className="flex items-center gap-3 rounded-xl border border-border px-4 py-3"
                  >
                    <span className="w-4 shrink-0 text-center text-muted-foreground" aria-hidden="true">
                      @
                    </span>
                    <span className="truncate">{displayWebsite(card.website)}</span>
                  </a>
                </li>
              </ul>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button
                  onClick={onCopy}
                  className="flex items-center justify-center gap-2 rounded-full border border-border px-4 py-3 text-sm"
                >
                  {copied ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                  {copied ? "Link copied" : "Copy link"}
                </button>
                {canShare ? (
                  <button
                    onClick={onShare}
                    className="flex items-center justify-center gap-2 rounded-full border border-border px-4 py-3 text-sm"
                  >
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                    Share
                  </button>
                ) : null}
                <button
                  onClick={onDownloadImage}
                  className="flex items-center justify-center gap-2 rounded-full border border-border px-4 py-3 text-sm"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Save as picture
                </button>
              </div>

              {qrDataUrl ? (
                <div className="mt-6 flex flex-col items-center gap-2 border-t border-border pt-6">
                  <img
                    src={qrDataUrl}
                    alt={`Scan code that opens this card`}
                    width={112}
                    height={112}
                    className="h-28 w-28 rounded-lg bg-white p-2 ring-1 ring-border"
                  />
                  <p className="text-xs text-muted-foreground">
                    Point a camera here to open this card on another phone.
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-foreground">
              The Kenroe Collective builds invitations, guest lists and keepsakes for gatherings.
            </p>
            {/* Points at the purpose-built sample, never at a family's real
                event: that one holds hundreds of real guest records. */}
            <Link
              to="/invite/$eventId"
              params={{ eventId: showcaseEventId }}
              className="mt-4 inline-block rounded-full border border-primary px-5 py-3 text-sm font-medium text-primary"
            >
              See a real invitation
            </Link>
          </div>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
