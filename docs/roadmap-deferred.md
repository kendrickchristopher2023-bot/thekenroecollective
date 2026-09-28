# Deferred work (post-demo)

## 1. Reconciliation bills children at adult rate — DONE
Fixed by `src/lib/party-fare.ts`, the single source of truth now shared by the
events store, the reconciliation report, payment reminders and payment
messaging. Covered by `tests/unit/party-fare.test.ts`.

## 2. Adult/child designation for named extra guests — DONE
- `PlusOne` now carries an optional `isChild` flag. Guests set it at RSVP via an
  Adult/Child toggle on each named plus-one; hosts can override it in the admin
  guest editor. `src/lib/party-fare.ts` bills child plus-ones at the child rate,
  and `src/lib/events-store.ts` (`billableAdults`, `billableChildren`,
  `partyMemberCount`, `memberRole`) renders them as kids in the seating chart
  and headcount reports. The Zod schema in `src/lib/events-sync.functions.ts`
  was widened so the flag survives cloud sync. Covered by `tests/unit/party-fare.test.ts`.

## 3. Duplicate detection on guest import + collapsed guest rows — DONE
- `src/lib/guest-duplicates.ts` matches on email, phone digits, name in either
  order, and one-typo names. The manual add on the Guests step now asks before
  creating a second row, so a double entry cannot silently inflate headcount,
  capacity or money owed. Covered by `tests/unit/guest-duplicates.test.ts`.
- Guest rows are compact by default. Address, dietary, accessibility, plus-one
  notes, shirt sizes, invite stamp and payment history sit behind a per-row
  "Details" toggle, with an "Expand all details" control under the list.

## 4. Plain-language confirm dialogs everywhere — DONE
Every remaining `window.confirm()` now goes through `confirmDialog()` in
`src/lib/confirm-dialog.tsx`: potluck item removal and duplicate sign-ups,
well-wish removal, photo-wall permanent delete, one-time pass refund, eCard
message deletion and eCard attachment removal (`confirmRemoveMedia` is async
and loads the dialog lazily so the module stays server safe). Each prompt has a
readable title, a sentence explaining the consequence, and a 44px Cancel /
confirm pair. Covered by `tests/unit/confirm-dialog.test.tsx`.

## 5. Accessibility & flow polish — DONE
- Mobile bottom tab bar: icons plus text labels, 56px targets.
- One consolidated mobile action dock (new event, help, undo, back, language,
  owner preview) instead of a stack of floating buttons.
- Plain-language confirm dialogs on every destructive action.
- Touch-comfort input rule in `src/styles.css`: on screens up to 640px every
  real text control renders at 16px (no iOS focus zoom) with a 44px minimum
  height; checkboxes, radios, sliders, colour and file pickers, and anything
  marked `data-compact` are excluded. Verified at 390px on /events/new,
  /events, /profile and a live event dashboard: zero fields under 44px or
  16px, no horizontal overflow, no console errors.
- Skeleton loaders and illustrated empty states with a single primary CTA are
  in place across events, studio, vendors, projects, contacts, reports and the
  admin panels.
