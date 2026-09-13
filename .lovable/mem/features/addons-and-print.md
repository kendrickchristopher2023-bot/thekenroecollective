---
name: Add-ons and Print/Mail
description: Catalog of paid add-ons (PM, branding removal per event, custom domain, print & mail) with Stripe price IDs and tier eligibility
type: feature
---
# Add-ons

All add-ons are real Stripe products created in sandbox (auto-sync to live on publish). Use the price IDs below with `openCheckout({ priceId })`.

| Add-on | Price ID | Amount | Cadence | Tier eligibility |
|---|---|---|---|---|
| Project Management | `pm_addon_monthly` / `pm_addon_yearly` | $5/mo or $48/yr | recurring | All tiers — event integration requires Host or Atelier |
| Remove Kenroe's Branding (per event) | `branding_removal_per_event` | $3 | one-time, per event | Postcard & free trials only (Whisper/Host/Atelier already watermark-free) |
| Bulk Guest List Import | `guest_import_addon` | $5 | one-time account unlock | Host add-on; included in Atelier |
| Thank-you Cards Studio | `thank_you_cards_addon` | $7 | one-time account unlock | Host add-on; included in Atelier |
| Branded Subdomain | `custom_domain_monthly` | $4/mo | recurring | All tiers |
| Media Converter unlock | `converter_addon` | $5 | one-time, per account | All tiers (included in Atelier) |
| Photo Wall live gallery (per event) | `event_photo_wall` | $9 | one-time, per event | Postcard/Whisper (Host & Atelier include it) |
| Co-host editor seat (per event) | `event_cohost_seat` | $4 per seat | one-time, repeatable per event | All tiers |
| Print & Mail Invitations | `print_invitation_piece` | $2.50/piece + postage | pay-as-you-go, quantity 1–500 | All tiers |

## Branding removal (per event)
- Stored in `public.event_addons` keyed by `event_id` + `addon_key = 'branding_removal'`.
- Checkout passes `metadata.eventId` so the webhook can insert the row.
- The "Made with Kenroe's Collective" watermark (`src/components/kenroes-watermark.tsx`) renders on `/invite/$eventId` and `/p/$token` for Postcard tier and Atelier free trials.
- Server fns `getEventBrandingState` / `getPackageBrandingState` in `src/lib/branding.functions.ts` decide visibility based on owner's paid non-trial subscription (Whisper/Host/Atelier) OR the per-event branding-removal add-on.

## Print & Mail
- Free path: PDF export from `/invite/$eventId` (5×7 bleed, CMYK).
- Paid path: managed print-and-mail via Lob — scaffold under `/events/$eventId/print` and `LOB_API_KEY` secret. Phase 1 ships PDF export only with "Coming soon" for managed print.

## Locked-step UX
Use `<LockedStep requiredTier="..." feature="..." />` from `src/components/locked-step.tsx`. Editorial copy + explicit Upgrade button per memory rules. NEVER use `<a href>` inside it — always TanStack `<Link>`.
