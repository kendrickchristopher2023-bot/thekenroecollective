# Demo on kenroes.com, delete/ban verification, launch readiness

## 1. Using kenroes.com for the demo

Short answer: yes, but as a **subdomain**, not a redirect.

Demo mode is triggered by hostname. The app already treats `demo.kenroes.com` as a demo host (it is in the hard-coded list alongside `demo.thekenroecollective.com` and `demo.kenroecollective.com`), and any `demo.` prefix works automatically.

A plain redirect from `kenroes.com` to the demo does **not** work: a redirect lands the visitor on the target hostname, so if it redirects to the main app the browser hostname is the production host and demo mode never activates (live Stripe token, real SMS, no banner). Demo mode must be served on a demo hostname.

Currently connected: `kenroecollective.com`, `www.kenroecollective.com`, `thekenroecollective.com`, `www.thekenroecollective.com`, `www.kenroes.com`. The apex `kenroes.com` is not connected.

Recommended setup:
- Add `demo.kenroes.com` in Project Settings > Domains (A record `185.158.133.1` plus the `_lovable` TXT value shown in that dialog).
- Optionally connect apex `kenroes.com` and point it at the demo too, if you want the bare brand domain to be the demo entry point. If you want that, `kenroes.com` gets added as its own domain and I add it to the explicit demo-host list in `src/lib/demo-mode.ts`.

Decide which you want; the code change is one line either way.

## 2. Delete/ban cascade — already built, so this step is verification

The tiered plan you were waiting to approve is already implemented in the app:
- Ban / unban with 24h, 7d, 30d, permanent presets; sessions revoked; red "banned until" badge and Unban button in the owner Users tab.
- Pre-flight footprint report (active/archived events, vendor profiles, reviews received, open RFQ threads, shared projects, subscriptions, passes, contacts) with hard blockers listed in plain English.
- Soft delete: archives their events, blanks the profile, deletes their personal CRM rows, permanently bans, and marks `deletion_requested_at` so the existing 30-day cron performs the real auth deletion.
- "Delete now (irreversible)" only appears when the footprint count is zero.
- Email-typing confirmation, self-protection, last-owner / last-super-admin protection, and an audit-log entry for every action.

So the work here is a live end-to-end verification pass rather than new code:
1. Create a throwaway account, run the pre-flight, confirm counts match reality.
2. Ban it, confirm sign-in is refused and the badge shows; unban, confirm access returns.
3. Give it an event plus a shared project, re-run pre-flight, confirm the blocker list appears and delete is refused.
4. Clear the blockers, soft-delete, confirm events are archived, profile blanked, `deletion_requested_at` set, and audit rows written.
5. Confirm a plain owner (Adrian) sees none of these controls and a direct server-function call from a non-super-admin session is rejected.

Any defect found in that pass gets fixed in the same step.

## 3. Launch readiness after the Twilio campaign

Twilio approval is not the last blocker. Still outstanding:

**Hard blockers**
- **Stripe live catalog is empty.** 0 live products / 0 active live prices, while the app references ~46 lookup keys. Live checkout will fail with "price not found" until the live catalog is recreated with the same keys and amounts (including `checkout_processing_fee_v1`). This is the single biggest launch blocker.
- **Twilio secrets.** `TWILIO_AUTH_TOKEN` and `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_PHONE_NUMBER`) are still missing, and the inbound/status webhook URLs need to be pointed at the live app. Campaign approval alone does not make sends work.

**Should be done before launch**
- Test/seed data reset (26 events, 26 contacts, 22 tickets, email logs, demo projects/RFQs) so analytics start clean.
- Confirm the published build carries the live payment token and that publish visibility is public.
- Confirm transactional email is sending from the verified custom domain on the published app, not just preview.
- Owner MFA: enroll TOTP on both owner accounts before launch, otherwise the owner console locks itself.
- One live smoke pass on the published URL: signup, create event, invite, RSVP, paid checkout, refund path.

## Technical notes

- Demo host allow-list lives in `EXPLICIT_DEMO_HOSTS` in `src/lib/demo-mode.ts`; server-side detection reads the forwarded Host header in `src/lib/demo-mode.server.ts`.
- Ban/delete server functions are in `src/lib/super-admin.functions.ts`; UI in `src/components/admin/super-admin-user-actions.tsx`.
- Live Stripe price recreation runs through the payments tooling with lookup keys mirrored from sandbox; no app code changes needed.
- Data reset runs as ordered SQL, child-before-parent, keeping accounts, roles, pricing tiers and site settings.
