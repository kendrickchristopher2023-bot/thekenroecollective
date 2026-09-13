# Make demo vs live unmistakable

## What is actually happening

Nothing is broken in the app, and it has nothing to do with your other browser tabs.

The hosting edge redirects `demo.thekenroecollective.com` to the primary domain before the request ever reaches the app. Verified just now:

```text
GET https://demo.thekenroecollective.com/       -> 302 https://thekenroecollective.com/
GET https://demo.thekenroecollective.com/demo   -> 302 https://thekenroecollective.com/demo
```

So the demo subdomain can never stay in the address bar. Demo mode is instead a per-browser opt-in cookie set by visiting `/demo`. Because you landed on the bare domain root, no cookie was set, and you were in the real production app the whole time. The path is preserved through the redirect, so `demo.thekenroecollective.com/demo` does work; the bare root does not.

The real gap: there is no always-visible way to tell which mode you are in, and no easy way to leave demo mode.

## The fix

1. **Environment chip, always visible.** A small persistent pill in the header: amber "DEMO" when demo mode is on, and (for signed-in owners only) a neutral "LIVE" chip on production. No more guessing.
2. **Stronger demo banner.** Make it sticky at the top instead of scrolling away, and add an "Exit demo" button that clears the cookie and reloads. Currently leaving demo requires typing `/demo?off=1`.
3. **Demo entry that cannot miss.** Accept `?demo=1` on any URL as a demo opt-in, so both `thekenroecollective.com/?demo=1` and the bare `/demo` path work. Show a brief confirmation ("Demo mode on") after the switch rather than a silent redirect.
4. **Owner bookmark card.** On the owner console, a small "Environments" card with two one-click buttons: Enter demo / Exit demo, plus the exact URL to bookmark for the call.
5. **Sanity check before the call.** Verify in a real browser that entering demo shows the chip, seeded demo data, and test-mode payments, and that exiting returns to your live data untouched.

## Before the call: everything else pending

Nothing on the critical path is broken. Verified recently: sending (email + SMS), reports at 212-guest scale, RSVP flow, photo wall, the event-cache ownership leak fix.

Deliberately deferred until after the call (all touch the demo path or the guest list at scale):

- Duplicate detection on manual guest add
- Collapse guest rows by default at 200+ guests
- Namespace the event cache by user id

Approved queue not yet started: multi-event series (investigation only) and the registry/gift-list link.

Recommendation for today: do items 1 to 5 above only, publish, then leave the rest until after the call.

## Technical notes

- `src/lib/demo-mode.ts` keeps the isomorphic detection; add `?demo=1` handling and an `exitDemo()` helper there.
- `src/components/demo-banner.tsx` becomes sticky and gains the exit control; extract the chip into a small `EnvironmentChip` rendered from `src/routes/__root.tsx`.
- `src/routes/demo.tsx` keeps setting the cookie and gains the confirmation state.
- No database, RLS, or migration changes. No changes to any host's event data.
