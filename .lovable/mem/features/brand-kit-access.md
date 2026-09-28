---
name: Owner-only Brand kit
description: Exact five-account allowlist, private asset/download rules, public logo exceptions, and required access tests
type: feature
---
The Brand page and full asset pack are private to Christopher and Adrian.

- Complete this after the current work and before Part 4 films are added to the Brand page.
- Remove the public footer `Logo files` link. Expose the Brand kit only from the owner console.
- Protect `/brand`, its page data, business-card list, full zip, private files, posters, and films on the server with the exact `OWNER_REPORT_ALLOWLIST`: Christopher's three accounts and Adrian's two accounts. Require verified sign-in but not 2FA. Never narrow the allowlist without asking Christopher.
- Signed-out visitors go to sign-in. Signed-in non-owners go home. Neither audience may receive Brand data.
- Remove `/api/public/brand-kit` and replace it with an authenticated owner-only route. The Brand card list must use an owner-only server call. Remove the public `listBusinessCards` list if unused, while preserving public single-card reads for `/card/$slug`.
- Keep public only logo assets used by the public site, public card pages, metadata, favicon/manifest, or email. Before moving files, audit local references and absolute `https://` URLs. Current known public dependencies include `kenroe-logo-horizontal-2400px-transparent.png` for card pages and generated email signatures, the Open Graph logo used by card metadata, `/favicon.svg`, root social preview, and email favicon references.
- Move the remaining print, social, and 3:4 pack assets to private storage and provide short-lived owner download links.
- Add `noindex` to `/brand` and exclude it from the sitemap.
- Part 4 adds all six films and posters to this owner-only page. Vertical cuts do not appear on the homepage.
- Test signed-out visitor, signed-in customer, and allowlisted owner access. First two see no link and cannot obtain the page, zip, list, or private assets. Owner sees all and every download works. Recheck header, favicon/social previews, email logos, public card pages, and card logos.
- Standing rules remain: no publishing, database restore, live Stripe, real email/SMS, or changes to event `sm7eduqe`.