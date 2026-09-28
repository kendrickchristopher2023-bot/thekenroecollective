# T-shirts as a priced line item

Turn shirt sizes from a collection field into money: adult and youth prices, optional extra shirts, folded into the one "amount owed" number that the invite, the payment links and the reconciliation report all already read.

## What I confirmed in the code first

- `computeOwed(event, adults, children, adultOverride)` is the single owed formula: `perAdult × adults + perChild × kids`. `guestOwedAmount` wraps it, and **everything** downstream reads that one function: the live invite price line, `derivePaymentStatus`, `paymentReminderEligible`, `paymentReport` (billed/outstanding), and the reconciliation report. So shirts only need to enter in one place to flow everywhere, including the report you already have.
- Sizes live in one flat enum (`youth_s/m/l`, `adult_xs`…`adult_3xl`, plus `unsure`), tallied per person (guest + each named plus-one) by `tallyShirtSizes`.
- `public_update_guest` clamps plus-ones, adults, kids, pets and capacity server-side, but **does not validate `shirtSize` at all** today, so a hand-crafted request can already stash arbitrary text there. Since sizes are about to carry a price, this gets fixed in the same migration.

## Confirming your four recommendations

1. **Cap extras: yes, 10 per RSVP, server-enforced**, same shape as the pets ceiling, plus a per-size quantity cap of 10 so one row can't hold 10 × 99. Host-lowerable via `maxExtraShirtsPerRsvp`.
2. **Auto-accepted: yes, no approval step.** Extras are merchandise, not attendance: they do not touch headcount, capacity, the waitlist or the plus-ones allowance. This matters because an extra shirt must never push a party over capacity.
3. **Cost column on the shirt CSV: yes** — per-size unit price, quantity, line total, and a grand total row so it reconciles against a printer invoice.
4. **One addition of my own:** with pricing on, `unsure` is removed from the picker. An unpriceable size on a billed line item means either a wrong invoice or a free shirt, and "pick later" would be a hole a guest can walk through. Sizes stay optional when pricing is off, exactly as today.

## Data model

Event (host settings):
- `shirtPricingEnabled?: boolean` — separate from `tshirtSizesEnabled`, so a host can collect sizes without charging.
- `shirtPriceAdult?: number`, `shirtPriceYouth?: number` — same currency as `paymentCurrency`. Youth falls back to adult when blank, mirroring how `paymentAmountChild` already falls back.
- `extraShirtsEnabled?: boolean`, `maxExtraShirtsPerRsvp?: number` (default 10, ceiling 10).

Guest:
- `extraShirts?: { size: ShirtSize; qty: number }[]` — extras only. A person's own shirt stays on their existing `shirtSize` (guest and each plus-one), so nothing about the per-person cards changes shape.
- `payment.shirtAmount?: number` — **frozen snapshot** of the shirt charge, written when a payment link is sent or the first payment lands. Without this, a host editing the shirt price later silently rewrites what past guests owed and breaks paid/partial states in the report. Snapshot wins when present; live calculation is used before that.

## Payment calculation

New `shirtChargeForGuest(event, guest)` in `events-store.ts`:
- Skips `no` and `waitlisted` rows (same rule as the tally, so nobody is billed for a shirt they will not get).
- Prices the guest's own size + each named plus-one's size by adult/youth band.
- Adds every `extraShirts` line at `qty × band price`.
- Returns 0 unless `paymentEnabled && shirtPricingEnabled`.

`guestOwedAmount` becomes `attendance + shirts`, where attendance is today's `computeOwed` untouched and shirts is the snapshot if frozen, otherwise live. The per-guest `payment.amount` override stays an **attendance-fare override only**, so a comped fare does not accidentally comp shirts.

Consequences that fall out for free: `derivePaymentStatus`, reminder eligibility, the payment link amount, `paymentReport` billed/outstanding, and the reconciliation report all pick shirts up with no further change. The reconciliation report gains an itemized split (attendance vs shirts) so the two columns can be read against each other.

## Host UI

Inside the existing T-shirt sizes panel, revealed only when sizes are on:

```text
[x] Charge for T-shirts
    Adult sizes (XS-3XL)   $ [ 25 ]
    Youth sizes (S-L)      $ [ 18 ]   (blank = same as adult)
[x] Allow extra T-shirts
    Most extras per RSVP   [ 10 ]
```

Plus a live worked example under it, in words: "A party of 2 adults + 1 youth pays $50 attendance + $68 shirts = $118." A host must be able to see the total a guest will see, before anyone gets a link. A warning appears if shirt pricing is on while `paymentEnabled` is off, since nothing can be collected in that state.

## Guest RSVP UI

The per-person cards already being built get the price next to the size, so each person shows one honest line: **name, shirt size ($25), dietary**. No separate money section to hunt for.

Extras sit in their own block below the people, clearly labelled as spares so nobody thinks it adds a guest:

```text
Extra T-shirts (optional)
Spare shirts, or one for someone who can't make it. These don't add guests.
  Adult L   [ - ] 2 [ + ]   $50      [Remove]
  Youth M   [ - ] 1 [ + ]   $18      [Remove]
  [ + Add another shirt ]              7 of 10 left
```

44px steppers, size chosen from a plain select, quantity never typed. The running total below becomes itemized rather than a single figure:

```text
2 adults × $25                 $50
1 kid × $15                    $15
Shirts (3)                     $68
Extra shirts (3)               $68
────────────────────────────────────
Total due                     $201
```

It updates on every change exactly like the current price line, and the same total is what the payment link charges.

## Server enforcement (one migration, `public_update_guest`)

- Clamp `shirtSize` on the guest and every plus-one to the enum; anything else becomes null. Fixes the existing hole.
- Validate `extraShirts`: array of `{size, qty}` only, size must be in the enum, `qty` clamped to 1-10, total quantity clamped to the host's max (ceiling 10), lines beyond that dropped.
- Force `extraShirts` to empty when `extraShirtsEnabled` is off or shirt sizes are off, the same way kids and pets are zeroed when their toggles are off.
- Extras never enter the `party`/capacity maths.

## Tests

Unit coverage for `shirtChargeForGuest` (bands, youth fallback, declined rows excluded, extras, snapshot precedence), `guestOwedAmount` composition, the shirt CSV cost columns and grand total, and cap clamping. Then live verification on a phone-width invite with a real 2-adult + 1-youth + 2-extras RSVP, checking the itemized total matches the link amount and the reconciliation report.

## Open question

Refunds when a guest downgrades after paying (drops a plus-one, so a shirt disappears): I plan to leave the frozen amount alone and surface it to the host as "owes less than paid" in the report they already have, rather than auto-refunding. Say the word if you want an automatic refund path instead.
