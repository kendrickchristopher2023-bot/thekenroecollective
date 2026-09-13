# Go-live readiness + data reset

## What I verified

**Stripe — live account connected, but catalog is empty and checkout will fail.**
- All 5 go-live steps completed. Live account `acct_1TjFONBqqr2Clp1P`.
- `STRIPE_LIVE_API_KEY` and `PAYMENTS_LIVE_WEBHOOK_SECRET` are provisioned and authenticate through the gateway.
- Live catalog: 0 products, 0 active prices. Sandbox has 51 keyed prices (including `checkout_processing_fee_v1`).
- The app references ~46 lookup keys across tiers, add-ons, ads, and processing fees. Without recreating them in live mode, live checkout will fail with "price not found."
- Sandbox checkout is verified working (Whisper $5 + $1.50 processing fee = $6.50).

**Twilio — connected, but SMS still cannot send.**
- Connector linked; `TWILIO_ACCOUNT_SID` and `TWILIO_API_KEY` are present.
- Missing `TWILIO_AUTH_TOKEN` and `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_PHONE_NUMBER`).
- Queued messages stay `pending`, and STOP/HELP/status webhooks fail signature validation.
- The A2P 10DLC campaign was just submitted; US sends remain blocked until it is approved.

**Current data volumes:** 26 events, 26 contacts, 22 support tickets, 70 email log rows, 5 projects / 19 tasks, 4 RFQs, 3 announcements, 2 AI packages, 3 carts, 1 vendor, 1 ad placement, 3 ad impressions. No live subscriptions, no passes, no SMS rows.

## Plan

### 1. Recreate Stripe live product catalog (recommended next step)
I can recreate the live products/prices using the same lookup keys the app expects, matching current sandbox amounts. This includes:
- Tier prices: `postcard_yearly_v3`, `whisper_monthly_v3`, `whisper_yearly_v3`, `host_monthly_v3`, `host_yearly_v3`, `atelier_single_event_v2`
- Project Management add-on prices: `pm_solo_monthly`, `pm_solo_yearly`, etc.
- Ad prices: `ad_featured_monthly`, etc.
- Other add-ons: `branding_removal`, `photo_wall`, `gift_fund`, `sms_reminders`, `custom_domain`, etc.
- Processing fee: `checkout_processing_fee_v1` ($1.50 USD one-time)

After recreation, I'll run a verification pass confirming every lookup key in `src/lib/tier-config.ts`, `src/lib/ads.functions.ts`, and checkout allow-lists resolves to exactly one active live price.

### 2. Unblock SMS
Add the missing Twilio values as project secrets:
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID` (preferred, from the A2P messaging service) or `TWILIO_PHONE_NUMBER`

Then point the Twilio phone number / messaging service at the live webhook URLs:
- inbound: `/api/public/hooks/sms-opt-out-webhook`
- status callback: `/api/public/hooks/sms-status-webhook`

Verification: queue one text to your phone from an event, confirm it arrives, reply STOP, confirm auto-reply and opt-out status.

### 3. Data reset
Delete all seeded/test operational data, keeping user accounts, roles, pricing tiers, site settings, and the live Stripe catalog:

- Events and everything keyed to them: `events`, `event_addons`, `sms_outbox`, `ad_impressions`
- Contacts CRM: `contacts`, `contact_event_links`, `contact_group_members`, `contact_groups`, `contact_broadcasts`, `contact_broadcast_recipients`
- Projects: `pm_tasks`, `pm_task_comments`, `pm_task_attachments`, `pm_project_members`, `pm_invites`, `pm_projects`
- Marketplace: `rfq_messages`, `rfq_invitations`, `rfq_requests`, `vendors`, `vendor_reviews`, `ad_placements`, `vendor_search_cache`
- Content/AI: `ai_packages`, `ai_package_entitlements`, `design_assets`, `announcements`, `announcement_dismissals`, `media_uploads`
- Logs and reports feeding analytics: `email_send_log`, `support_tickets`, `support_messages`, `admin_notifications`, `admin_notification_reads`, `carts`, `cart_items`, `purchase_consent_log`, `host_data_consent_log`, `referrals`, `trial_attempts`, `trial_claims`, `data_cleanup_log`

Not touched: `profiles`, `user_roles`, `auth` users, `pricing_tiers`, `site_settings`, `discount_codes`, `disposable_email_domains`. Analytics zero out once these rows are deleted.

### 4. Remaining go-live gaps
- Confirm the custom email domain is verified and transactional sends are going out from the published (Live) app, not just preview.
- Confirm publish visibility is public and the published build carries the live payment token (`pk_live_...`).
- Wait for Twilio A2P campaign approval before marketing SMS functionality as live.

## Technical notes
Deletions run as ordered SQL through the data tool in child-before-parent order to respect foreign keys. Twilio values and Stripe live prices are stored as project secrets / gateway-managed resources, never in code. No app code changes are required for any of this.