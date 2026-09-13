# Resubmit the SMS campaign (error 30909) and fix the misleading SMS panel copy

Production now serves the public consent-verification page, so the rejected campaign can be corrected and resubmitted.

## Verified live just now

- `https://thekenroecollective.com/sms-opt-in-evidence` → 200, renders the real consent checkbox (unchecked by default) plus links to Terms, Privacy, and the SMS policy
- `https://thekenroecollective.com/sms-terms` → 200
- `/sitemap.xml` → 200 and now lists both compliance pages

## 1. Resubmit the rejected campaign to Twilio

The campaign is `FAILED` with error `30909` scoped to the `MESSAGE_FLOW` field only. The brand is already approved, so nothing about the brand changes.

Update the existing campaign in place (editing avoids a second vetting fee) with the corrected message flow — 2033 characters, under Twilio's 2049 limit — which now:

- names both opt-in paths in one field: host-collected consent confirmed by the in-product checkbox, and keyword opt-in via START / YES / UNSTOP
- quotes the exact checkbox wording and states it is unchecked by default
- cites the new public evidence URL as the reviewer-verifiable proof of the consent experience, since guest entry itself happens inside a host account
- links Terms and Privacy explicitly, and states that the privacy policy covers non-sharing of mobile data, message frequency, and message-and-data-rates

Then confirm the campaign flips from `FAILED` to `IN_PROGRESS` / `PENDING` and report the new status back.

## 2. Fix the SMS panel copy that overstates readiness

The reminders panel currently decides what to tell hosts based only on whether Twilio credentials exist on the server. Because credentials are present but the campaign is not approved, a paying host is told "queued messages send within a minute via Twilio" when in reality nothing will be delivered.

Change the panel so its status text reflects carrier approval rather than credential presence:

- when the campaign is not yet approved, say plainly that SMS delivery is pending carrier approval and queued messages will send automatically once approved
- keep the existing behaviour otherwise — messages still queue safely and nothing is lost
- drop the A2P registration warning banner in favour of this clearer single status line

This is copy and status only. No change to the queueing logic, the tier gating, the $6 SMS add-on entitlement, or the drain worker.

## Technical notes

- Campaign `QE2c6890da8086d771620e9b13fadeba0b` on messaging service `MG311d40676255daa0b49bbb2bd2421e77`; brand `BNce16dcddc365efaca35ddc650b15c440` is `APPROVED` / `VERIFIED`. Update via `POST https://messaging.twilio.com/v1/Services/{service}/Compliance/Usa2p/{campaign}` with the corrected `MessageFlow`.
- `getSmsProviderStatus` in `src/lib/sms.functions.ts` gains a second flag distinguishing "credentials configured" from "campaign approved" (server-side constant, flipped when Twilio approves), consumed by `src/components/sms-reminders-panel.tsx`.

## Timeline expectation

Resubmission enters a fresh review at The Campaign Registry. The brand is `STANDARD`, and Twilio documents Standard campaigns as taking days up to several weeks. This will not clear before Christopher's launch — plan to launch with SMS reminders queueing but not delivering, which the copy fix above communicates honestly.
