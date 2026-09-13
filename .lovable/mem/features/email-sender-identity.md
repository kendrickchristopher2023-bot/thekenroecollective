---
name: Email and SMS sender identity
description: Guest-facing sends lead with host + event name, not the platform; DNS/deliverability facts for notify.thekenroecollective.com
type: feature
---

## Sender identity rule
Guest-facing email must never show "The Kenroe Collective" as the From display name.
`buildSenderName()` in `src/lib/email/sender-name.ts` is the single source: host override
(`event.senderName`) → `Host Name (Event title)` → event title → host → platform.
Pass `fromName` on every guest-facing `enqueueTransactionalEmailServer` call.
Address and signing domain never change (DMARC alignment must stay intact).

- Invitation subject: `You're invited: <event title>` (event name is the trust signal).
- Preview text carries occasion, date, venue.
- Body states who sent it and why they received it, above the fold.
- SMS body must name event + host first name (long code number is unknown to guests).

## Verified deliverability facts (2026-08-23)
- Sending subdomain `notify.thekenroecollective.com`, delegated to ns3/ns4.lovable.cloud.
- SPF `v=spf1 include:mailgun.org ~all`; DKIM selector `pdk1` (2048-bit, CNAME to
  dkim6.eu.mgsend.org); DMARC on subdomain `p=none`, root `p=quarantine`.
- Root domain SPF is Outlook-only with `-all`, so mail must never be sent with a
  root-domain envelope/Return-Path.
- Throughput: `email_send_state` batch_size 10, send_delay_ms 200, cron every 5s
  (~120/min). 200 invitations take roughly 100 seconds.
- SMS: Twilio A2P 10DLC long code, campaign QE2c6890da8086d771620e9b13fadeba0b VERIFIED.
