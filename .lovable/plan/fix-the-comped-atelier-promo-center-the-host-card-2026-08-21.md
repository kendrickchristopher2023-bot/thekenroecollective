# Fix the comped Atelier promo + center the host card

## What's actually wrong

I checked the live account behind the event being edited right now (`Mrsmkendrick@gmail.com`, event `sm7eduqe`) and the promo never landed on her account:

- Her profile plan is `postcard`
- She has no subscription row at all
- She has no one-time event pass
- Her only role is plain `user`

So the app is behaving correctly: with no entitlement record, Event themes, Custom invite artwork and Invite frames all show the "Upgrade to Whisper" gate, exactly as in the screenshot. Nothing is broken in the gating code, the comp simply was never recorded.

## Fix 1: actually grant the Atelier comp (90 days)

Give her account a comped Atelier plan the same way the existing owner tool does it: an `active` subscription row on the Atelier plan with a 90-day period end, plus mirroring `atelier` onto her profile so the gates unlock immediately. Purely additive, nothing is deleted or overwritten.

One real robustness issue to fix while doing this: comped plans are stamped as `live` only, and entitlement reads filter by payment environment. On any non-live environment her comp would silently disappear and she'd see the upgrade walls again. I'll make comped/manual plans environment-agnostic on the entitlement read so a comp always counts.

Verification: re-read her entitlements after the grant and confirm the effective plan resolves to `atelier`, and confirm themes/artwork/frames render unlocked instead of the upgrade gate. No live browser test against her session while she's mid-edit; verification will be read-only plus a check with a separate account.

## Fix 2: center the host photo card

On the invite page the hosts sit in a 1/2/3-column grid, so a single host card hangs on the left edge instead of sitting under the centered "Hosted by" label. I'll center the row when there are only one or two hosts, keeping three-across for larger host lists. Card contents are already centered, so this is a layout-only change.

## What I'd also recommend

1. **Comp visibility**: the owner console shows the plan but not that it's comped or when it lapses. Add a "Comped, ends {date}" marker so a promo can't quietly expire on a customer mid-event.
2. **Owner comp tool has a lookup ceiling**: the grant-a-plan tool matches the customer by scanning only the first 200 accounts. Past 200 users it will report "no user found" and comps will silently fail to apply, which is a plausible explanation for how this one got lost. Worth fixing.
3. **Expiry warning for the customer**: a gentle in-app note a week before a comp ends, so she isn't surprised by a wall appearing on her event.

I'd do 1 and 2 with this work if you want them; 3 is optional.

## Technical notes

- Grant: insert into `subscriptions` (`price_id: atelier_monthly`, `status: active`, `product_id: manual_atelier`, `current_period_end` = now + 90 days) for her user id, and `update profiles set tier = 'atelier'`. No deletes, no migrations.
- `meEntitlements` in `src/lib/pricing.functions.ts`: keep rows whose `product_id` starts with `manual_` regardless of the environment filter.
- `src/routes/invite.$eventId.tsx` host grid: center the grid for short host lists.
