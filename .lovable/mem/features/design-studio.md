---
name: Design Studio
description: Canva-like template-driven designer for menus, packages, apparel, signage, favors, thank-you cards. AI copy rewrite, image uploads, PDF/PNG export, public share links. Gated by has_ai_packages_access (Atelier / 1-day trial / $14 add-on).
type: feature
---
# Design Studio

Route: `/design`. Public share: `/d/$token`.

## Access
Reuses `has_ai_packages_access(_user_id, _event_id?, _project_id?)` — Atelier tier, 1-day trial (`scope=trial_24h`), `$14` event add-on, account-monthly add-on, or owner. Same upsell panel as `/packages`.

## Data
Table: `public.design_assets` (user_id, event_id, kind, template_id, title, content jsonb, thumbnail_url, share_token).
- Owner full CRUD; anon SELECT when `share_token IS NOT NULL`.
- Storage: shares the existing `atelier-media` public bucket under `designs/{userId}/...`.

## Templates
`src/lib/design-templates.ts` is the source of truth. Each template declares: kind, canvas size, palette, font pair, editable fields, and optional `pages: string[]` for multi-page designs. Adding a new template = add an entry there + a renderer branch in `src/lib/design-render.tsx`. Multi-page examples: `menu_book` (cover + inside), `apparel_event` (front + back).

## Renderer
SVG-based (`DesignSvg({ template, content, page })`) — single component renders editor preview, public share, and the source for exports. The Studio renders ALL pages into an offscreen container so PDF export iterates them. Exports:
- `exportSvgElementsToPdf` — one PDF page per design page.
- `exportSvgElementsToPrintPdf` — adds 9pt (0.125") bleed + corner crop marks for print shops.
- `exportSvgElementToPng` — single visible page only.

## Server functions (`src/lib/design-studio.functions.ts`)
- `hasDesignStudioAccess` — wraps the `has_ai_packages_access` RPC.
- `listDesigns` / `getDesign` / `saveDesign` / `deleteDesign` — owner-scoped CRUD (RLS enforced).
- `createDesignShare` / `revokeDesignShare` — rotate `share_token`.
- `getPublicDesign` — anon-safe via server publishable client, reads only shared rows.
- `aiRewriteCopy` — Lovable AI Gateway, Gemini 2.5 Flash, short on-brand rewrite.
- `listBrandKits` / `saveBrandKit` / `deleteBrandKit` — per-user brand kits (`brand_kits` table: palette, logo_url, font_display, font_body, is_default). Applying a kit overrides `content.palette` + `content.fontFamily` and (if present) `content.logo_url`.
- `sendDesignToRfq` — creates an `rfq_requests` row from a saved design; auto-mints a share token if missing and appends the share URL + design title into the RFQ message body.

## Editor (`src/components/design-studio.tsx`)
Three-column layout + page tabs (when `template.pages.length > 1`) + Brand Kits panel (apply / save current / per-kit logo upload) + Send-to-vendor (RFQ) dialog. Export PDF buttons: standard + Print-ready (bleed + crop marks).
