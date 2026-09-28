---
name: Umbrella brand hub at /
description: Root domain is The Kenroe Collective umbrella/ventures splash; events marketing homepage lives at /gatherings; ventures table drives the hub list
type: feature
---
# Umbrella hub vs. events product

- `/` = The Kenroe Collective umbrella splash ("Introducing…" staggered reveal). Reads
  `public.ventures` (name, tagline, href, cta_label, is_external, status, visible,
  sort_order, accent) via `listVentures` in `src/lib/ventures.functions.ts`, with a static
  fallback list. New ventures are added as table rows — no deploy needed.
- `/gatherings` = the events product marketing homepage (was `/`). `/events` remains the
  signed-in events dashboard.
- SiteNav logo, mobile tab bar Home, cmd palette "Events home", floating dock home, and
  auth default landing all point at `/gatherings`. The `/` hub is reached from the
  SiteFooter "Kenroe Collective Ventures →" link and the Collective mega-menu.
- SEO: bare domain indexes the holding-company copy; events keywords live on
  `/gatherings` (own canonical + og:url). `__root.tsx` defaults use umbrella wording.
