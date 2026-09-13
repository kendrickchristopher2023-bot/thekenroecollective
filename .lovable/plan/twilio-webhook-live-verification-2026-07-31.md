# Twilio Webhook Live Verification

Your saved URLs are confirmed correct:

- Inbound Request URL: `https://thekenroecollective.com/api/public/hooks/sms-opt-out-webhook`
- Delivery status callback: `https://thekenroecollective.com/api/public/hooks/sms-status-webhook`

The Messaging Service is not readable through the Twilio API connector, so the only
way to prove the wiring works is a real message round-trip.

## Test 1 — Endpoints are reachable and rejecting unsigned calls

I POST an unsigned request to both public hook URLs on the live site.

Expected: HTTP 403 "Invalid signature" from each. That proves the routes are
deployed, live, and that signature verification is active. A 404 would mean the
published build predates the routes; a 503 would mean `TWILIO_AUTH_TOKEN` is not
reaching the server runtime.

## Test 2 — Real inbound STOP / START (needs your phone)

1. From a real mobile phone, text `STOP` to **+1 (980) 399-4670**.
2. You should receive the unsubscribe auto-reply.
3. I query `sms_consent_log` for that number and confirm `opted_out = true`.
4. Text `START` to the same number, confirm the re-subscribe auto-reply, and I
   verify `opted_out` flipped back to `false`.
5. Text `HELP` and confirm the help auto-reply arrives.

If the auto-reply does not arrive but the number is correct, the inbound webhook
is not firing (service integration not saved, or number not attached to the
Messaging Service).

## Test 3 — Outbound status callback

Once A2P approval lands, send one SMS from an event's SMS reminders panel to your
own phone, then I check that row in `sms_outbox`: `provider_sid` populated and
`status` progressing to `sent` after Twilio's delivery callback. Until A2P is
approved, outbound sends to US numbers will error with a 30034-class code — that
is expected and not a webhook problem.

## Notes

- Number-level `sms_url` / `status_callback` on +19803994670 are intentionally
  blank; the Messaging Service settings take precedence.
- No code changes are part of this plan. It is verification only. If a test
  fails, I will report the exact failure and propose a separate fix.
