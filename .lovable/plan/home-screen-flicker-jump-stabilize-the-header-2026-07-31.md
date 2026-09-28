# Home screen "flicker / jump" — stabilize the header

## What you're seeing

It is not a full page reload. On the home screen the header renders in three
stages, and the last two pop in a fraction of a second apart, which reads as a
refresh or jump:

1. First paint: the right side of the header renders **nothing** while the
   session is still being read (`site-nav.tsx` returns `null` until auth is
   ready).
2. Session resolves: the divider, selections drawer, a notification bell, and
   the account menu all appear at once, widening the header row.
3. Role check resolves (owner/admin lookup): the bell can swap kind and the
   owner/admin menu can appear, shifting the row a second time.

Because it depends on network timing for the session and role calls, it only
shows up occasionally — matching what you described.

Separately, in the Lovable preview pane the page genuinely does reload when I
save edits during a session. That is expected in preview only and does not
happen on the published site.

## The fix (presentation only)

Reserve stable space instead of rendering nothing, so nothing shifts:

1. **Desktop right side** — while auth is unresolved, render a fixed-width
   placeholder matching the signed-in control cluster instead of `null`. Same
   height, same width, no visible content.
2. **Signed-out state** — keep the Sign in button in the same slot so the swap
   between placeholder and either state is width-stable.
3. **Role-dependent controls** — reserve the space the owner/admin menu and
   bell occupy until the role check resolves, so stage 3 fills a slot rather
   than inserting a new one.
4. **Mobile header/dock** — apply the same reserved-slot treatment to the
   mobile menu trigger and `mobile-action-dock.tsx`, which resolves auth and
   owner status the same way.

No refactor of auth logic, no changes to data fetching, no styling redesign.

## Verification before I report back

- Drive the home screen in a headless browser with the network throttled, take
  screenshots at first paint, after session resolve, and after role resolve,
  and confirm the header geometry is identical in all three.
- Confirm no navigation entry or reload is recorded during a 30-second idle on
  the home screen.

## Technical notes

- `src/components/site-nav.tsx` line ~118: `!authReady ? null : email ? … : …`
  is the primary shift source; `showAdmin`/`isOwner` from the `meIsOwner()` /
  `meIsAdmin()` effect is the secondary one.
- `src/hooks/use-auth-ready.ts` already filters `TOKEN_REFRESHED` /
  `INITIAL_SESSION`, so tab-focus refetch storms are not the cause — leave it
  as is.

## Anything else before go-live

- A2P campaign is still In Review; outbound US SMS keeps failing 30034 until
  carriers approve. Nothing to fix in the app.
- After approval, send one reminder and confirm `sms_outbox` gets a
  `provider_sid` and reaches delivered.
