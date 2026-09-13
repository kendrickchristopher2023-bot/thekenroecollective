---
name: Atelier trial v2
description: 60-day, 20-guest one-time Atelier trial with multi-layer anti-abuse (email/device/IP/disposable). Upgrade to Atelier for more.
type: feature
---
- Trial: 60 days, 20 guests, one-time per person (ever). No card.
- Anti-abuse layers (DB-enforced in claim_atelier_trial):
  - One claim per auth.uid() (subscriptions + profiles.atelier_trial_used)
  - One claim per email_hash (trial_claims unique)
  - One claim per device_hash within 365 days
  - One claim per ip_hash within 365 days
  - Disposable email domain block (public.disposable_email_domains lookup)
  - 3-blocked-attempts/hour rate limit per email and per IP
  - Prior paid sub of any kind blocks trial (new-customer-only)
- Trial events: hard cap 20 guests enforced by enforce_atelier_trial_guest_limit trigger AND server validation in events-sync.functions.ts.
- Price ID stays "atelier_trial_30d" for back-compat with subscriptions table; copy says "Atelier trial".
- Upgrade CTA always available alongside the Start free trial button.
