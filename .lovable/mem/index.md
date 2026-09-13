# Project Memory

## Core
Owner/admin dashboard for managing all events in the system. Dark theme, Apple-like minimal. Primary #3B82F6, bg #0F172A. SF Pro Display headings, Inter body. Never serif. Supabase with RLS. Deployed on Lovable.
NEVER trigger a database restore for any reason: full-database, schema-reverting, irreversible. Stop and let Christopher decide and execute.
Internal auth, checkout, pricing, profile, and event flows must never force refreshes or wipe typed form/event state.
After every app update, explicitly check for unintended page reloads/navigation resets before finishing.
Always test UI fixes before claiming completion; repeated mobile/floating-control issues require visible verification.
Pricing is source-of-truth in `pricing_tiers` table + curated ADDONS in `src/routes/pricing.tsx` and CATALOG in `src/components/event-addons-panel.tsx`. Never surface a $0 tier card. Any new Stripe lookup_key must be added to VALID_PRICES in `src/routes/checkout.index.tsx`.
Guest-facing email/SMS must lead with host + event name (never "The Kenroe Collective") via buildSenderName in src/lib/email/sender-name.ts.
All AI Gateway text calls use one model: `google/gemini-3.6-flash`. No preview models, no mixed ids.
Ban/delete users and granting the owner/admin roles are `super_admin`-only (Christopher); plain owners never see those controls.
Root `/` is the umbrella ventures splash; the events marketing homepage lives at `/gatherings` (`/events` stays the dashboard).
Projects ("The Workroom", Venture 03) is a standalone product at `/workroom` — never require an Events plan for it; flat 5 seats (20 Atelier), bigger teams go to `/contact`.
Last known-good published build: 2026-08-20 walk-ins + party check-in. Latest checkpoint: 2026-08-27 timezone hardening + countdown + reports + vendor RLS (preview; see release checkpoints memory).
Customer `/whats-new` (product_updates) = buyer-impacting changes only; owner/admin-internal changes go to admin `/dev-changelog` only. Scope test: does this change something a host experiences?

## Memories
- [No database restore](mem://features/no-database-restore) — Permanent ban on agent-triggered Cloud database restores
- [Kenroe Sound Studio](mem://features/sound-studio) — Venture 05 standalone music/poem studio at /music: coming soon publicly, owner-only unlimited private preview
- [Release checkpoints](mem://features/release-checkpoints) — Known-good published builds and what each contained, for safe reverts
- [Roadmap queue](mem://features/roadmap-queue) — Approved build order: guest search/filter, admin reporting, co-host access, event series, post-event analytics, registry link
- [Homepage collection films](mem://features/homepage-films) — Part 4 after Parts 1-3, approved scripts, A Southern Gentleman narrator (replaced Edwin), Application Kit naming, horizontal/vertical exports, Brand downloads
- [Owner-only Brand kit](mem://features/brand-kit-access) — Exact five-account allowlist, private logo/film downloads, public asset exceptions, and access tests
- [Umbrella hub](mem://features/umbrella-hub) — Root `/` ventures splash, `ventures` table, `/gatherings` events homepage, link/SEO audit
- [Demo mode](mem://features/demo-mode) — demo.* hostname sandbox: forced Stripe sandbox, inert SMS, blocked destructive actions, seeded demo host, nightly reset
- [Owner MFA requirement](mem://features/owner-mfa) — mandatory TOTP for owner/super_admin, aal2 enforced server-side, blocking enroll gate on owner routes
- [Pricing model & add-ons](mem://features/pricing-model) — Tier ladder, per-event vs account add-ons, watermark rule, checkout allow-list guardrails
- [Owner events dashboard](mem://features/owner-events-dashboard) — Admin console for owners to search, view, edit, archive, and bulk-manage all events
- [Admin/owner reporting upgrade](mem://features/admin-owner-reporting) — Approved toolbar/pagination/filter/CSV scope for owner report + admin list views, Users panel truncation bug
- [Owner error monitoring](mem://features/owner-error-monitoring) — app_error_logs table, owner-only Error monitoring tab, announcement owner/host split, analytics date ranges
- [Super admin role](mem://features/super-admin) — super_admin-only ban/delete users, owner/admin role granting, admin_audit_log
- [Projects as Venture 03](mem://features/project-management) — Standalone Workroom venture: /workroom landing, own pricing tab, flat 5-seat cap, event linking gate
- [Streaming music limits](mem://features/streaming-music-limits) — Spotify/Apple/Amazon: official embed players only, never synced or mixed with our audio
- [Wall soundtrack access](mem://features/wall-soundtrack-access) — Soundtrack is owner-only internal, one switch to re-open to customers
- [Admin roles](mem://features/admin-roles) — User roles table (admin, owner, user) with has_role security definer function
- [Email sender identity](mem://features/email-sender-identity) — Host-led From names, subject/preview rules, verified SPF/DKIM/DMARC and send-rate facts
- [Email templates](mem://features/email-templates) — Thank-you card and event announcement templates with Giphy GIF support
- [AI support chat](mem://features/ai-support) — Support widget with pricing/guest count accuracy rules
- [AI model standard](mem://features/ai-model-standard) — Single AI Gateway model id across all AI features
- [Event archive system](mem://features/event-archive) — Soft-delete via archived_at column, restore and permanent delete options
- [Payment integration](mem://features/payments) — Stripe checkout with embedded form, gift fund support
- [Vendor hub](mem://features/vendor-hub) — Vendor profiles and reviews
- [Vendor auth stability](mem://features/vendor-auth-stability) — Vendor discovery/search must not refresh, redirect, or sign users out during public browsing/search
- [Navigation and auth stability](mem://features/navigation-auth-stability) — Event creation and app navigation must never force refreshes, auth bounce loops, or lose typed form data
- [Check-in system](mem://features/checkin) — QR-based event check-in, walk-ins, party-level headcount check-in
- [Seating chart](mem://features/seating-chart) — Event seating arrangement tool
- [Calendar sync](mem://features/calendar-sync) — ICS export for events
